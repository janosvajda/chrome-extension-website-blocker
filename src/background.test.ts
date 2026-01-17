const mockChrome = {
    runtime: {
        onInstalled: {
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
            set: jest.fn(),
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
        onUpdated: {
            addListener: jest.fn(),
        },
    },
};

let blockPage: typeof import("./background").blockPage;
let rebuildBlockedHostnames: typeof import("./background").rebuildBlockedHostnames;
let resetBlockedStateForTest: typeof import("./background").resetBlockedStateForTest;
let shouldBlockHostname: typeof import("./background").shouldBlockHostname;

beforeAll(() => {
    (global as any).chrome = mockChrome;
    jest.isolateModules(() => {
        const background = require("./background");
        blockPage = background.blockPage;
        rebuildBlockedHostnames = background.rebuildBlockedHostnames;
        resetBlockedStateForTest = background.resetBlockedStateForTest;
        shouldBlockHostname = background.shouldBlockHostname;
    });
});

beforeEach(() => {
    resetBlockedStateForTest();
    jest.clearAllMocks();
});

describe("background blocked hostnames cache", () => {
    it("tracks only enabled hostnames and normalizes them", () => {
        rebuildBlockedHostnames([
            { name: "https://www.example.com", enabled: true },
            { name: "disabled.com", enabled: false },
        ]);

        expect(shouldBlockHostname("example.com")).toBe(true);
        expect(shouldBlockHostname("disabled.com")).toBe(false);
    });

    it("blocks a tab when hostname is cached as blocked", () => {
        rebuildBlockedHostnames([{ name: "example.com", enabled: true }]);

        blockPage(1, "https://example.com/path");

        expect(mockChrome.tabs.remove).toHaveBeenCalledWith(1, expect.any(Function));
        expect(mockChrome.tabs.create).toHaveBeenCalledWith({ url: "warning.html" });
    });
});