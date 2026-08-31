import {getPureHostname} from './helper/getPureHostname';
import {
    BlockedEntry,
    RuleSchedule,
    blockedEntryCovers,
    normalizeBlockedEntry,
    normalizeUrlForMatch,
    requiresBlockScopeChoice,
} from './helper/blockedEntry';
import {incrementStatistics, normalizePausedUntil, STORAGE_KEYS} from './helper/extensionState';
import {isScheduleActive, migrateLegacyScheduleGroups, normalizeRules} from './helper/schedules';

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
    return blockedHostnames.has(hostname) && isScheduleActive(blockedHostnames.get(hostname), date);
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

let storedBlocked: BlockedEntry[] = [];
chrome.storage.local.get({ blocked: [], enabled: true, pausedUntil: 0, schedules: [] }, (data) => {
    const migrated = migrateLegacyScheduleGroups(data.blocked, data.schedules);
    storedBlocked = migrated.blocked;
    if (migrated.migrated) {
        chrome.storage.local.set({blocked: storedBlocked, schedules: []});
    }
    rebuildBlockedHostnames(storedBlocked);
    blockingEnabled = data.enabled !== false;
    blockingPausedUntil = normalizePausedUntil(data.pausedUntil);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') {
        return;
    }
    if (changes.blocked) {
        storedBlocked = Array.isArray(changes.blocked.newValue) ? changes.blocked.newValue : [];
        rebuildBlockedHostnames(storedBlocked);
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
        blockTabWithReason(tabId, pageUrl, hostname, 'url', normalizedUrl);
        return;
    }
    if (shouldBlockHostname(hostname)) {
        blockTabWithReason(tabId, pageUrl, hostname, 'domain', hostname);
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
            const warning = state.enabled === false
                ? 'The blocking rule was saved, but Tiny Website Blocker is currently off. Turn blocking on for the rule to take effect.'
                : normalizePausedUntil(state.pausedUntil) > 0
                    ? 'The blocking rule was saved, but Tiny Website Blocker is temporarily paused. Resume blocking for the rule to take effect.'
                    : '';
            decideBlockScope(tabId, pageUrl).then((scope) => {
                if (!scope) {
                    return;
                }
                const currentBlocked = Array.isArray(state.blocked)
                    ? state.blocked as BlockedEntry[]
                    : [];
                const normalizedEntry = normalizeBlockedEntry(pageUrl, scope);
                if (!normalizedEntry) {
                    return;
                }

                const existingIndex = currentBlocked.findIndex((item) => {
                    const itemScope = item.scope || 'domain';
                    return itemScope === normalizedEntry.scope && item.name === normalizedEntry.name;
                });
                if (existingIndex >= 0) {
                    const existingEntry = currentBlocked[existingIndex];
                    if (!existingEntry.enabled) {
                        const updatedBlocked = [...currentBlocked];
                        updatedBlocked[existingIndex] = { ...existingEntry, enabled: true };
                        chrome.storage.local.set({ blocked: updatedBlocked }, () => {
                            finishContextMenuRule(tabId, warning);
                        });
                        return;
                    }
                    finishContextMenuRule(tabId, warning);
                    return;
                }

                if (currentBlocked.some((item) => item.enabled && blockedEntryCovers(item, normalizedEntry))) {
                    finishContextMenuRule(tabId, warning);
                    return;
                }

                const newBlocked = [
                    ...currentBlocked,
                    {
                        name: normalizedEntry.name,
                        scope: normalizedEntry.scope,
                        enabled: true,
                    },
                ];

                chrome.storage.local.set({ blocked: newBlocked }, () => {
                    finishContextMenuRule(tabId, warning);
                });
            });
        });
    }
});

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

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    const url = tab.pendingUrl || tab.url;
    if (!url || !url.startsWith('http')) {
        return;
    }
    blockPage(tabId, url);
});

function blockTabWithReason(
    tabId: number,
    pageUrl: string,
    hostname: string,
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
            `&blocked=${encodeURIComponent(blockedLabel)}` +
            `&host=${encodeURIComponent(hostname)}` +
            `&url=${encodeURIComponent(pageUrl)}`;
        chrome.tabs.create({ url: warningUrl });
    });
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
                func: (url) => {
                    const existing = document.getElementById('tiny-blocker-choice');
                    if (existing) {
                        existing.remove();
                    }
                    return new Promise((resolve) => {
                        const overlay = document.createElement('div');
                        overlay.id = 'tiny-blocker-choice';
                        overlay.style.position = 'fixed';
                        overlay.style.inset = '0';
                        overlay.style.background = 'rgba(0, 0, 0, 0.55)';
                        overlay.style.zIndex = '2147483647';
                        overlay.style.display = 'flex';
                        overlay.style.alignItems = 'center';
                        overlay.style.justifyContent = 'center';

                        const card = document.createElement('div');
                        card.style.background = '#ffffff';
                        card.style.color = '#1f1b16';
                        card.style.borderRadius = '14px';
                        card.style.boxSizing = 'border-box';
                        card.style.padding = '22px';
                        card.style.width = 'min(520px, calc(100vw - 40px))';
                        card.style.boxShadow = '0 18px 32px rgba(0, 0, 0, 0.25)';
                        card.style.fontFamily = '\'Trebuchet MS\',\'Lucida Grande\',\'Lucida Sans Unicode\',sans-serif';

                        const title = document.createElement('div');
                        title.textContent = 'Block this page';
                        title.style.fontSize = '20px';
                        title.style.fontWeight = 'bold';
                        title.style.marginBottom = '14px';

                        const subtitle = document.createElement('div');
                        subtitle.textContent = 'Choose how you want to block this page:';
                        subtitle.style.fontSize = '14px';
                        subtitle.style.color = '#6b5f52';
                        subtitle.style.marginBottom = '8px';

                        const urlBox = document.createElement('div');
                        urlBox.textContent = url;
                        urlBox.style.background = '#fff7f1';
                        urlBox.style.border = '1px solid #edcdb9';
                        urlBox.style.borderRadius = '10px';
                        urlBox.style.color = '#493d32';
                        urlBox.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
                        urlBox.style.fontSize = '12px';
                        urlBox.style.lineHeight = '1.45';
                        urlBox.style.marginBottom = '18px';
                        urlBox.style.padding = '11px 12px';
                        urlBox.style.overflowWrap = 'anywhere';

                        const actions = document.createElement('div');
                        actions.style.display = 'flex';
                        actions.style.gap = '8px';
                        actions.style.justifyContent = 'flex-end';
                        actions.style.flexWrap = 'wrap';

                        const cancelButton = document.createElement('button');
                        cancelButton.textContent = 'Cancel';
                        const domainButton = document.createElement('button');
                        domainButton.textContent = 'Block domain';
                        const urlButton = document.createElement('button');
                        urlButton.textContent = 'Block this full URL';

                        [cancelButton, domainButton, urlButton].forEach((button) => {
                            button.style.border = 'none';
                            button.style.borderRadius = '999px';
                            button.style.padding = '8px 12px';
                            button.style.cursor = 'pointer';
                            button.style.fontFamily = 'inherit';
                        });

                        cancelButton.style.background = 'transparent';
                        cancelButton.style.border = '1px solid #c45a1f';
                        cancelButton.style.color = '#c45a1f';

                        domainButton.style.background = '#e0702f';
                        domainButton.style.color = '#ffffff';

                        urlButton.style.background = '#1f1b16';
                        urlButton.style.color = '#ffffff';

                        const cleanup = (result) => {
                            overlay.remove();
                            resolve(result);
                        };

                        cancelButton.addEventListener('click', () => cleanup(null));
                        domainButton.addEventListener('click', () => cleanup('domain'));
                        urlButton.addEventListener('click', () => cleanup('url'));
                        overlay.addEventListener('click', (event) => {
                            if (event.target === overlay) {
                                cleanup(null);
                            }
                        });
                        window.addEventListener(
                            'keydown',
                            (event) => {
                                if (event.key === 'Escape') {
                                    cleanup(null);
                                }
                            },
                            { once: true }
                        );

                        actions.appendChild(cancelButton);
                        actions.appendChild(domainButton);
                        actions.appendChild(urlButton);

                        card.appendChild(title);
                        card.appendChild(subtitle);
                        card.appendChild(urlBox);
                        card.appendChild(actions);
                        overlay.appendChild(card);
                        document.body.appendChild(overlay);
                    });
                },
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
