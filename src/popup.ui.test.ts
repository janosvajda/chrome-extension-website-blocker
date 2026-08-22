/** @jest-environment jsdom */

function setup(data: Record<string, any>, minimal = false) {
    document.body.innerHTML = `
        <input id="enabledToggle" type="checkbox">
        ${minimal ? '' : `<span id="statusText"></span><span id="activeRules"></span>
        <span id="blockedToday"></span><span id="blockedTotal"></span>
        <button id="openOptionsButton"></button>`}`;
    const chromeMock = {
        storage: {local: {
            get: jest.fn((_defaults, callback) => callback(data)),
            set: jest.fn(),
        }},
        runtime: {openOptionsPage: jest.fn()},
    };
    (global as any).chrome = chromeMock;
    jest.isolateModules(() => require('./popup'));
    return chromeMock;
}

describe('popup UI', () => {
    beforeEach(() => jest.resetModules());
    afterEach(() => delete (global as any).chrome);

    it('renders counts, toggles blocking, and opens options', () => {
        const chromeMock = setup({
            enabled: true,
            blocked: [{enabled: true}, {enabled: false}, null],
            statistics: {total: 9, today: 3, date: new Date().toLocaleDateString('en-CA')},
        });
        expect(document.getElementById('activeRules')?.textContent).toBe('1');
        expect(document.getElementById('blockedToday')?.textContent).toBe('3');
        const toggle = document.getElementById('enabledToggle') as HTMLInputElement;
        toggle.checked = false;
        toggle.dispatchEvent(new Event('change'));
        expect(chromeMock.storage.local.set).toHaveBeenCalledWith({enabled: false});
        expect(document.getElementById('statusText')?.textContent).toBe('Blocking is paused');
        document.getElementById('openOptionsButton')?.click();
        expect(chromeMock.runtime.openOptionsPage).toHaveBeenCalled();
    });

    it('uses safe defaults for malformed stored data', () => {
        setup({enabled: false, blocked: 'invalid', statistics: null});
        expect(document.getElementById('activeRules')?.textContent).toBe('0');
        expect(document.getElementById('blockedTotal')?.textContent).toBe('0');
    });

    it('keeps the required toggle functional when optional display elements are absent', () => {
        const chromeMock = setup({enabled: true, blocked: [], statistics: {}}, true);
        const toggle = document.getElementById('enabledToggle') as HTMLInputElement;
        toggle.checked = false;
        toggle.dispatchEvent(new Event('change'));
        expect(chromeMock.storage.local.set).toHaveBeenCalledWith({enabled: false});
    });
});
