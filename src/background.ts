import {getPureHostname} from './helper/getPureHostname';
import {
    BlockedEntry,
    NormalizedBlockedEntry,
    RuleSchedule,
    blockedEntryCovers,
    hostnameMatchesDomain,
    normalizeBlockedEntry,
    normalizeUrlForMatch,
    requiresBlockScopeChoice,
} from './helper/blockedEntry';
import {incrementStatistics, normalizePausedUntil, STORAGE_KEYS} from './helper/extensionState';
import {
    ADD_CURRENT_SITE_DOMAIN_RULE,
    AddCurrentSiteDomainRuleRequest,
    AddCurrentSiteDomainRuleResponse,
} from './helper/backgroundMessages';
import {isScheduleActive, migrateLegacyScheduleGroups, normalizeRuleSchedule, normalizeRules} from './helper/schedules';
import {showBlockScopeDialog, showScheduledDomainOverrideDialog} from './background/dialogs';

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
    const hostname = getPureHostname(pageUrl);
    const normalizedUrl = normalizeUrlForMatch(pageUrl);
    if (normalizedUrl && blockedUrls.has(normalizedUrl) && isScheduleActive(blockedUrls.get(normalizedUrl))) {
        blockTabWithReason(tabId, 'url', warningLabelForUrl(normalizedUrl));
        return;
    }
    if (shouldBlockHostname(hostname)) {
        blockTabWithReason(tabId, 'domain', hostname);
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
): void {
    saveBlockingRule(normalizedEntry, removeSchedule, (result) => {
        if (!result) return;
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

function saveBlockingRule(
    normalizedEntry: NormalizedBlockedEntry,
    removeSchedule: boolean,
    done: (result: SavedBlockingRule | null) => void,
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
            if (!existingEntry.enabled || (removeSchedule && existingEntry.schedule)) {
                const updatedEntry = {...existingEntry, enabled: true};
                if (removeSchedule) delete updatedEntry.schedule;
                const updatedBlocked = [...currentBlocked];
                updatedBlocked[existingIndex] = updatedEntry;
                chrome.storage.local.set({blocked: updatedBlocked}, () => {
                    if (chrome.runtime.lastError) done(null);
                    else finish(updatedBlocked, 'updated');
                });
                return;
            }
            finish(currentBlocked, 'existing');
            return;
        }

        if (currentBlocked.some((item) => item.enabled && blockedEntryCovers(item, normalizedEntry))) {
            finish(currentBlocked, 'existing');
            return;
        }

        const updatedBlocked = [...currentBlocked, {...normalizedEntry, enabled: true}];
        chrome.storage.local.set({blocked: updatedBlocked}, () => {
            if (chrome.runtime.lastError) done(null);
            else finish(updatedBlocked, 'added');
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
    message: AddCurrentSiteDomainRuleRequest,
    _sender,
    sendResponse: (response: AddCurrentSiteDomainRuleResponse) => void,
) => {
    if (message?.type !== ADD_CURRENT_SITE_DOMAIN_RULE) return;
    if (!Number.isInteger(message.tabId) || message.tabId < 0
        || typeof message.url !== 'string' || !/^https?:\/\//i.test(message.url)) {
        sendResponse({ok: false});
        return;
    }
    const normalizedEntry = normalizeBlockedEntry(message.url, 'domain');
    if (!normalizedEntry) {
        sendResponse({ok: false});
        return;
    }
    saveBlockingRule(normalizedEntry, false, (result) => {
        if (!result) {
            sendResponse({ok: false});
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
            const currentDomain = normalizeBlockedEntry(tabUrl, 'domain');
            if (chrome.runtime.lastError || currentDomain?.name !== normalizedEntry.name) {
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
    });
    return true;
});

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
    blockedLabel: string
) {
    if (blockedTabs[tabId]) {
        return;
    }
    blockedTabs[tabId] = true;
    recordBlockedAttempt();
    const warningUrl =
        `warning.html?reason=${reason}` +
        `&blocked=${encodeURIComponent(blockedLabel)}`;
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
                args: [pageUrl],
                func: showBlockScopeDialog,
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
