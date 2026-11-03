type StorageCallback = (data: Record<string, unknown>) => void;

describe('background service-worker startup', () => {
    it('waits for stored rules before handling an early tab update', async () => {
        let completeInitialLoad: StorageCallback | undefined;
        let onTabUpdated: ((tabId: number, changeInfo: unknown, tab: {url?: string}) => Promise<void>) | undefined;
        const chromeMock = {
            runtime: {
                lastError: undefined,
                onInstalled: {addListener: jest.fn()},
            },
            contextMenus: {
                create: jest.fn(),
                removeAll: jest.fn(),
                onClicked: {addListener: jest.fn()},
            },
            storage: {
                local: {
                    get: jest.fn((_defaults, callback) => {
                        completeInitialLoad = callback;
                    }),
                    set: jest.fn(),
                },
                onChanged: {addListener: jest.fn()},
            },
            tabs: {
                remove: jest.fn((_tabId, callback) => callback?.()),
                create: jest.fn(),
                reload: jest.fn(),
                onUpdated: {
                    addListener: jest.fn((listener) => {
                        onTabUpdated = listener;
                    }),
                },
            },
            scripting: {executeScript: jest.fn()},
        };
        (global as any).chrome = chromeMock;

        jest.isolateModules(() => require('./background'));
        const pendingUpdate = onTabUpdated?.(
            42,
            {url: 'https://startup.example/path'},
            {url: 'https://startup.example/path'},
        );
        await Promise.resolve();

        expect(chromeMock.tabs.remove).not.toHaveBeenCalled();
        completeInitialLoad?.({
            blocked: [{name: 'startup.example', scope: 'domain', enabled: true}],
            enabled: true,
            pausedUntil: 0,
            schedules: [],
        });
        await pendingUpdate;

        expect(chromeMock.tabs.remove).toHaveBeenCalledWith(42, expect.any(Function));
        expect(chromeMock.tabs.create).toHaveBeenCalledWith({
            url: expect.stringContaining('warning.html?reason=domain'),
        });
        delete (global as any).chrome;
    });
});
