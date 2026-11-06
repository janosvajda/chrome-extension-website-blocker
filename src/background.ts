import {getPureHostname} from './helper/getPureHostname';
import {
    BlockedEntry,
    CoveredUrlRuleAction,
    CoveredUrlRuleInfo,
    NormalizedBlockedEntry,
    RuleSchedule,
    applyCoveredUrlRuleAction,
    blockedEntryCovers,
    findCoveredUrlRules,
    getCoveredUrlRuleInfo,
    hostnameMatchesDomain,
    normalizeBlockedEntry,
    normalizeUrlForMatch,
    requiresBlockScopeChoice,
    sameCoveredUrlRuleInfo,
} from './helper/blockedEntry';
import {incrementStatistics, normalizePausedUntil, STORAGE_KEYS} from './helper/extensionState';
import {
    ADD_CURRENT_SITE_RULE,
    AddCurrentSiteRuleRequest,
    AddCurrentSiteRuleResponse,
    ENABLE_CURRENT_SITE_RULE,
    EnableCurrentSiteRuleRequest,
    EnableCurrentSiteRuleResponse,
} from './helper/backgroundMessages';
import {
    findNextAvailableTime,
    isScheduleActive,
    migrateLegacyScheduleGroups,
    normalizeRuleSchedule,
    normalizeRules,
} from './helper/schedules';
import {showRuleChoiceDialog, showScheduledDomainOverrideDialog} from './background/dialogs';

chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.get(['blocked', 'enabled'], (local) => {
        if (!Array.isArray(local.blocked)) {
            chrome.storage.local.set({blocked: []});
        }
        if (typeof local.enabled !== 'boolean') {
            chrome.storage.local.set({enabled: true});
        }
    });
});

// Initialize a dictionary to keep track of blocked tabs
const blockedTabs: Record<number, boolean> = {};
let blockedHostnames = new Map<string, RuleSchedule | undefined>();
let blockedUrls = new Map<string, RuleSchedule | undefined>();
let blockingEnabled = true;
let blockingPausedUntil = 0;
let pendingStatisticsUpdates = 0;
let statisticsUpdateInProgress = false;

export function rebuildBlockedHostnames(blockedList) {
    blockedHostnames = new Map<string, RuleSchedule | undefined>();
    blockedUrls = new Map<string, RuleSchedule | undefined>();
    normalizeRules(blockedList).forEach((website) => {
        if (!website || !website.enabled) {
            return;
        }
        const normalized = normalizeBlockedEntry(website.name || '', website.scope);
        if (!normalized) {
            return;
        }
        if (normalized.scope === 'url') {
            blockedUrls.set(normalized.name, website.schedule);
            return;
        }
        blockedHostnames.set(normalized.name, website.schedule);
    });
}

export function shouldBlockHostname(hostname: string, date = new Date()): boolean {
    for (const [domain, schedule] of blockedHostnames) {
        if (hostnameMatchesDomain(hostname, domain) && isScheduleActive(schedule, date)) {
            return true;
        }
    }
    return false;
}

export function resetBlockedStateForTest(): void {
    blockedHostnames = new Map<string, RuleSchedule | undefined>();
    blockedUrls = new Map<string, RuleSchedule | undefined>();
    blockingEnabled = true;
    blockingPausedUntil = 0;
    pendingStatisticsUpdates = 0;
    statisticsUpdateInProgress = false;
    Object.keys(blockedTabs).forEach((key) => {
        delete blockedTabs[Number(key)];
    });
}
chrome.runtime.onInstalled.addListener(function() {
    chrome.contextMenus.removeAll(() => {
        void chrome.runtime.lastError;
        chrome.contextMenus.create({
            id: 'blockPage',
            title: 'Block this page by Tiny Blocker',
            contexts: ['page'],
            documentUrlPatterns: ['http://*/*', 'https://*/*']
        }, () => {
            void chrome.runtime.lastError;
        });
    });
});

const initialRulesReady = new Promise<void>((resolve) => {
    chrome.storage.local.get({ blocked: [], enabled: true, pausedUntil: 0, schedules: [] }, (data) => {
        const migrated = migrateLegacyScheduleGroups(data.blocked, data.schedules);
        const storedBlocked = migrated.blocked;
        if (migrated.migrated) {
            chrome.storage.local.set({blocked: storedBlocked, schedules: []});
        }
        rebuildBlockedHostnames(storedBlocked);
        blockingEnabled = data.enabled !== false;
        blockingPausedUntil = normalizePausedUntil(data.pausedUntil);
        resolve();
    });
});

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') {
        return;
    }
    if (changes.blocked) {
        const changedBlocked = Array.isArray(changes.blocked.newValue) ? changes.blocked.newValue : [];
        rebuildBlockedHostnames(changedBlocked);
    }
    if (changes.enabled) {
        blockingEnabled = changes.enabled.newValue !== false;
    }
    if (changes.pausedUntil) {
        blockingPausedUntil = normalizePausedUntil(changes.pausedUntil.newValue);
    }
});

// Function to block the page
export function blockPage(tabId, pageUrl) {
    if (!isBlockingActive() || pageUrl.startsWith('chrome-extension://')) {
        return;
    }
    const now = new Date();
    const hostname = getPureHostname(pageUrl);
    const normalizedUrl = normalizeUrlForMatch(pageUrl);
    const hasUrlRule = Boolean(normalizedUrl && blockedUrls.has(normalizedUrl));
    const urlSchedule = hasUrlRule ? blockedUrls.get(normalizedUrl!) : undefined;
    const domainSchedules: Array<RuleSchedule | undefined> = [];
    for (const [domain, schedule] of blockedHostnames) {
        if (hostnameMatchesDomain(hostname, domain)) domainSchedules.push(schedule);
    }
    const matchingSchedules = hasUrlRule
        ? [urlSchedule, ...domainSchedules]
        : domainSchedules;
    const availableAt = findNextAvailableTime(matchingSchedules, now)?.getTime();

    if (hasUrlRule && isScheduleActive(urlSchedule, now)) {
        blockTabWithReason(tabId, 'url', warningLabelForUrl(normalizedUrl!), availableAt);
        return;
    }
    if (shouldBlockHostname(hostname, now)) {
        blockTabWithReason(tabId, 'domain', hostname, availableAt);
        return;
    }
}

export function isBlockingActive(now = Date.now()): boolean {
    return blockingEnabled && normalizePausedUntil(blockingPausedUntil, now) === 0;
}

// Add a listener for context menu item clicks
chrome.contextMenus.onClicked.addListener(function(info, tab) {
    if (info.menuItemId === 'blockPage') {
        const pageUrl = tab.url;
        const tabId = tab.id;
        if (!pageUrl || pageUrl.startsWith('chrome://') || pageUrl.startsWith('chrome-extension://')) {
            return;
        }
        chrome.storage.local.get({enabled: true, pausedUntil: 0, blocked: []}, (state) => {
            const currentBlocked = usableBlockedEntries(state.blocked);
            const domainEntry = normalizeBlockedEntry(pageUrl, 'domain');
            const existingDomain = domainEntry
                ? currentBlocked.filter((item) =>
                    item.enabled
                    && (item.scope || 'domain') === 'domain'
                    && blockedEntryCovers(item, domainEntry)
                ).sort((first, second) => second.name.length - first.name.length)[0]
                : null;
            const existingSchedule = normalizeRuleSchedule(existingDomain?.schedule);

            if (existingDomain && existingSchedule && !isScheduleActive(existingSchedule)) {
                decideScheduledDomainOverride(
                    tabId,
                    existingDomain.name,
                    formatScheduleForContextMenu(existingSchedule)
                ).then((replaceSchedule) => {
                    if (!replaceSchedule) return;
                    const scheduledDomain = normalizeBlockedEntry(existingDomain.name, 'domain');
                    if (scheduledDomain) applyContextMenuRule(tabId, scheduledDomain, true);
                });
                return;
            }

            decideBlockScope(tabId, pageUrl).then((scope) => {
                if (!scope) {
                    return;
                }
                const normalizedEntry = normalizeBlockedEntry(pageUrl, scope);
                if (!normalizedEntry) {
                    return;
                }
                applyContextMenuRule(tabId, normalizedEntry);
            });
        });
    }
});

function applyContextMenuRule(
    tabId: number,
    normalizedEntry: NormalizedBlockedEntry,
    removeSchedule = false,
    coveredUrlAction?: CoveredUrlRuleAction,
    expectedCoveredUrls?: CoveredUrlRuleInfo[],
): void {
    saveBlockingRule(normalizedEntry, removeSchedule, coveredUrlAction, expectedCoveredUrls, (result) => {
        if (!result) return;
        if ('coveredUrlConflict' in result) {
            decideCoveredUrlRules(
                tabId,
                result.coveredUrlConflict.domain,
                result.coveredUrlConflict.urls,
            ).then((action) => {
                if (action) applyContextMenuRule(
                    tabId,
                    normalizedEntry,
                    removeSchedule,
                    action,
                    result.coveredUrlConflict.urls,
                );
            });
            return;
        }
        const warning = result.enabled === false
            ? 'The blocking rule was saved, but Tiny Website Blocker is currently off. Turn blocking on for the rule to take effect.'
            : normalizePausedUntil(result.pausedUntil) > 0
                ? 'The blocking rule was saved, but Tiny Website Blocker is temporarily paused. Resume blocking for the rule to take effect.'
                : '';
        finishContextMenuRule(tabId, warning);
    });
}

type SavedBlockingRule = {
    blocked: BlockedEntry[];
    enabled: boolean;
    pausedUntil: number;
    outcome: 'added' | 'updated' | 'existing';
};
type CoveredUrlConflict = {coveredUrlConflict: {domain: string; urls: CoveredUrlRuleInfo[]}};

function saveBlockingRule(
    normalizedEntry: NormalizedBlockedEntry,
    removeSchedule: boolean,
    coveredUrlAction: CoveredUrlRuleAction | undefined,
    expectedCoveredUrls: CoveredUrlRuleInfo[] | undefined,
    done: (result: SavedBlockingRule | CoveredUrlConflict | null) => void,
): void {
    chrome.storage.local.get({enabled: true, pausedUntil: 0, blocked: []}, (state) => {
        if (chrome.runtime.lastError) {
            done(null);
            return;
        }
        const currentBlocked = usableBlockedEntries(state.blocked);
        const existingIndex = currentBlocked.findIndex((item) =>
            (item.scope || 'domain') === normalizedEntry.scope && item.name === normalizedEntry.name
        );

        const finish = (blocked: BlockedEntry[], outcome: SavedBlockingRule['outcome']) => done({
            blocked,
            enabled: state.enabled !== false,
            pausedUntil: normalizePausedUntil(state.pausedUntil),
            outcome,
        });

        if (existingIndex >= 0) {
            const existingEntry = currentBlocked[existingIndex];
            if (existingEntry.enabled && !(removeSchedule && existingEntry.schedule)) {
                finish(currentBlocked, 'existing');
                return;
            }
        }

        if (existingIndex < 0
            && currentBlocked.some((item) => item.enabled && blockedEntryCovers(item, normalizedEntry))) {
            finish(currentBlocked, 'existing');
            return;
        }

        const coveredUrls = findCoveredUrlRules(currentBlocked, normalizedEntry);
        const coveredUrlState = getCoveredUrlRuleInfo(currentBlocked, normalizedEntry);
        const conflictChanged = coveredUrlAction
            && !sameCoveredUrlRuleInfo(coveredUrlState, expectedCoveredUrls || []);
        if (coveredUrls.length && (!coveredUrlAction || conflictChanged)) {
            done({coveredUrlConflict: {
                domain: normalizedEntry.name,
                urls: coveredUrlState,
            }});
            return;
        }

        const resolvedBlocked = coveredUrlAction
            ? applyCoveredUrlRuleAction(currentBlocked, normalizedEntry, coveredUrlAction)
            : currentBlocked;
        const resolvedExistingIndex = resolvedBlocked.findIndex((item) =>
            (item.scope || 'domain') === normalizedEntry.scope && item.name === normalizedEntry.name
        );
        const updatedBlocked = [...resolvedBlocked];
        let outcome: SavedBlockingRule['outcome'] = 'added';
        if (resolvedExistingIndex >= 0) {
            const updatedEntry = {...updatedBlocked[resolvedExistingIndex], enabled: true};
            if (removeSchedule) delete updatedEntry.schedule;
            updatedBlocked[resolvedExistingIndex] = updatedEntry;
            outcome = 'updated';
        } else {
            updatedBlocked.push({...normalizedEntry, enabled: true});
        }
        chrome.storage.local.set({blocked: updatedBlocked}, () => {
            if (chrome.runtime.lastError) done(null);
            else finish(updatedBlocked, outcome);
        });
    });
}

function usableBlockedEntries(value: unknown): BlockedEntry[] {
    if (!Array.isArray(value)) return [];
    return value.filter((entry): entry is BlockedEntry => {
        if (typeof entry !== 'object' || entry === null) return false;
        const candidate = entry as Record<string, unknown>;
        if (typeof candidate.name !== 'string') return false;
        if (candidate.scope !== undefined && candidate.scope !== 'domain' && candidate.scope !== 'url') {
            return false;
        }
        return Boolean(normalizeBlockedEntry(candidate.name, candidate.scope as 'domain' | 'url' | undefined));
    });
}

chrome.runtime.onMessage.addListener((
    message: AddCurrentSiteRuleRequest | EnableCurrentSiteRuleRequest,
    _sender,
    sendResponse: (response: AddCurrentSiteRuleResponse | EnableCurrentSiteRuleResponse) => void,
) => {
    if (message?.type === ENABLE_CURRENT_SITE_RULE) {
        return enableStoredRuleForCurrentSite(message, sendResponse);
    }
    if (message?.type !== ADD_CURRENT_SITE_RULE) return;
    if (!Number.isInteger(message.tabId) || message.tabId < 0
        || typeof message.url !== 'string' || !/^https?:\/\//i.test(message.url)
        || (message.scope !== 'domain' && message.scope !== 'url')
        || !hasValidCoveredUrlResolution(message.coveredUrlAction, message.coveredUrls)) {
        sendResponse({ok: false});
        return;
    }
    const normalizedEntry = normalizeBlockedEntry(message.url, message.scope);
    if (!normalizedEntry) {
        sendResponse({ok: false});
        return;
    }
    saveBlockingRule(
        normalizedEntry,
        false,
        message.coveredUrlAction,
        message.coveredUrls,
        (result) => {
            if (!result) {
                sendResponse({ok: false});
                return;
            }
            if ('coveredUrlConflict' in result) {
                sendResponse({ok: false, coveredUrlConflict: result.coveredUrlConflict});
                return;
            }
            blockingEnabled = result.enabled;
            blockingPausedUntil = result.pausedUntil;
            rebuildBlockedHostnames(result.blocked);
            const shouldReload = result.outcome !== 'existing'
                && result.enabled
                && normalizePausedUntil(result.pausedUntil) === 0;
            if (!shouldReload) {
                sendResponse({ok: true, ...result, reload: 'skipped'});
                return;
            }
            chrome.tabs.get(message.tabId, (tab) => {
                const tabUrl = tab?.pendingUrl || tab?.url || '';
                if (chrome.runtime.lastError || !ruleMatchesPage(normalizedEntry, tabUrl)) {
                    sendResponse({ok: true, ...result, reload: 'skipped'});
                    return;
                }
                chrome.tabs.reload(message.tabId, () => {
                    sendResponse({
                        ok: true,
                        ...result,
                        reload: chrome.runtime.lastError ? 'failed' : 'started',
                    });
                });
            });
        },
    );
    return true;
});

function enableStoredRuleForCurrentSite(
    message: EnableCurrentSiteRuleRequest,
    sendResponse: (response: EnableCurrentSiteRuleResponse) => void,
): boolean | undefined {
    if (!Number.isInteger(message.tabId) || message.tabId < 0
        || typeof message.url !== 'string' || !/^https?:\/\//i.test(message.url)
        || !hasValidCoveredUrlResolution(message.coveredUrlAction, message.coveredUrls)) {
        sendResponse({ok: false});
        return;
    }
    const requestedRule = normalizeBlockedEntry(message.rule?.name || '', message.rule?.scope);
    if (!requestedRule || !ruleMatchesPage(requestedRule, message.url)) {
        sendResponse({ok: false});
        return;
    }

    chrome.storage.local.get({enabled: true, pausedUntil: 0, blocked: []}, (state) => {
        if (chrome.runtime.lastError) {
            sendResponse({ok: false});
            return;
        }
        const currentBlocked = usableBlockedEntries(state.blocked);
        const existingIndex = currentBlocked.findIndex((item) =>
            (item.scope || 'domain') === requestedRule.scope && item.name === requestedRule.name
        );
        if (existingIndex < 0) {
            sendResponse({ok: false});
            return;
        }

        const finish = (blocked: BlockedEntry[]) => {
            const enabled = state.enabled !== false;
            const pausedUntil = normalizePausedUntil(state.pausedUntil);
            const enabledRule = blocked.find((item) =>
                (item.scope || 'domain') === requestedRule.scope && item.name === requestedRule.name
            )!;
            blockingEnabled = enabled;
            blockingPausedUntil = pausedUntil;
            rebuildBlockedHostnames(blocked);

            if (!enabled || pausedUntil > 0 || !isScheduleActive(enabledRule.schedule)) {
                sendResponse({ok: true, blocked, enabled, pausedUntil, reload: 'skipped'});
                return;
            }
            chrome.tabs.get(message.tabId, (tab) => {
                const tabUrl = tab?.pendingUrl || tab?.url || '';
                if (chrome.runtime.lastError || !ruleMatchesPage(requestedRule, tabUrl)) {
                    sendResponse({ok: true, blocked, enabled, pausedUntil, reload: 'skipped'});
                    return;
                }
                chrome.tabs.reload(message.tabId, () => {
                    sendResponse({
                        ok: true,
                        blocked,
                        enabled,
                        pausedUntil,
                        reload: chrome.runtime.lastError ? 'failed' : 'started',
                    });
                });
            });
        };

        const existingRule = currentBlocked[existingIndex];
        if (existingRule.enabled) {
            finish(currentBlocked);
            return;
        }
        const coveredUrls = findCoveredUrlRules(currentBlocked, requestedRule);
        const coveredUrlState = getCoveredUrlRuleInfo(currentBlocked, requestedRule);
        const conflictChanged = message.coveredUrlAction
            && !sameCoveredUrlRuleInfo(coveredUrlState, message.coveredUrls || []);
        if (coveredUrls.length && (!message.coveredUrlAction || conflictChanged)) {
            sendResponse({ok: false, coveredUrlConflict: {
                domain: requestedRule.name,
                urls: coveredUrlState,
            }});
            return;
        }
        const resolvedBlocked = message.coveredUrlAction
            ? applyCoveredUrlRuleAction(currentBlocked, requestedRule, message.coveredUrlAction)
            : currentBlocked;
        const resolvedIndex = resolvedBlocked.findIndex((item) =>
            (item.scope || 'domain') === requestedRule.scope && item.name === requestedRule.name
        );
        const updatedBlocked = [...resolvedBlocked];
        updatedBlocked[resolvedIndex] = {...updatedBlocked[resolvedIndex], enabled: true};
        chrome.storage.local.set({blocked: updatedBlocked}, () => {
            if (chrome.runtime.lastError) sendResponse({ok: false});
            else finish(updatedBlocked);
        });
    });
    return true;
}

function ruleMatchesPage(rule: NormalizedBlockedEntry, url: string): boolean {
    if (rule.scope === 'url') {
        return normalizeBlockedEntry(url, 'url')?.name === rule.name;
    }
    const pageDomain = normalizeBlockedEntry(url, 'domain');
    return Boolean(pageDomain && hostnameMatchesDomain(pageDomain.name, rule.name));
}

function formatScheduleForContextMenu(schedule: RuleSchedule): string {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const groups = new Map<string, number[]>();
    schedule.daily.forEach((entry) => {
        const period = entry.mode === 'all-day' ? 'all day' : `${entry.start}-${entry.end}`;
        groups.set(period, [...(groups.get(period) || []), entry.day]);
    });
    return [...groups.entries()].map(([period, days]) =>
        `${days.map((day) => dayNames[day]).join(', ')} | ${period}`
    ).join('; ');
}

function decideScheduledDomainOverride(tabId: number, domain: string, schedule: string): Promise<boolean> {
    return new Promise((resolve) => {
        chrome.scripting.executeScript({
            target: {tabId},
            args: [domain, schedule],
            func: showScheduledDomainOverrideDialog,
        }, (results) => {
            if (chrome.runtime.lastError || !results?.[0]) {
                resolve(false);
                return;
            }
            resolve(results[0].result === true);
        });
    });
}

function finishContextMenuRule(tabId: number, warning: string) {
    if (!warning) {
        chrome.tabs.reload(tabId);
        return;
    }
    chrome.scripting.executeScript({
        target: {tabId},
        args: [warning],
        func: (message) => window.alert(message),
    }, () => {
        void chrome.runtime.lastError;
    });
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (!changeInfo.url && changeInfo.status !== 'loading') {
        return;
    }
    const url = changeInfo.url || tab.pendingUrl || tab.url;
    if (!url || !url.startsWith('http')) {
        return;
    }
    await initialRulesReady;
    blockPage(tabId, url);
});

function blockTabWithReason(
    tabId: number,
    reason: 'url' | 'domain',
    blockedLabel: string,
    availableAt?: number,
) {
    if (blockedTabs[tabId]) {
        return;
    }
    blockedTabs[tabId] = true;
    recordBlockedAttempt();
    let warningUrl =
        `warning.html?reason=${reason}` +
        `&blocked=${encodeURIComponent(blockedLabel)}`;
    if (Number.isFinite(availableAt)) warningUrl += `&availableAt=${availableAt}`;
    chrome.tabs.create({url: warningUrl}, (warningTab) => {
        if (chrome.runtime.lastError || !warningTab) {
            delete blockedTabs[tabId];
            return;
        }
        chrome.tabs.remove(tabId, () => {
            if (chrome.runtime.lastError) {
                delete blockedTabs[tabId];
            }
        });
    });
}

function warningLabelForUrl(blockedUrl: string): string {
    const url = new URL(blockedUrl);
    return `${url.hostname}${url.pathname}`;
}

function recordBlockedAttempt() {
    pendingStatisticsUpdates += 1;
    processNextStatisticsUpdate();
}

function processNextStatisticsUpdate() {
    if (statisticsUpdateInProgress || pendingStatisticsUpdates === 0) {
        return;
    }
    statisticsUpdateInProgress = true;
    pendingStatisticsUpdates -= 1;
    chrome.storage.local.get({ [STORAGE_KEYS.statistics]: {} }, (data) => {
        if (chrome.runtime.lastError) {
            finishStatisticsUpdate();
            return;
        }
        const statistics = incrementStatistics(data[STORAGE_KEYS.statistics]);
        chrome.storage.local.set({ [STORAGE_KEYS.statistics]: statistics }, () => {
            void chrome.runtime.lastError;
            finishStatisticsUpdate();
        });
    });
}

function finishStatisticsUpdate() {
    statisticsUpdateInProgress = false;
    processNextStatisticsUpdate();
}

function decideBlockScope(tabId, pageUrl): Promise<'domain' | 'url' | null> {
    if (!requiresBlockScopeChoice(pageUrl)) {
        return Promise.resolve('domain');
    }

    return new Promise((resolve) => {
        if (!chrome.scripting || !tabId) {
            resolve(null);
            return;
        }
        chrome.scripting.executeScript(
            {
                target: { tabId },
                args: [{kind: 'scope' as const, url: pageUrl}],
                func: showRuleChoiceDialog,
            },
            (results) => {
                if (chrome.runtime.lastError || !results || !results[0]) {
                    resolve(null);
                    return;
                }
                resolve(results[0].result as 'domain' | 'url');
            }
        );
    });
}

function decideCoveredUrlRules(
    tabId: number,
    domain: string,
    urls: CoveredUrlRuleInfo[],
): Promise<CoveredUrlRuleAction | null> {
    return new Promise((resolve) => {
        chrome.scripting.executeScript({
            target: {tabId},
            args: [{kind: 'coveredUrls' as const, domain, urls}],
            func: showRuleChoiceDialog,
        }, (results) => {
            if (chrome.runtime.lastError || !results?.[0]) {
                resolve(null);
                return;
            }
            const action = results[0].result;
            resolve(action === 'keep' || action === 'disable' || action === 'delete' ? action : null);
        });
    });
}

function hasValidCoveredUrlResolution(
    action: CoveredUrlRuleAction | undefined,
    urls: CoveredUrlRuleInfo[] | undefined,
): boolean {
    if (action === undefined) return urls === undefined;
    return ['keep', 'disable', 'delete'].includes(action)
        && Array.isArray(urls)
        && urls.every((entry) =>
            typeof entry === 'object'
            && entry !== null
            && typeof entry.url === 'string'
            && typeof entry.enabled === 'boolean'
        );
}
