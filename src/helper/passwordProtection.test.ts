type Listener = (event?: any) => void | Promise<void>;

function createElementMock(initialHidden = false) {
    const listeners: Record<string, Listener[]> = {};
    const attributes: Record<string, string> = {};
    if (initialHidden) {
        attributes.hidden = "true";
    }

    return {
        textContent: "",
        value: "",
        addEventListener: jest.fn((eventName: string, callback: Listener) => {
            if (!listeners[eventName]) {
                listeners[eventName] = [];
            }
            listeners[eventName].push(callback);
        }),
        async dispatch(eventName: string, eventData?: any) {
            const callbacks = listeners[eventName] || [];
            for (const callback of callbacks) {
                await callback(eventData);
            }
        },
        click() {
            return this.dispatch("click");
        },
        setAttribute(name: string, value: string) {
            attributes[name] = value;
        },
        removeAttribute(name: string) {
            delete attributes[name];
        },
        toggleAttribute(name: string, force?: boolean) {
            const shouldHaveAttribute = force === undefined ? !attributes[name] : force;
            if (shouldHaveAttribute) {
                attributes[name] = "true";
            } else {
                delete attributes[name];
            }
        },
        hasAttribute(name: string) {
            return Object.prototype.hasOwnProperty.call(attributes, name);
        },
        focus: jest.fn(),
    };
}

function createDocumentAndElements() {
    const elements: Record<string, any> = {
        lockScreen: createElementMock(true),
        appContent: createElementMock(true),
        passwordInput: createElementMock(),
        unlockButton: createElementMock(),
        unlockError: createElementMock(),
        passwordButton: createElementMock(),
        passwordModal: createElementMock(true),
        passwordTitle: createElementMock(),
        modalPasswordInput: createElementMock(),
        savePasswordButton: createElementMock(),
        clearPasswordButton: createElementMock(),
        cancelPasswordButton: createElementMock(),
        modalPasswordHint: createElementMock(),
        passwordNotice: createElementMock(true),
    };

    const documentMock = {
        getElementById: jest.fn((id: string) => elements[id] || null),
    };

    return {
        documentMock,
        elements,
    };
}

function createChromeStorageMock(initialState: Record<string, any>) {
    const state = { ...initialState };
    const localGet = jest.fn((keys: any, callback: (value: any) => void) => {
        if (Array.isArray(keys)) {
            const result = keys.reduce((accumulator, key) => {
                accumulator[key] = state[key];
                return accumulator;
            }, {});
            callback(result);
            return;
        }
        if (typeof keys === "string") {
            callback({ [keys]: state[keys] });
            return;
        }
        const defaults = keys && typeof keys === "object" ? keys : {};
        const result = { ...defaults };
        Object.keys(defaults).forEach((key) => {
            if (Object.prototype.hasOwnProperty.call(state, key)) {
                result[key] = state[key];
            }
        });
        callback(result);
    });
    const localSet = jest.fn((payload: Record<string, any>, callback?: () => void) => {
        Object.assign(state, payload);
        if (callback) {
            callback();
        }
    });
    const localRemove = jest.fn((keys: string[] | string, callback?: () => void) => {
        const values = Array.isArray(keys) ? keys : [keys];
        values.forEach((key) => {
            delete state[key];
        });
        if (callback) {
            callback();
        }
    });

    return {
        state,
        chromeMock: {
            storage: {
                local: {
                    get: localGet,
                    set: localSet,
                    remove: localRemove,
                },
            },
        },
    };
}

async function sha256Hex(value: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}

describe("passwordProtection", () => {
    afterEach(() => {
        delete (global as any).__TINY_BLOCKER_PASSWORD_STORAGE_KEY__;
        delete (global as any).__TINY_BLOCKER_PASSWORD_SALT_STORAGE_KEY__;
        delete (global as any).document;
        delete (global as any).chrome;
        jest.resetModules();
        jest.clearAllMocks();
    });

    it("migrates legacy SHA-256 password hash to salted PBKDF2 after successful unlock", async () => {
        const legacyHash = await sha256Hex("secret123");
        const { chromeMock } = createChromeStorageMock({
            optionsPassword: legacyHash,
        });
        const { documentMock, elements } = createDocumentAndElements();

        (global as any).chrome = chromeMock;
        (global as any).document = documentMock;
        (global as any).__TINY_BLOCKER_PASSWORD_STORAGE_KEY__ = "optionsPassword";
        (global as any).__TINY_BLOCKER_PASSWORD_SALT_STORAGE_KEY__ = "optionsPasswordSalt";

        let initPasswordProtection: () => Promise<void>;
        jest.isolateModules(() => {
            ({ initPasswordProtection } = require("./passwordProtection"));
        });

        await initPasswordProtection();
        elements.passwordInput.value = "secret123";
        await elements.unlockButton.click();

        expect(chromeMock.storage.local.set).toHaveBeenCalledWith(
            expect.objectContaining({
                optionsPassword: expect.any(String),
                optionsPasswordSalt: expect.any(String),
            })
        );
        const migratedPayload = chromeMock.storage.local.set.mock.calls[0][0];
        expect(migratedPayload.optionsPassword).not.toBe(legacyHash);
        expect(migratedPayload.optionsPasswordSalt).toBeTruthy();
    });

    it("throws when password storage key config is missing", () => {
        const { chromeMock } = createChromeStorageMock({});
        const { documentMock } = createDocumentAndElements();

        (global as any).chrome = chromeMock;
        (global as any).document = documentMock;
        delete (global as any).__TINY_BLOCKER_PASSWORD_STORAGE_KEY__;
        delete (global as any).__TINY_BLOCKER_PASSWORD_SALT_STORAGE_KEY__;

        expect(() => {
            jest.isolateModules(() => {
                require("./passwordProtection");
            });
        }).toThrow("Missing password storage keys configuration.");
    });
});
