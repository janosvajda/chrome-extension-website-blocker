const mockChrome = {
    runtime: {
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
        remove: jest.fn((tabId, callback) => {
            if (callback) {
                callback();
            }
        }),
        create: jest.fn(),
        reload: jest.fn(),
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
        onStorageChanged = mockChrome.storage.onChanged.addListener.mock.calls[0][0];
        onTabUpdated = mockChrome.tabs.onUpdated.addListener.mock.calls[0][0];
        initializeStorageDefaults = mockChrome.runtime.onInstalled.addListener.mock.calls[0][0];
        createContextMenu = mockChrome.runtime.onInstalled.addListener.mock.calls[1][0];
    });
});

beforeEach(() => {
    resetBlockedStateForTest();
    jest.clearAllMocks();
    mockChrome.storage.local.get.mockImplementation((_keys, callback) => callback({blocked: []}));
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
        });

        blockPage(1, 'https://example.com/another-path');
        expect(mockChrome.tabs.remove).toHaveBeenCalledTimes(1);
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
        expect(warningParams.has('host')).toBe(false);
        expect(warningParams.has('url')).toBe(false);
        expect(warningUrl).not.toContain('v%3D123');
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
        });
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
