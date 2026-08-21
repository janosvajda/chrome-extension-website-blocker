import {parseImportedConfiguration} from '../helper/extensionState';

type Listener = (...args: any[]) => void;
type StorageData = Record<string, any>;

function createChromeHarness() {
    const storage: StorageData = {};
    const storageListeners: Listener[] = [];
    const contextMenuListeners: Listener[] = [];

    function resolveGet(keys: any): StorageData {
        if (Array.isArray(keys)) {
            return Object.fromEntries(keys.map((key) => [key, storage[key]]));
        }
        if (typeof keys === 'string') {
            return { [keys]: storage[keys] };
        }
        return Object.fromEntries(
            Object.entries(keys || {}).map(([key, fallback]) => [
                key,
                storage[key] === undefined ? fallback : storage[key],
            ])
        );
    }

    const chromeMock = {
        runtime: {
            lastError: undefined,
            onInstalled: { addListener: jest.fn() },
            openOptionsPage: jest.fn(),
        },
        contextMenus: {
            create: jest.fn(),
            onClicked: {
                addListener: jest.fn((listener: Listener) => contextMenuListeners.push(listener)),
            },
        },
        storage: {
            local: {
                get: jest.fn((keys: any, callback: Listener) => callback(resolveGet(keys))),
                set: jest.fn((values: StorageData, callback?: Listener) => {
                    const changes = Object.fromEntries(
                        Object.entries(values).map(([key, newValue]) => [
                            key,
                            { oldValue: storage[key], newValue },
                        ])
                    );
                    Object.assign(storage, values);
                    storageListeners.forEach((listener) => listener(changes, 'local'));
                    callback?.();
                    return Promise.resolve();
                }),
            },
            onChanged: {
                addListener: jest.fn((listener: Listener) => storageListeners.push(listener)),
            },
        },
        tabs: {
            remove: jest.fn((_tabId: number, callback?: Listener) => callback?.()),
            create: jest.fn(),
            reload: jest.fn(),
            onUpdated: { addListener: jest.fn() },
        },
        scripting: { executeScript: jest.fn() },
    };

    return {chromeMock, contextMenuListeners, storage};
}

describe('complete extension workflow', () => {
    beforeEach(() => {
        jest.resetModules();
    });

    afterEach(() => {
        delete (global as any).chrome;
    });

    it('imports rules, blocks matching pages, records statistics, and respects global pause', () => {
        const harness = createChromeHarness();
        (global as any).chrome = harness.chromeMock;
        const {blockPage} = require('../background') as typeof import('../background');

        const imported = parseImportedConfiguration({
            version: 1,
            enabled: true,
            blocked: [
                {name: 'https://www.example.com', scope: 'domain', enabled: true},
                {name: 'https://video.test/watch?v=42', scope: 'url', enabled: true},
            ],
        });
        harness.chromeMock.storage.local.set({
            blocked: imported.blocked,
            enabled: imported.enabled,
        });

        blockPage(11, 'https://example.com/distracting');
        blockPage(12, 'https://video.test/watch?v=42');

        expect(harness.chromeMock.tabs.remove).toHaveBeenCalledTimes(2);
        expect(harness.chromeMock.tabs.create).toHaveBeenNthCalledWith(1, {
            url: expect.stringContaining('warning.html?reason=domain'),
        });
        expect(harness.chromeMock.tabs.create).toHaveBeenNthCalledWith(2, {
            url: expect.stringContaining('warning.html?reason=url'),
        });
        expect(harness.storage.statistics).toEqual(expect.objectContaining({total: 2, today: 2}));

        harness.chromeMock.storage.local.set({enabled: false});
        blockPage(13, 'https://example.com/another-page');

        expect(harness.chromeMock.tabs.remove).toHaveBeenCalledTimes(2);
        expect(harness.storage.statistics.total).toBe(2);
    });

    it('adds a domain rule through the context-menu workflow and blocks it immediately', async () => {
        const harness = createChromeHarness();
        (global as any).chrome = harness.chromeMock;
        const {blockPage} = require('../background') as typeof import('../background');
        const contextMenuClick = harness.contextMenuListeners[0];

        contextMenuClick(
            {menuItemId: 'blockPage'},
            {id: 21, url: 'https://news.example/', title: 'News'},
        );
        await Promise.resolve();

        expect(harness.storage.blocked).toEqual([
            {name: 'news.example', scope: 'domain', enabled: true},
        ]);
        expect(harness.chromeMock.tabs.reload).toHaveBeenCalledWith(21);

        blockPage(22, 'https://news.example/article');
        expect(harness.chromeMock.tabs.remove).toHaveBeenCalledWith(22, expect.any(Function));
    });
});
