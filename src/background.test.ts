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
        create: jest.fn(),
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
        createContextMenu = mockChrome.runtime.onInstalled.addListener.mock.calls[1][0];
    });
});

beforeEach(() => {
    resetBlockedStateForTest();
    jest.clearAllMocks();
});

describe('background blocked hostnames cache', () => {
    it('shows the block-page context menu only on HTTP and HTTPS pages', () => {
        createContextMenu();

        expect(mockChrome.contextMenus.create).toHaveBeenCalledWith({
            id: 'blockPage',
            title: 'Block this page by Tiny Blocker',
            contexts: ['page'],
            documentUrlPatterns: ['http://*/*', 'https://*/*'],
        });
    });

    it('tracks only enabled hostnames and normalizes them', () => {
        rebuildBlockedHostnames([
            { name: 'https://www.example.com', enabled: true },
            { name: 'disabled.com', enabled: false },
        ]);

        expect(shouldBlockHostname('example.com')).toBe(true);
        expect(shouldBlockHostname('disabled.com')).toBe(false);
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
    });

    it('blocks a tab when a specific URL is cached as blocked', () => {
        rebuildBlockedHostnames([
            { name: 'https://www.youtube.com/watch?v=123', scope: 'url', enabled: true },
        ]);

        blockPage(1, 'https://www.youtube.com/watch?v=123');

        expect(mockChrome.tabs.remove).toHaveBeenCalledWith(1, expect.any(Function));
        expect(mockChrome.tabs.create).toHaveBeenCalledWith({
            url: expect.stringContaining('warning.html?reason=url'),
        });
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

    it('re-enables an existing disabled context-menu rule and reloads the tab', async () => {
        mockChrome.storage.local.get.mockImplementationOnce((keys, callback) => {
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
});
