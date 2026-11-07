const mockChrome = {
    runtime: {
        lastError: undefined as {message: string} | undefined,
        onInstalled: {
            addListener: jest.fn(),
        },
        onMessage: {
            addListener: jest.fn(),
        },
    },
    contextMenus: {
        create: jest.fn((_properties, callback) => callback?.()),
        removeAll: jest.fn((callback) => callback()),
        onClicked: {
            addListener: jest.fn(),
        },
    },
    storage: {
        local: {
            get: jest.fn((keys, callback) => callback({ blocked: [] })),
            set: jest.fn((payload, callback) => {
                if (callback) {
                    callback();
                }
            }),
        },
        onChanged: {
            addListener: jest.fn(),
        },
    },
    tabs: {
        get: jest.fn((_tabId, callback) => callback({id: 42, url: 'https://example.com/'})),
        remove: jest.fn((tabId, callback) => {
            if (callback) {
                callback();
            }
        }),
        create: jest.fn((_properties, callback) => callback?.({id: 999})),
        reload: jest.fn((_tabId, callback) => callback?.()),
        onUpdated: {
            addListener: jest.fn(),
        },
    },
    scripting: {
        executeScript: jest.fn((options, callback) => {
            if (callback) {
                callback([{ result: { title: '', description: '' } }]);
            }
        }),
    },
};

let blockPage: typeof import('./background').blockPage;
let rebuildBlockedHostnames: typeof import('./background').rebuildBlockedHostnames;
let resetBlockedStateForTest: typeof import('./background').resetBlockedStateForTest;
let shouldBlockHostname: typeof import('./background').shouldBlockHostname;
let isBlockingActive: typeof import('./background').isBlockingActive;
let onContextMenuClicked: (info: any, tab: any) => void;
let onRuntimeMessage: (message: any, sender: any, sendResponse: (response: any) => void) => boolean | undefined;
let onStorageChanged: (changes: any, areaName: string) => void;
let onTabUpdated: (tabId: number, changeInfo: any, tab: any) => Promise<void>;
let initializeStorageDefaults: () => void;
let createContextMenu: () => void;

beforeAll(() => {
    (global as any).chrome = mockChrome;
    jest.isolateModules(() => {
        const background = require('./background');
        blockPage = background.blockPage;
        rebuildBlockedHostnames = background.rebuildBlockedHostnames;
        resetBlockedStateForTest = background.resetBlockedStateForTest;
        shouldBlockHostname = background.shouldBlockHostname;
        isBlockingActive = background.isBlockingActive;
        onContextMenuClicked = mockChrome.contextMenus.onClicked.addListener.mock.calls[0][0];
        onRuntimeMessage = mockChrome.runtime.onMessage.addListener.mock.calls[0][0];
        onStorageChanged = mockChrome.storage.onChanged.addListener.mock.calls[0][0];
        onTabUpdated = mockChrome.tabs.onUpdated.addListener.mock.calls[0][0];
        initializeStorageDefaults = mockChrome.runtime.onInstalled.addListener.mock.calls[0][0];
        createContextMenu = mockChrome.runtime.onInstalled.addListener.mock.calls[1][0];
    });
});

beforeEach(() => {
    resetBlockedStateForTest();
    jest.clearAllMocks();
    mockChrome.runtime.lastError = undefined;
    mockChrome.storage.local.get.mockImplementation((_keys, callback) => callback({blocked: []}));
    mockChrome.storage.local.set.mockImplementation((_payload, callback) => callback?.());
    mockChrome.tabs.get.mockImplementation((_tabId, callback) => callback({id: 42, url: 'https://example.com/'}));
    mockChrome.tabs.reload.mockImplementation((_tabId, callback) => callback?.());
    mockChrome.scripting.executeScript.mockImplementation((_options, callback) => {
        callback?.([{result: {title: '', description: ''}}]);
    });
});

afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
});

describe('background blocked hostnames cache', () => {
    it('initializes missing storage defaults during installation', () => {
        mockChrome.storage.local.get.mockImplementationOnce((_keys, callback) => callback({
            blocked: null,
            enabled: undefined,
        }));

        initializeStorageDefaults();

        expect(mockChrome.storage.local.set).toHaveBeenCalledWith({blocked: []});
        expect(mockChrome.storage.local.set).toHaveBeenCalledWith({enabled: true});
    });

    it('preserves valid storage defaults during installation', () => {
        mockChrome.storage.local.get.mockImplementationOnce((_keys, callback) => callback({
            blocked: [],
            enabled: false,
        }));

        initializeStorageDefaults();

        expect(mockChrome.storage.local.set).not.toHaveBeenCalled();
    });

    it('shows the block-page context menu only on HTTP and HTTPS pages', () => {
        createContextMenu();

        expect(mockChrome.contextMenus.removeAll).toHaveBeenCalledTimes(1);
        expect(mockChrome.contextMenus.create).toHaveBeenCalledWith(
            {
                id: 'blockPage',
                title: 'Block this page by Tiny Blocker',
                contexts: ['page'],
                documentUrlPatterns: ['http://*/*', 'https://*/*'],
            },
            expect.any(Function)
        );

        createContextMenu();
        expect(mockChrome.contextMenus.removeAll).toHaveBeenCalledTimes(2);
        expect(mockChrome.contextMenus.create).toHaveBeenCalledTimes(2);
    });

    it('tracks only enabled hostnames and normalizes them', () => {
        rebuildBlockedHostnames([
            { name: 'https://www.example.com', enabled: true },
            { name: 'disabled.com', enabled: false },
        ]);

        expect(shouldBlockHostname('example.com')).toBe(true);
        expect(shouldBlockHostname('disabled.com')).toBe(false);
    });

    it('applies a domain rule to subdomains and trailing-dot hostnames only', () => {
        rebuildBlockedHostnames([{name: 'reddit.com', scope: 'domain', enabled: true}]);

        expect(shouldBlockHostname('reddit.com')).toBe(true);
        expect(shouldBlockHostname('old.reddit.com')).toBe(true);
        expect(shouldBlockHostname('OLD.REDDIT.COM.')).toBe(true);
        expect(shouldBlockHostname('notreddit.com')).toBe(false);
    });

    it('keeps subdomains and parent domains available for a domain-only rule', () => {
        rebuildBlockedHostnames([{
            name: 'music.youtube.com',
            scope: 'domain',
            includeSubdomains: false,
            enabled: true,
        }]);

        expect(shouldBlockHostname('music.youtube.com')).toBe(true);
        expect(shouldBlockHostname('child.music.youtube.com')).toBe(false);
        expect(shouldBlockHostname('youtube.com')).toBe(false);
    });

    it('ignores storage changes from other storage areas', () => {
        onStorageChanged({enabled: {newValue: false}}, 'sync');
        expect(isBlockingActive()).toBe(true);
    });

    it('blocks scheduled rules only during their active local period', () => {
        rebuildBlockedHostnames(
            [{
                name: 'example.com', scope: 'domain', enabled: true,
                schedule: {days: [1], start: '09:00', end: '17:00'},
            }],
        );

        expect(shouldBlockHostname('example.com', new Date(2026, 7, 24, 10, 0))).toBe(true);
        expect(shouldBlockHostname('example.com', new Date(2026, 7, 24, 18, 0))).toBe(false);
    });

    it('blocks a tab when hostname is cached as blocked', () => {
        rebuildBlockedHostnames([{ name: 'example.com', enabled: true }]);

        blockPage(1, 'https://example.com/path');

        expect(mockChrome.tabs.remove).toHaveBeenCalledWith(1, expect.any(Function));
        expect(mockChrome.tabs.create).toHaveBeenCalledWith({
            url: expect.stringContaining('warning.html?reason=domain'),
        }, expect.any(Function));
        expect(mockChrome.tabs.create.mock.invocationCallOrder[0])
            .toBeLessThan(mockChrome.tabs.remove.mock.invocationCallOrder[0]);

        blockPage(1, 'https://example.com/another-path');
        expect(mockChrome.tabs.remove).toHaveBeenCalledTimes(1);
    });

    it('keeps the blocked tab open and allows a retry if the warning cannot be created', () => {
        rebuildBlockedHostnames([{name: 'example.com', enabled: true}]);
        mockChrome.tabs.create.mockImplementationOnce((_properties, callback) => {
            mockChrome.runtime.lastError = {message: 'Could not create warning tab'};
            callback?.(undefined);
            mockChrome.runtime.lastError = undefined;
        });

        blockPage(1, 'https://example.com/path');

        expect(mockChrome.tabs.create).toHaveBeenCalledTimes(1);
        expect(mockChrome.tabs.remove).not.toHaveBeenCalled();

        blockPage(1, 'https://example.com/path');
        expect(mockChrome.tabs.create).toHaveBeenCalledTimes(2);
        expect(mockChrome.tabs.remove).toHaveBeenCalledWith(1, expect.any(Function));
    });

    it('allows a retry if Chrome cannot remove the blocked tab', () => {
        rebuildBlockedHostnames([{name: 'example.com', enabled: true}]);
        mockChrome.tabs.remove.mockImplementationOnce((_tabId, callback) => {
            mockChrome.runtime.lastError = {message: 'Tabs cannot be edited right now'};
            callback?.();
            mockChrome.runtime.lastError = undefined;
        });

        blockPage(1, 'https://example.com/first');
        expect(mockChrome.tabs.create).toHaveBeenCalledTimes(1);
        expect(mockChrome.tabs.remove).toHaveBeenCalledTimes(1);

        blockPage(1, 'https://example.com/second');
        expect(mockChrome.tabs.create).toHaveBeenCalledTimes(2);
        expect(mockChrome.tabs.remove).toHaveBeenCalledTimes(2);
    });

    it('records every blocked attempt when several tabs are blocked simultaneously', async () => {
        let storedStatistics = {
            date: new Date().toLocaleDateString('en-CA'),
            today: 0,
            total: 0,
        };
        mockChrome.storage.local.get.mockImplementation((_keys, callback) => {
            queueMicrotask(() => callback({statistics: storedStatistics}));
        });
        mockChrome.storage.local.set.mockImplementation((values, callback) => {
            queueMicrotask(() => {
                if (values.statistics) storedStatistics = values.statistics;
                callback?.();
            });
        });
        rebuildBlockedHostnames([{name: 'example.com', enabled: true}]);

        for (let tabId = 1; tabId <= 5; tabId += 1) {
            blockPage(tabId, `https://example.com/page-${tabId}`);
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 0));

        expect(storedStatistics).toEqual(expect.objectContaining({today: 5, total: 5}));
    });

    it('continues recording after a statistics save fails', async () => {
        let storedStatistics = {
            date: new Date().toLocaleDateString('en-CA'),
            today: 0,
            total: 0,
        };
        let failNextSave = true;
        mockChrome.storage.local.get.mockImplementation((_keys, callback) => {
            queueMicrotask(() => callback({statistics: storedStatistics}));
        });
        mockChrome.storage.local.set.mockImplementation((values, callback) => {
            queueMicrotask(() => {
                if (failNextSave) {
                    failNextSave = false;
                    mockChrome.runtime.lastError = {message: 'Statistics save failed'};
                    callback?.();
                    mockChrome.runtime.lastError = undefined;
                    return;
                }
                if (values.statistics) storedStatistics = values.statistics;
                callback?.();
            });
        });
        rebuildBlockedHostnames([{name: 'example.com', enabled: true}]);

        blockPage(1, 'https://example.com/first');
        blockPage(2, 'https://example.com/second');
        await new Promise<void>((resolve) => setTimeout(resolve, 0));

        expect(storedStatistics).toEqual(expect.objectContaining({today: 1, total: 1}));
    });

    it('blocks subdomains and trailing-dot variants of a domain rule', () => {
        rebuildBlockedHostnames([{name: 'youtube.com', scope: 'domain', enabled: true}]);

        blockPage(11, 'https://m.youtube.com/watch?v=123');
        blockPage(12, 'https://youtube.com./watch?v=456');

        expect(mockChrome.tabs.remove).toHaveBeenCalledWith(11, expect.any(Function));
        expect(mockChrome.tabs.remove).toHaveBeenCalledWith(12, expect.any(Function));
    });

    it('blocks a tab when a specific URL is cached as blocked', () => {
        rebuildBlockedHostnames([
            { name: 'https://www.youtube.com/watch?v=123', scope: 'url', enabled: true },
        ]);

        blockPage(1, 'https://www.youtube.com/watch?v=123');

        expect(mockChrome.tabs.remove).toHaveBeenCalledWith(1, expect.any(Function));
        const warningUrl = mockChrome.tabs.create.mock.calls[0][0].url;
        const warningParams = new URL(warningUrl, 'chrome-extension://test/').searchParams;
        expect(warningParams.get('reason')).toBe('url');
        expect(warningParams.get('blocked')).toBe('www.youtube.com/watch');
        expect(warningParams.has('availableAt')).toBe(false);
        expect(warningParams.has('host')).toBe(false);
        expect(warningParams.has('url')).toBe(false);
        expect(warningUrl).not.toContain('v%3D123');
    });

    it('shows availability only after every matching scheduled rule has ended', () => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date(2026, 7, 24, 10));
        rebuildBlockedHostnames([
            {
                name: 'https://www.example.com/watch', scope: 'url', enabled: true,
                schedule: {daily: [{day: 1, mode: 'period', start: '09:00', end: '12:00'}]},
            },
            {
                name: 'example.com', scope: 'domain', enabled: true,
                schedule: {daily: [{day: 1, mode: 'period', start: '12:00', end: '14:00'}]},
            },
        ]);

        blockPage(13, 'https://www.example.com/watch');

        const warningUrl = mockChrome.tabs.create.mock.calls[0][0].url;
        const warningParams = new URL(warningUrl, 'chrome-extension://test/').searchParams;
        expect(warningParams.get('reason')).toBe('url');
        expect(Number(warningParams.get('availableAt'))).toBe(new Date(2026, 7, 24, 14).getTime());
    });

    it('does not block when global blocking is disabled', () => {
        rebuildBlockedHostnames([{ name: 'example.com', enabled: true }]);
        onStorageChanged({ enabled: { newValue: false } }, 'local');

        blockPage(1, 'https://example.com/path');

        expect(mockChrome.tabs.remove).not.toHaveBeenCalled();
        expect(mockChrome.tabs.create).not.toHaveBeenCalled();
    });

    it('temporarily pauses blocking until the stored expiry time', () => {
        const now = Date.now();
        rebuildBlockedHostnames([{name: 'example.com', enabled: true}]);
        onStorageChanged({pausedUntil: {newValue: now + 15 * 60_000}}, 'local');

        expect(isBlockingActive(now)).toBe(false);
        expect(isBlockingActive(now + 15 * 60_000)).toBe(true);

        jest.spyOn(Date, 'now').mockReturnValue(now);
        blockPage(8, 'https://example.com/paused');
        expect(mockChrome.tabs.remove).not.toHaveBeenCalled();
        jest.restoreAllMocks();
    });

    it('ignores unsupported context-menu tabs', () => {
        onContextMenuClicked({menuItemId: 'blockPage'}, {id: 3, url: 'chrome://extensions'});
        onContextMenuClicked({menuItemId: 'other'}, {id: 3, url: 'https://example.com'});
        expect(mockChrome.storage.local.get).not.toHaveBeenCalled();
    });

    it('reloads an existing enabled context-menu rule without changing storage', async () => {
        mockChrome.storage.local.get.mockImplementation((_keys, callback) => callback({
            enabled: true,
            pausedUntil: 0,
            blocked: [{name: 'example.com', scope: 'domain', enabled: true}],
        }));

        onContextMenuClicked(
            {menuItemId: 'blockPage'},
            {id: 4, url: 'https://example.com', title: 'Example'}
        );
        await Promise.resolve();

        expect(mockChrome.storage.local.set).not.toHaveBeenCalled();
        expect(mockChrome.tabs.reload).toHaveBeenCalledWith(4);
    });

    it('does not add an exact URL already covered by an enabled domain rule', async () => {
        mockChrome.storage.local.get.mockImplementation((_keys, callback) => callback({
            enabled: true,
            pausedUntil: 0,
            blocked: [{name: 'example.com', scope: 'domain', enabled: true}],
        }));
        mockChrome.scripting.executeScript.mockImplementationOnce((_options, callback) => {
            callback([{result: 'url'}]);
        });

        onContextMenuClicked(
            {menuItemId: 'blockPage'},
            {id: 5, url: 'https://example.com/path', title: 'Example'}
        );
        await Promise.resolve();
        await Promise.resolve();

        expect(mockChrome.storage.local.set).not.toHaveBeenCalled();
        expect(mockChrome.tabs.reload).toHaveBeenCalledWith(5);
    });

    it('does nothing when block-scope selection is cancelled or cannot be injected', async () => {
        mockChrome.storage.local.get.mockImplementation((_keys, callback) => callback({
            enabled: true, pausedUntil: 0, blocked: [],
        }));
        mockChrome.scripting.executeScript
            .mockImplementationOnce((_options, callback) => callback([{result: null}]))
            .mockImplementationOnce((_options, callback) => callback([]));

        onContextMenuClicked({menuItemId: 'blockPage'}, {id: 6, url: 'https://example.com/one'});
        await Promise.resolve();
        onContextMenuClicked({menuItemId: 'blockPage'}, {id: 6, url: 'https://example.com/two'});
        await Promise.resolve();

        expect(mockChrome.storage.local.set).not.toHaveBeenCalled();
        expect(mockChrome.tabs.reload).not.toHaveBeenCalled();
    });

    it('does nothing when a path needs a scope choice but the tab has no id', async () => {
        mockChrome.storage.local.get.mockImplementationOnce((_keys, callback) => callback({
            enabled: true,
            pausedUntil: 0,
            blocked: 'malformed',
        }));

        onContextMenuClicked(
            {menuItemId: 'blockPage'},
            {url: 'https://example.com/path', title: 'Example'}
        );
        await Promise.resolve();

        expect(mockChrome.scripting.executeScript).not.toHaveBeenCalled();
        expect(mockChrome.storage.local.set).not.toHaveBeenCalled();
        expect(mockChrome.tabs.reload).not.toHaveBeenCalled();
    });

    it('ignores malformed individual rules in the context-menu flow', async () => {
        mockChrome.storage.local.get.mockImplementation((_keys, callback) => callback({
            enabled: true,
            pausedUntil: 0,
            blocked: [null, {enabled: true}, {name: 5, enabled: true}],
        }));

        onContextMenuClicked(
            {menuItemId: 'blockPage'},
            {id: 14, url: 'https://example.com', title: 'Example'}
        );
        await Promise.resolve();

        expect(mockChrome.storage.local.set).toHaveBeenCalledWith({
            blocked: [{name: 'example.com', scope: 'domain', enabled: true}],
        }, expect.any(Function));
        expect(mockChrome.tabs.reload).toHaveBeenCalledWith(14);
    });

    it('does nothing when script injection is unavailable for a scope choice', async () => {
        mockChrome.storage.local.get.mockImplementationOnce((_keys, callback) => callback({
            enabled: true, pausedUntil: 0, blocked: [],
        }));
        const scripting = (global as any).chrome.scripting;
        (global as any).chrome.scripting = undefined;

        onContextMenuClicked(
            {menuItemId: 'blockPage'},
            {id: 8, url: 'https://example.com/path', title: 'Example'}
        );
        await Promise.resolve();
        (global as any).chrome.scripting = scripting;

        expect(mockChrome.storage.local.set).not.toHaveBeenCalled();
        expect(mockChrome.tabs.reload).not.toHaveBeenCalled();
    });

    it('handles failed schedule-dialog injection without changing the rule', async () => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date(2026, 7, 24, 18, 0));
        mockChrome.storage.local.get.mockImplementationOnce((_keys, callback) => callback({
            enabled: true,
            pausedUntil: 0,
            blocked: [{
                name: 'example.com', scope: 'domain', enabled: true,
                schedule: {daily: [{day: 1, mode: 'period', start: '08:00', end: '17:00'}]},
            }],
        }));
        mockChrome.scripting.executeScript.mockImplementationOnce((_options, callback) => callback([]));

        onContextMenuClicked({menuItemId: 'blockPage'}, {id: 7, url: 'https://example.com/path'});
        await Promise.resolve();
        await Promise.resolve();

        expect(mockChrome.storage.local.set).not.toHaveBeenCalled();
        expect(mockChrome.tabs.reload).not.toHaveBeenCalled();
    });

    it('checks updated HTTP tabs and ignores non-web tab updates', async () => {
        rebuildBlockedHostnames([{name: 'example.com', scope: 'domain', enabled: true}]);

        await onTabUpdated(20, {url: 'chrome://settings'}, {url: 'chrome://settings'});
        await onTabUpdated(21, {url: 'https://example.com/path'}, {pendingUrl: 'https://example.com/path'});

        expect(mockChrome.tabs.remove).toHaveBeenCalledTimes(1);
        expect(mockChrome.tabs.remove).toHaveBeenCalledWith(21, expect.any(Function));
    });

    it('does not close an open tab for title or audio updates', async () => {
        rebuildBlockedHostnames([{name: 'example.com', scope: 'domain', enabled: true}]);

        await onTabUpdated(22, {title: 'Updated title'}, {url: 'https://example.com/draft'});
        await onTabUpdated(22, {audible: true}, {url: 'https://example.com/draft'});

        expect(mockChrome.tabs.remove).not.toHaveBeenCalled();
        expect(mockChrome.tabs.create).not.toHaveBeenCalled();
    });

    it('checks the current tab URL when a reload reports loading without a URL change', async () => {
        rebuildBlockedHostnames([{name: 'reload.example', scope: 'domain', enabled: true}]);

        await onTabUpdated(23, {status: 'loading'}, {url: 'https://reload.example/draft'});

        expect(mockChrome.tabs.remove).toHaveBeenCalledWith(23, expect.any(Function));
        expect(mockChrome.tabs.create).toHaveBeenCalledWith({
            url: expect.stringContaining('warning.html?reason=domain'),
        }, expect.any(Function));
    });

    it('re-enables an existing disabled context-menu rule and reloads the tab', async () => {
        mockChrome.storage.local.get.mockImplementation((keys, callback) => {
            callback({
                blocked: [{ name: 'example.com', scope: 'domain', enabled: false }],
            });
        });

        onContextMenuClicked(
            { menuItemId: 'blockPage' },
            { id: 7, url: 'https://example.com', title: 'Example' }
        );
        await Promise.resolve();

        expect(mockChrome.storage.local.set).toHaveBeenCalledWith(
            {
                blocked: [{ name: 'example.com', scope: 'domain', enabled: true }],
            },
            expect.any(Function)
        );
        expect(mockChrome.tabs.reload).toHaveBeenCalledWith(7);
    });

    it('asks how to handle covered full-URL blocks before a context-menu domain is saved', async () => {
        const existingUrl = {name: 'https://example.com/article', scope: 'url', enabled: true};
        mockChrome.storage.local.get.mockImplementation((_keys, callback) => callback({
            enabled: true,
            pausedUntil: 0,
            blocked: [existingUrl],
        }));
        mockChrome.scripting.executeScript.mockImplementation((options, callback) => {
            expect(options.args).toEqual([{
                kind: 'coveredUrls',
                domain: 'example.com',
                urls: [{url: existingUrl.name, enabled: true}],
            }]);
            callback?.([{result: 'delete'}]);
        });

        onContextMenuClicked(
            {menuItemId: 'blockPage'},
            {id: 7, url: 'https://example.com', title: 'Example'},
        );
        for (let index = 0; index < 6; index += 1) await Promise.resolve();

        expect(mockChrome.storage.local.set).toHaveBeenCalledWith({
            blocked: [{name: 'example.com', scope: 'domain', enabled: true}],
        }, expect.any(Function));
        expect(mockChrome.tabs.reload).toHaveBeenCalledWith(7);
    });

    it('preserves a rule added while a context-menu choice is in progress', async () => {
        const externallyAdded = {name: 'other.example', scope: 'domain', enabled: true};
        let readCount = 0;
        mockChrome.storage.local.get.mockImplementation((_keys, callback) => {
            callback({
                enabled: true,
                pausedUntil: 0,
                blocked: readCount++ === 0 ? [] : [externallyAdded],
            });
        });

        onContextMenuClicked(
            {menuItemId: 'blockPage'},
            {id: 12, url: 'https://example.com', title: 'Example'}
        );
        await Promise.resolve();
        await Promise.resolve();

        expect(mockChrome.storage.local.set).toHaveBeenCalledWith({
            blocked: [
                externallyAdded,
                {name: 'example.com', scope: 'domain', enabled: true},
            ],
        }, expect.any(Function));
    });

    it('adds a popup domain rule using the latest stored rules and reloads the matching tab', () => {
        const externallyAdded = {
            name: 'other.example',
            scope: 'domain',
            enabled: true,
            title: 'Preserved title',
            description: 'Preserved description',
        };
        mockChrome.storage.local.get.mockImplementation((_keys, callback) => callback({
            enabled: true,
            pausedUntil: 0,
            blocked: [externallyAdded],
        }));
        mockChrome.tabs.get.mockImplementation((_tabId, callback) => callback({
            id: 42,
            url: 'https://news.example.com/article',
        }));
        const sendResponse = jest.fn();

        const keepsMessageChannelOpen = onRuntimeMessage({
            type: 'addCurrentSiteRule',
            tabId: 42,
            url: 'https://news.example.com/article',
            scope: 'domain',
        }, {}, sendResponse);

        expect(keepsMessageChannelOpen).toBe(true);
        expect(mockChrome.storage.local.set).toHaveBeenCalledWith({
            blocked: [
                externallyAdded,
                {name: 'news.example.com', scope: 'domain', enabled: true},
            ],
        }, expect.any(Function));
        expect(sendResponse).toHaveBeenCalledWith({
            ok: true,
            blocked: [
                externallyAdded,
                {name: 'news.example.com', scope: 'domain', enabled: true},
            ],
            enabled: true,
            pausedUntil: 0,
            outcome: 'added',
            reload: 'started',
        });
        expect(mockChrome.tabs.get).toHaveBeenCalledWith(42, expect.any(Function));
        expect(mockChrome.tabs.reload).toHaveBeenCalledWith(42, expect.any(Function));
        expect(mockChrome.tabs.remove).not.toHaveBeenCalled();
        expect(shouldBlockHostname('news.example.com')).toBe(true);
    });

    it('reports covered full-URL blocks before saving a broader popup domain', () => {
        const urls = [
            {name: 'https://example.com/one', scope: 'url', enabled: true},
            {name: 'https://sub.example.com/two', scope: 'url', enabled: false},
        ];
        mockChrome.storage.local.get.mockImplementation((_keys, callback) => callback({
            enabled: true,
            pausedUntil: 0,
            blocked: urls,
        }));
        const sendResponse = jest.fn();

        onRuntimeMessage({
            type: 'addCurrentSiteRule',
            tabId: 42,
            url: 'https://example.com/',
            scope: 'domain',
        }, {}, sendResponse);

        expect(mockChrome.storage.local.set).not.toHaveBeenCalled();
        expect(mockChrome.tabs.reload).not.toHaveBeenCalled();
        expect(sendResponse).toHaveBeenCalledWith({
            ok: false,
            coveredUrlConflict: {
                domain: 'example.com',
                urls: [
                    {url: 'https://example.com/one', enabled: true},
                    {url: 'https://sub.example.com/two', enabled: false},
                ],
            },
        });
    });

    it.each([
        ['keep', [
            {name: 'https://example.com/one', scope: 'url', enabled: true},
            {name: 'https://sub.example.com/two', scope: 'url', enabled: true},
            {name: 'https://other.example/page', scope: 'url', enabled: true},
            {name: 'example.com', scope: 'domain', enabled: true},
        ]],
        ['disable', [
            {name: 'https://example.com/one', scope: 'url', enabled: false},
            {name: 'https://sub.example.com/two', scope: 'url', enabled: false},
            {name: 'https://other.example/page', scope: 'url', enabled: true},
            {name: 'example.com', scope: 'domain', enabled: true},
        ]],
        ['delete', [
            {name: 'https://other.example/page', scope: 'url', enabled: true},
            {name: 'example.com', scope: 'domain', enabled: true},
        ]],
    ] as const)('%s covered full-URL blocks when saving a popup domain', (action, expected) => {
        mockChrome.storage.local.get.mockImplementation((_keys, callback) => callback({
            enabled: true,
            pausedUntil: 0,
            blocked: [
                {name: 'https://example.com/one', scope: 'url', enabled: true},
                {name: 'https://sub.example.com/two', scope: 'url', enabled: true},
                {name: 'https://other.example/page', scope: 'url', enabled: true},
            ],
        }));
        const sendResponse = jest.fn();

        onRuntimeMessage({
            type: 'addCurrentSiteRule',
            tabId: 42,
            url: 'https://example.com/',
            scope: 'domain',
            coveredUrlAction: action,
            coveredUrls: [
                {url: 'https://example.com/one', enabled: true},
                {url: 'https://sub.example.com/two', enabled: true},
            ],
        }, {}, sendResponse);

        expect(mockChrome.storage.local.set).toHaveBeenCalledWith({blocked: expected}, expect.any(Function));
        expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({
            ok: true,
            blocked: expected,
            outcome: 'added',
            reload: 'started',
        }));
    });

    it('asks again if covered URL blocks changed while the choice dialog was open', () => {
        const currentUrls = [
            {name: 'https://example.com/one', scope: 'url', enabled: true},
            {name: 'https://example.com/new', scope: 'url', enabled: true},
        ];
        mockChrome.storage.local.get.mockImplementation((_keys, callback) => callback({
            enabled: true,
            pausedUntil: 0,
            blocked: currentUrls,
        }));
        const sendResponse = jest.fn();

        onRuntimeMessage({
            type: 'addCurrentSiteRule',
            tabId: 42,
            url: 'https://example.com/',
            scope: 'domain',
            coveredUrlAction: 'delete',
            coveredUrls: [{url: 'https://example.com/one', enabled: true}],
        }, {}, sendResponse);

        expect(mockChrome.storage.local.set).not.toHaveBeenCalled();
        expect(sendResponse).toHaveBeenCalledWith({
            ok: false,
            coveredUrlConflict: {
                domain: 'example.com',
                urls: currentUrls.map((entry) => ({url: entry.name, enabled: true})),
            },
        });
    });

    it('adds the selected full-URL rule from the popup and reloads only the matching page', () => {
        mockChrome.storage.local.get.mockImplementation((_keys, callback) => callback({
            enabled: true,
            pausedUntil: 0,
            blocked: [],
        }));
        mockChrome.tabs.get.mockImplementation((_tabId, callback) => callback({
            id: 42,
            url: 'https://example.com/article?tab=1',
        }));
        const sendResponse = jest.fn();

        onRuntimeMessage({
            type: 'addCurrentSiteRule',
            tabId: 42,
            url: 'https://example.com/article?tab=1',
            scope: 'url',
        }, {}, sendResponse);

        expect(mockChrome.storage.local.set).toHaveBeenCalledWith({
            blocked: [{name: 'https://example.com/article?tab=1', scope: 'url', enabled: true}],
        }, expect.any(Function));
        expect(mockChrome.tabs.reload).toHaveBeenCalledWith(42, expect.any(Function));
        expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({
            ok: true,
            outcome: 'added',
            reload: 'started',
        }));
    });

    it('does not duplicate a popup domain rule that was added after the popup loaded', () => {
        const existing = {name: 'example.com', enabled: true};
        mockChrome.storage.local.get.mockImplementation((_keys, callback) => callback({
            enabled: false,
            pausedUntil: 0,
            blocked: [existing],
        }));
        const sendResponse = jest.fn();

        onRuntimeMessage({
            type: 'addCurrentSiteRule',
            tabId: 42,
            url: 'https://example.com/path',
            scope: 'domain',
        }, {}, sendResponse);

        expect(mockChrome.storage.local.set).not.toHaveBeenCalled();
        expect(sendResponse).toHaveBeenCalledWith({
            ok: true,
            blocked: [existing],
            enabled: false,
            pausedUntil: 0,
            outcome: 'existing',
            reload: 'skipped',
        });
        expect(mockChrome.tabs.reload).not.toHaveBeenCalled();
    });

    it('re-enables a disabled popup domain rule', () => {
        mockChrome.storage.local.get.mockImplementation((_keys, callback) => callback({
            enabled: true,
            pausedUntil: 0,
            blocked: [{name: 'example.com', scope: 'domain', enabled: false}],
        }));
        const sendResponse = jest.fn();

        onRuntimeMessage({
            type: 'addCurrentSiteRule',
            tabId: 42,
            url: 'https://example.com/path',
            scope: 'domain',
        }, {}, sendResponse);

        expect(mockChrome.storage.local.set).toHaveBeenCalledWith({
            blocked: [{name: 'example.com', scope: 'domain', enabled: true}],
        }, expect.any(Function));
        expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({
            ok: true,
            outcome: 'updated',
            reload: 'started',
        }));
    });

    it('enables the exact disabled parent-domain rule from the popup and reloads the matching tab', () => {
        const disabledRule = {
            name: 'example.com', scope: 'domain', enabled: false,
            title: 'Keep this metadata',
        };
        mockChrome.storage.local.get.mockImplementation((_keys, callback) => callback({
            enabled: true,
            pausedUntil: 0,
            blocked: [disabledRule],
        }));
        mockChrome.tabs.get.mockImplementation((_tabId, callback) => callback({
            id: 42,
            url: 'https://old.example.com/article',
        }));
        const sendResponse = jest.fn();

        const keepsMessageChannelOpen = onRuntimeMessage({
            type: 'enableCurrentSiteRule',
            tabId: 42,
            url: 'https://old.example.com/article',
            rule: {name: 'example.com', scope: 'domain'},
        }, {}, sendResponse);

        const enabledRule = {...disabledRule, enabled: true};
        expect(keepsMessageChannelOpen).toBe(true);
        expect(mockChrome.storage.local.set).toHaveBeenCalledWith({blocked: [enabledRule]}, expect.any(Function));
        expect(mockChrome.tabs.reload).toHaveBeenCalledWith(42, expect.any(Function));
        expect(sendResponse).toHaveBeenCalledWith({
            ok: true,
            blocked: [enabledRule],
            enabled: true,
            pausedUntil: 0,
            reload: 'started',
        });
        expect(shouldBlockHostname('old.example.com')).toBe(true);
    });

    it('reports covered full-URL blocks before enabling a disabled domain', () => {
        const fullUrl = {name: 'https://example.com/article', scope: 'url', enabled: true};
        const domain = {name: 'example.com', scope: 'domain', enabled: false};
        mockChrome.storage.local.get.mockImplementation((_keys, callback) => callback({
            enabled: true,
            pausedUntil: 0,
            blocked: [fullUrl, domain],
        }));
        const sendResponse = jest.fn();

        onRuntimeMessage({
            type: 'enableCurrentSiteRule',
            tabId: 42,
            url: 'https://example.com/',
            rule: {name: 'example.com', scope: 'domain'},
        }, {}, sendResponse);

        expect(mockChrome.storage.local.set).not.toHaveBeenCalled();
        expect(sendResponse).toHaveBeenCalledWith({
            ok: false,
            coveredUrlConflict: {
                domain: 'example.com',
                urls: [{url: fullUrl.name, enabled: true}],
            },
        });
    });

    it.each([
        ['keep', [
            {name: 'https://example.com/article', scope: 'url', enabled: true},
            {name: 'example.com', scope: 'domain', enabled: true},
        ]],
        ['disable', [
            {name: 'https://example.com/article', scope: 'url', enabled: false},
            {name: 'example.com', scope: 'domain', enabled: true},
        ]],
        ['delete', [
            {name: 'example.com', scope: 'domain', enabled: true},
        ]],
    ] as const)('%s covered URL blocks while enabling a disabled domain', (action, expected) => {
        const fullUrl = {name: 'https://example.com/article', scope: 'url', enabled: true};
        const domain = {name: 'example.com', scope: 'domain', enabled: false};
        mockChrome.storage.local.get.mockImplementation((_keys, callback) => callback({
            enabled: true,
            pausedUntil: 0,
            blocked: [fullUrl, domain],
        }));
        const sendResponse = jest.fn();

        onRuntimeMessage({
            type: 'enableCurrentSiteRule',
            tabId: 42,
            url: 'https://example.com/',
            rule: {name: 'example.com', scope: 'domain'},
            coveredUrlAction: action,
            coveredUrls: [{url: fullUrl.name, enabled: true}],
        }, {}, sendResponse);

        expect(mockChrome.storage.local.set).toHaveBeenCalledWith({blocked: expected}, expect.any(Function));
        expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({
            ok: true,
            blocked: expected,
            reload: 'started',
        }));
    });

    it('asks again if a covered URL changes state while a domain enable dialog is open', () => {
        const fullUrl = {name: 'https://example.com/article', scope: 'url', enabled: false};
        const domain = {name: 'example.com', scope: 'domain', enabled: false};
        mockChrome.storage.local.get.mockImplementation((_keys, callback) => callback({
            enabled: true,
            pausedUntil: 0,
            blocked: [fullUrl, domain],
        }));
        const sendResponse = jest.fn();

        onRuntimeMessage({
            type: 'enableCurrentSiteRule',
            tabId: 42,
            url: 'https://example.com/',
            rule: {name: 'example.com', scope: 'domain'},
            coveredUrlAction: 'keep',
            coveredUrls: [{url: fullUrl.name, enabled: true}],
        }, {}, sendResponse);

        expect(mockChrome.storage.local.set).not.toHaveBeenCalled();
        expect(sendResponse).toHaveBeenCalledWith({
            ok: false,
            coveredUrlConflict: {
                domain: 'example.com',
                urls: [{url: fullUrl.name, enabled: false}],
            },
        });
    });

    it('preserves an enabled rule schedule and skips reload while that schedule is inactive', () => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date(2026, 7, 24, 18, 0));
        const schedule = {daily: [{day: 1, mode: 'period', start: '08:00', end: '17:00'}]};
        const disabledRule = {
            name: 'https://example.com/article', scope: 'url', enabled: false, schedule,
        };
        mockChrome.storage.local.get.mockImplementation((_keys, callback) => callback({
            enabled: true,
            pausedUntil: 0,
            blocked: [disabledRule],
        }));
        const sendResponse = jest.fn();

        onRuntimeMessage({
            type: 'enableCurrentSiteRule',
            tabId: 42,
            url: 'https://example.com/article',
            rule: {name: 'https://example.com/article', scope: 'url'},
        }, {}, sendResponse);

        expect(mockChrome.storage.local.set).toHaveBeenCalledWith({
            blocked: [{...disabledRule, enabled: true}],
        }, expect.any(Function));
        expect(mockChrome.tabs.get).not.toHaveBeenCalled();
        expect(mockChrome.tabs.reload).not.toHaveBeenCalled();
        expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ok: true, reload: 'skipped'}));
    });

    it.each([
        [{enabled: false, pausedUntil: 0}, false],
        [{enabled: true, pausedUntil: Date.now() + 60_000}, true],
    ])('enables a stored popup rule without reloading while global blocking is unavailable', (availability, expectedEnabled) => {
        const disabledRule = {name: 'example.com', scope: 'domain', enabled: false};
        mockChrome.storage.local.get.mockImplementation((_keys, callback) => callback({
            ...availability,
            blocked: [disabledRule],
        }));
        const sendResponse = jest.fn();

        onRuntimeMessage({
            type: 'enableCurrentSiteRule',
            tabId: 42,
            url: 'https://example.com/',
            rule: {name: 'example.com', scope: 'domain'},
        }, {}, sendResponse);

        expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({
            ok: true,
            enabled: expectedEnabled,
            reload: 'skipped',
        }));
        expect(mockChrome.tabs.reload).not.toHaveBeenCalled();
    });

    it('rejects invalid or stale popup enable requests without adding a rule', () => {
        const sendResponse = jest.fn();
        mockChrome.storage.local.get.mockImplementation((_keys, callback) => callback({
            enabled: true,
            pausedUntil: 0,
            blocked: [{name: 'example.com', scope: 'domain', enabled: false}],
        }));

        expect(onRuntimeMessage({
            type: 'enableCurrentSiteRule', tabId: -1, url: 'https://example.com/',
            rule: {name: 'example.com', scope: 'domain'},
        }, {}, sendResponse)).toBeUndefined();
        expect(onRuntimeMessage({
            type: 'enableCurrentSiteRule', tabId: 42, url: 'chrome://extensions/',
            rule: {name: 'example.com', scope: 'domain'},
        }, {}, sendResponse)).toBeUndefined();
        expect(onRuntimeMessage({
            type: 'enableCurrentSiteRule', tabId: 42, url: 'https://different.example/',
            rule: {name: 'example.com', scope: 'domain'},
        }, {}, sendResponse)).toBeUndefined();
        expect(onRuntimeMessage({
            type: 'enableCurrentSiteRule', tabId: 42, url: 'https://missing.example/',
            rule: {name: 'missing.example', scope: 'domain'},
        }, {}, sendResponse)).toBe(true);

        expect(sendResponse).toHaveBeenCalledTimes(4);
        expect(sendResponse).toHaveBeenNthCalledWith(1, {ok: false});
        expect(sendResponse).toHaveBeenNthCalledWith(2, {ok: false});
        expect(sendResponse).toHaveBeenNthCalledWith(3, {ok: false});
        expect(sendResponse).toHaveBeenNthCalledWith(4, {ok: false});
        expect(mockChrome.storage.local.set).not.toHaveBeenCalled();
    });

    it('reports popup enable storage failures', () => {
        const request = {
            type: 'enableCurrentSiteRule',
            tabId: 42,
            url: 'https://example.com/',
            rule: {name: 'example.com', scope: 'domain'},
        };
        const sendResponse = jest.fn();
        mockChrome.storage.local.get.mockImplementationOnce((_keys, callback) => {
            mockChrome.runtime.lastError = {message: 'Read failed'};
            callback({});
            mockChrome.runtime.lastError = undefined;
        });

        onRuntimeMessage(request, {}, sendResponse);
        expect(sendResponse).toHaveBeenLastCalledWith({ok: false});

        mockChrome.storage.local.get.mockImplementationOnce((_keys, callback) => callback({
            enabled: true,
            pausedUntil: 0,
            blocked: [{name: 'example.com', scope: 'domain', enabled: false}],
        }));
        mockChrome.storage.local.set.mockImplementationOnce((_values, callback) => {
            mockChrome.runtime.lastError = {message: 'Save failed'};
            callback?.();
            mockChrome.runtime.lastError = undefined;
        });

        onRuntimeMessage(request, {}, sendResponse);
        expect(sendResponse).toHaveBeenLastCalledWith({ok: false});
    });

    it('handles a rule enabled elsewhere and a tab that navigated before reload', () => {
        const enabledRule = {name: 'example.com', scope: 'domain', enabled: true};
        mockChrome.storage.local.get.mockImplementation((_keys, callback) => callback({
            enabled: true,
            pausedUntil: 0,
            blocked: [enabledRule],
        }));
        mockChrome.tabs.get.mockImplementation((_tabId, callback) => callback({
            id: 42,
            url: 'https://different.example/',
        }));
        const sendResponse = jest.fn();

        onRuntimeMessage({
            type: 'enableCurrentSiteRule',
            tabId: 42,
            url: 'https://example.com/',
            rule: {name: 'example.com', scope: 'domain'},
        }, {}, sendResponse);

        expect(mockChrome.storage.local.set).not.toHaveBeenCalled();
        expect(mockChrome.tabs.reload).not.toHaveBeenCalled();
        expect(sendResponse).toHaveBeenCalledWith({
            ok: true,
            blocked: [enabledRule],
            enabled: true,
            pausedUntil: 0,
            reload: 'skipped',
        });
    });

    it('keeps the enabled rule successful when Chrome cannot reload the tab', () => {
        mockChrome.storage.local.get.mockImplementation((_keys, callback) => callback({
            enabled: true,
            pausedUntil: 0,
            blocked: [{name: 'example.com', scope: 'domain', enabled: false}],
        }));
        mockChrome.tabs.reload.mockImplementationOnce((_tabId, callback) => {
            mockChrome.runtime.lastError = {message: 'Tab was closed'};
            callback?.();
            mockChrome.runtime.lastError = undefined;
        });
        const sendResponse = jest.fn();

        onRuntimeMessage({
            type: 'enableCurrentSiteRule',
            tabId: 42,
            url: 'https://example.com/',
            rule: {name: 'example.com', scope: 'domain'},
        }, {}, sendResponse);

        expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ok: true, reload: 'failed'}));
    });

    it.each([
        [{enabled: false, pausedUntil: 0, blocked: []}, false],
        [{enabled: true, pausedUntil: Date.now() + 60_000, blocked: []}, true],
    ])('saves a popup rule without reloading while blocking is unavailable', (state, expectedEnabled) => {
        mockChrome.storage.local.get.mockImplementation((_keys, callback) => callback(state));
        const sendResponse = jest.fn();

        onRuntimeMessage({
            type: 'addCurrentSiteRule',
            tabId: 42,
            url: 'https://example.com/',
            scope: 'domain',
        }, {}, sendResponse);

        expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({
            ok: true,
            enabled: expectedEnabled,
            outcome: 'added',
            reload: 'skipped',
        }));
        expect(mockChrome.tabs.get).not.toHaveBeenCalled();
        expect(mockChrome.tabs.reload).not.toHaveBeenCalled();
    });

    it('does not reload if the original tab has navigated to another website', () => {
        mockChrome.storage.local.get.mockImplementation((_keys, callback) => callback({
            enabled: true,
            pausedUntil: 0,
            blocked: [],
        }));
        mockChrome.tabs.get.mockImplementation((_tabId, callback) => callback({
            id: 42,
            url: 'https://different.example/',
        }));
        const sendResponse = jest.fn();

        onRuntimeMessage({
            type: 'addCurrentSiteRule',
            tabId: 42,
            url: 'https://example.com/',
            scope: 'domain',
        }, {}, sendResponse);

        expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({
            ok: true,
            outcome: 'added',
            reload: 'skipped',
        }));
        expect(mockChrome.tabs.reload).not.toHaveBeenCalled();
    });

    it('keeps a saved popup rule successful when Chrome cannot reload the tab', () => {
        mockChrome.storage.local.get.mockImplementation((_keys, callback) => callback({
            enabled: true,
            pausedUntil: 0,
            blocked: [],
        }));
        mockChrome.tabs.reload.mockImplementationOnce((_tabId, callback) => {
            mockChrome.runtime.lastError = {message: 'Tab was closed'};
            callback?.();
            mockChrome.runtime.lastError = undefined;
        });
        const sendResponse = jest.fn();

        onRuntimeMessage({
            type: 'addCurrentSiteRule',
            tabId: 42,
            url: 'https://example.com/',
            scope: 'domain',
        }, {}, sendResponse);

        expect(mockChrome.storage.local.set).toHaveBeenCalled();
        expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({
            ok: true,
            outcome: 'added',
            reload: 'failed',
        }));
    });

    it('rejects unsupported popup rule requests without reading or changing storage', () => {
        const sendResponse = jest.fn();

        expect(onRuntimeMessage(null, {}, sendResponse)).toBeUndefined();
        expect(onRuntimeMessage({type: 'unrelated'}, {}, sendResponse)).toBeUndefined();
        expect(onRuntimeMessage({
            type: 'addCurrentSiteRule',
            tabId: -1,
            url: 'https://example.com/',
            scope: 'domain',
        }, {}, sendResponse)).toBeUndefined();
        expect(onRuntimeMessage({
            type: 'addCurrentSiteRule',
            tabId: 42,
            url: 123,
            scope: 'domain',
        }, {}, sendResponse)).toBeUndefined();
        expect(onRuntimeMessage({
            type: 'addCurrentSiteRule',
            tabId: 42,
            url: 'chrome://extensions',
            scope: 'domain',
        }, {}, sendResponse)).toBeUndefined();
        expect(onRuntimeMessage({
            type: 'addCurrentSiteRule',
            tabId: 42,
            url: 'https://localhost/',
            scope: 'domain',
        }, {}, sendResponse)).toBeUndefined();
        expect(onRuntimeMessage({
            type: 'addCurrentSiteRule',
            tabId: 42,
            url: 'https://example.com/',
            scope: 'invalid',
        }, {}, sendResponse)).toBeUndefined();

        expect(sendResponse).toHaveBeenCalledTimes(5);
        expect(sendResponse).toHaveBeenNthCalledWith(1, {ok: false});
        expect(sendResponse).toHaveBeenNthCalledWith(2, {ok: false});
        expect(sendResponse).toHaveBeenNthCalledWith(3, {ok: false});
        expect(sendResponse).toHaveBeenNthCalledWith(4, {ok: false});
        expect(sendResponse).toHaveBeenNthCalledWith(5, {ok: false});
        expect(mockChrome.storage.local.get).not.toHaveBeenCalled();
        expect(mockChrome.storage.local.set).not.toHaveBeenCalled();
    });

    it('reports popup rule storage read and save failures', () => {
        const sendResponse = jest.fn();
        mockChrome.storage.local.get.mockImplementationOnce((_keys, callback) => {
            mockChrome.runtime.lastError = {message: 'Read failed'};
            callback({});
            mockChrome.runtime.lastError = undefined;
        });

        onRuntimeMessage({
            type: 'addCurrentSiteRule',
            tabId: 42,
            url: 'https://read-failure.example/',
            scope: 'domain',
        }, {}, sendResponse);
        expect(sendResponse).toHaveBeenLastCalledWith({ok: false});

        mockChrome.storage.local.get.mockImplementationOnce((_keys, callback) => callback({
            enabled: true,
            pausedUntil: 0,
            blocked: [],
        }));
        mockChrome.storage.local.set.mockImplementationOnce((_values, callback) => {
            mockChrome.runtime.lastError = {message: 'Save failed'};
            callback?.();
            mockChrome.runtime.lastError = undefined;
        });

        onRuntimeMessage({
            type: 'addCurrentSiteRule',
            tabId: 42,
            url: 'https://save-failure.example/',
            scope: 'domain',
        }, {}, sendResponse);
        expect(sendResponse).toHaveBeenLastCalledWith({ok: false});

        mockChrome.storage.local.get.mockImplementationOnce((_keys, callback) => callback({
            enabled: true,
            pausedUntil: 0,
            blocked: [{name: 'update-failure.example', scope: 'domain', enabled: false}],
        }));
        mockChrome.storage.local.set.mockImplementationOnce((_values, callback) => {
            mockChrome.runtime.lastError = {message: 'Update failed'};
            callback?.();
            mockChrome.runtime.lastError = undefined;
        });

        onRuntimeMessage({
            type: 'addCurrentSiteRule',
            tabId: 42,
            url: 'https://update-failure.example/',
            scope: 'domain',
        }, {}, sendResponse);
        expect(sendResponse).toHaveBeenLastCalledWith({ok: false});
    });

    it.each([
        ['a non-list value', 'malformed'],
        ['a string entry', ['oops']],
        ['a null entry', [null]],
        ['an entry without a name', [{enabled: true}]],
        ['an entry with a non-string name', [{name: 5, enabled: true}]],
        ['an entry with an invalid scope', [{name: 'other.example', scope: 'invalid', enabled: true}]],
        ['an entry with an invalid website', [{name: 'invalid', scope: 'domain', enabled: true}]],
    ])('safely removes %s when adding from the popup', (_description, blocked) => {
        mockChrome.storage.local.get.mockImplementation((_keys, callback) => callback({
            enabled: true,
            pausedUntil: 0,
            blocked,
        }));
        const sendResponse = jest.fn();

        onRuntimeMessage({
            type: 'addCurrentSiteRule',
            tabId: 42,
            url: 'https://example.com/',
            scope: 'domain',
        }, {}, sendResponse);

        expect(mockChrome.storage.local.set).toHaveBeenCalledWith({
            blocked: [{name: 'example.com', scope: 'domain', enabled: true}],
        }, expect.any(Function));
        expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ok: true}));
    });

    it('keeps an existing inactive domain schedule when requested from the context menu', async () => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date(2026, 7, 24, 18, 0));
        const scheduledRule = {
            name: 'linkedin.com', scope: 'domain', enabled: true,
            schedule: {daily: [{day: 1, mode: 'period', start: '08:00', end: '17:00'}]},
        };
        mockChrome.storage.local.get.mockImplementation((_keys, callback) => callback({
            enabled: true, pausedUntil: 0, blocked: [scheduledRule],
        }));
        mockChrome.scripting.executeScript.mockImplementationOnce((options, callback) => {
            expect(options.args).toEqual(['linkedin.com', 'Mon | 08:00-17:00']);
            callback([{result: false}]);
        });

        onContextMenuClicked(
            {menuItemId: 'blockPage'},
            {id: 9, url: 'https://linkedin.com/feed/', title: 'LinkedIn'}
        );
        await Promise.resolve();
        await Promise.resolve();

        expect(mockChrome.storage.local.set).not.toHaveBeenCalled();
        expect(mockChrome.tabs.reload).not.toHaveBeenCalled();
    });

    it('shows a covering parent schedule when blocking a subdomain', async () => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date(2026, 7, 24, 18, 0));
        const scheduledRule = {
            name: 'reddit.com', scope: 'domain', enabled: true,
            schedule: {daily: [{day: 1, mode: 'period', start: '08:00', end: '17:00'}]},
        };
        mockChrome.storage.local.get.mockImplementation((_keys, callback) => callback({
            enabled: true, pausedUntil: 0, blocked: [scheduledRule],
        }));
        mockChrome.scripting.executeScript.mockImplementationOnce((options, callback) => {
            expect(options.args).toEqual(['reddit.com', 'Mon | 08:00-17:00']);
            callback([{result: false}]);
        });

        onContextMenuClicked(
            {menuItemId: 'blockPage'},
            {id: 13, url: 'https://old.reddit.com/feed/', title: 'Reddit'}
        );
        await Promise.resolve();
        await Promise.resolve();

        expect(mockChrome.storage.local.set).not.toHaveBeenCalled();
        expect(mockChrome.tabs.reload).not.toHaveBeenCalled();
    });

    it('shows an existing domain-only schedule on its exact domain', async () => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date(2026, 7, 24, 18, 0));
        const scheduledRule = {
            name: 'youtube.com', scope: 'domain', includeSubdomains: false, enabled: true,
            schedule: {daily: [{day: 1, mode: 'period', start: '08:00', end: '17:00'}]},
        };
        mockChrome.storage.local.get.mockImplementation((_keys, callback) => callback({
            enabled: true, pausedUntil: 0, blocked: [scheduledRule],
        }));
        mockChrome.scripting.executeScript.mockImplementationOnce((options, callback) => {
            expect(options.args).toEqual(['youtube.com', 'Mon | 08:00-17:00']);
            callback([{result: false}]);
        });

        onContextMenuClicked(
            {menuItemId: 'blockPage'},
            {id: 14, url: 'https://youtube.com/watch', title: 'YouTube'}
        );
        await Promise.resolve();
        await Promise.resolve();

        expect(mockChrome.storage.local.set).not.toHaveBeenCalled();
        expect(mockChrome.tabs.reload).not.toHaveBeenCalled();
    });

    it('removes an inactive domain schedule only after explicit confirmation', async () => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date(2026, 7, 24, 18, 0));
        const scheduledRule = {
            name: 'linkedin.com', scope: 'domain', enabled: true,
            schedule: {daily: [{day: 1, mode: 'period', start: '08:00', end: '17:00'}]},
        };
        mockChrome.storage.local.get.mockImplementation((_keys, callback) => callback({
            enabled: true, pausedUntil: 0, blocked: [scheduledRule],
        }));
        mockChrome.scripting.executeScript.mockImplementationOnce((_options, callback) => {
            callback([{result: true}]);
        });

        onContextMenuClicked(
            {menuItemId: 'blockPage'},
            {id: 10, url: 'https://linkedin.com/feed/', title: 'LinkedIn'}
        );
        await Promise.resolve();
        await Promise.resolve();

        expect(mockChrome.storage.local.set).toHaveBeenCalledWith(
            {blocked: [{name: 'linkedin.com', scope: 'domain', enabled: true}]},
            expect.any(Function)
        );
        expect(mockChrome.tabs.reload).toHaveBeenCalledWith(10);
    });

    it.each([
        [{enabled: false, pausedUntil: 0, blocked: []}, 'currently off'],
        [{enabled: true, pausedUntil: Date.now() + 60_000, blocked: []}, 'temporarily paused'],
    ])('adds a context-menu rule and warns when blocking is unavailable', async (state, message) => {
        mockChrome.storage.local.get.mockImplementation((_keys, callback) => callback(state));

        onContextMenuClicked(
            {menuItemId: 'blockPage'},
            {id: 8, url: 'https://example.com', title: 'Example'}
        );
        await Promise.resolve();

        expect(mockChrome.scripting.executeScript).toHaveBeenCalledWith(
            expect.objectContaining({target: {tabId: 8}, args: [expect.stringContaining(message)]}),
            expect.any(Function)
        );
        expect(mockChrome.storage.local.set).toHaveBeenCalledWith(
            {blocked: [{name: 'example.com', scope: 'domain', enabled: true}]},
            expect.any(Function)
        );
        expect(mockChrome.tabs.reload).not.toHaveBeenCalled();
    });
});
