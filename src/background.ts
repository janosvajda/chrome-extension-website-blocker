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
            const currentBlocked = Array.isArray(state.blocked)
                ? state.blocked as BlockedEntry[]
                : [];
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
    chrome.storage.local.get({enabled: true, pausedUntil: 0, blocked: []}, (state) => {
        const warning = state.enabled === false
            ? 'The blocking rule was saved, but Tiny Website Blocker is currently off. Turn blocking on for the rule to take effect.'
            : normalizePausedUntil(state.pausedUntil) > 0
                ? 'The blocking rule was saved, but Tiny Website Blocker is temporarily paused. Resume blocking for the rule to take effect.'
                : '';
        const currentBlocked = Array.isArray(state.blocked) ? state.blocked as BlockedEntry[] : [];
        const existingIndex = currentBlocked.findIndex((item) =>
            (item.scope || 'domain') === normalizedEntry.scope && item.name === normalizedEntry.name
        );

        if (existingIndex >= 0) {
            const existingEntry = currentBlocked[existingIndex];
            if (!existingEntry.enabled || (removeSchedule && existingEntry.schedule)) {
                const updatedEntry = {...existingEntry, enabled: true};
                if (removeSchedule) delete updatedEntry.schedule;
                const updatedBlocked = [...currentBlocked];
                updatedBlocked[existingIndex] = updatedEntry;
                chrome.storage.local.set({blocked: updatedBlocked}, () => finishContextMenuRule(tabId, warning));
                return;
            }
            finishContextMenuRule(tabId, warning);
            return;
        }

        if (currentBlocked.some((item) => item.enabled && blockedEntryCovers(item, normalizedEntry))) {
            finishContextMenuRule(tabId, warning);
            return;
        }

        chrome.storage.local.set({
            blocked: [...currentBlocked, {...normalizedEntry, enabled: true}],
        }, () => finishContextMenuRule(tabId, warning));
    });
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
    blockedLabel: string
) {
    if (blockedTabs[tabId]) {
        return;
    }
    blockedTabs[tabId] = true;
    recordBlockedAttempt();
    chrome.tabs.remove(tabId, () => {
        const warningUrl =
            `warning.html?reason=${reason}` +
            `&blocked=${encodeURIComponent(blockedLabel)}`;
        chrome.tabs.create({ url: warningUrl });
    });
}

function warningLabelForUrl(blockedUrl: string): string {
    const url = new URL(blockedUrl);
    return `${url.hostname}${url.pathname}`;
}

function recordBlockedAttempt() {
    chrome.storage.local.get({ [STORAGE_KEYS.statistics]: {} }, (data) => {
        const statistics = incrementStatistics(data[STORAGE_KEYS.statistics]);
        chrome.storage.local.set({ [STORAGE_KEYS.statistics]: statistics });
    });
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
