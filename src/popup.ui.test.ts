/** @jest-environment jsdom */

function setup(data: Record<string, any>, minimal = false) {
    document.body.innerHTML = `
        <input id="enabledToggle" type="checkbox">
        ${minimal ? '' : `<span id="statusText"></span><span id="activeRules"></span>
        <span id="blockedToday"></span><span id="blockedTotal"></span>
        <section id="pausePanel" hidden>
            <div id="pauseChoices">
                <button data-pause-minutes="15"></button>
                <button data-pause-minutes="30"></button>
                <button data-pause-minutes="60"></button>
                <button data-pause-minutes="invalid"></button>
                <button data-pause-minutes="0"></button>
            </div>
            <div id="activePause" hidden>
                <strong id="pauseRemaining"></strong><span id="pauseResumeTime"></span>
                <button id="resumeButton"></button>
            </div>
        </section>
        <p id="pauseNudge" hidden></p>
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
    afterEach(() => {
        jest.useRealTimers();
        delete (global as any).chrome;
    });

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
        expect(chromeMock.storage.local.set).toHaveBeenCalledWith({
            enabled: false,
            pausedUntil: 0,
            pauseUsage: {count: 1, date: expect.any(String)},
        });
        expect(document.getElementById('statusText')?.textContent).toBe('Blocking is off');
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
        expect(chromeMock.storage.local.set).toHaveBeenCalledWith({
            enabled: false,
            pausedUntil: 0,
            pauseUsage: {count: 1, date: expect.any(String)},
        });
    });

    it('renders an existing pause safely when optional display elements are absent', () => {
        jest.useFakeTimers();
        const now = new Date(2026, 7, 25, 10, 0).getTime();
        jest.setSystemTime(now);
        setup({enabled: true, pausedUntil: now + 60_000, blocked: [], statistics: {}}, true);
        expect((document.getElementById('enabledToggle') as HTMLInputElement).checked).toBe(false);
        window.dispatchEvent(new Event('unload'));
    });

    it('pauses temporarily, shows remaining time, resumes, and expires automatically', () => {
        jest.useFakeTimers();
        const now = new Date(2026, 7, 25, 10, 0).getTime();
        jest.setSystemTime(now);
        const chromeMock = setup({enabled: true, pausedUntil: 0, blocked: [], statistics: {}});

        (document.querySelector('[data-pause-minutes="15"]') as HTMLButtonElement).click();
        expect(chromeMock.storage.local.set).toHaveBeenCalledWith({
            pausedUntil: now + 15 * 60_000,
            pauseUsage: {count: 1, date: '2026-08-25'},
        });
        expect(document.getElementById('statusText')?.textContent).toBe('Blocking is temporarily paused');
        expect(document.getElementById('pauseRemaining')?.textContent).toBe('15 minutes remaining');
        expect(document.getElementById('pauseResumeTime')?.textContent).toMatch(/^Resumes automatically at /);
        expect((document.getElementById('enabledToggle') as HTMLInputElement).checked).toBe(false);

        jest.setSystemTime(now + 14 * 60_000 - 1_000);
        jest.advanceTimersByTime(1_000);
        expect(document.getElementById('pauseRemaining')?.textContent).toBe('1 minute remaining');

        document.getElementById('resumeButton')?.click();
        expect(chromeMock.storage.local.set).toHaveBeenLastCalledWith({pausedUntil: 0});
        expect(document.getElementById('statusText')?.textContent).toBe('Blocking is on');

        jest.setSystemTime(now);
        (document.querySelector('[data-pause-minutes="15"]') as HTMLButtonElement).click();
        jest.setSystemTime(now + 14 * 60_000 + 30_000);
        jest.advanceTimersByTime(1_000);
        expect(document.getElementById('pauseRemaining')?.textContent).toBe('Less than 1 minute remaining');

        jest.setSystemTime(now + 15 * 60_000);
        jest.advanceTimersByTime(1_000);
        expect(document.getElementById('statusText')?.textContent).toBe('Blocking is on');
        expect(chromeMock.storage.local.set).toHaveBeenLastCalledWith({pausedUntil: 0});
    });

    it('shows a friendly nudge from the fourth pause and resets the count on a new day', () => {
        jest.useFakeTimers();
        const now = new Date(2026, 7, 25, 10, 0).getTime();
        jest.setSystemTime(now);
        const chromeMock = setup({
            enabled: true,
            pausedUntil: 0,
            pauseUsage: {count: 3, date: '2026-08-25'},
            blocked: [],
            statistics: {},
        });
        (document.querySelector('[data-pause-minutes="15"]') as HTMLButtonElement).click();
        expect((document.getElementById('pauseNudge') as HTMLElement).hidden).toBe(false);
        expect([
            'Boing! Another pause has entered the chat. 😄',
            'Your focus called—it says it’ll be right back. ☕',
            'The pause button is becoming today’s most-clicked celebrity. 🎬',
        ]).toContain(document.getElementById('pauseNudge')?.textContent);
        expect(chromeMock.storage.local.set).toHaveBeenCalledWith(expect.objectContaining({
            pauseUsage: {count: 4, date: '2026-08-25'},
        }));

        jest.resetModules();
        document.body.innerHTML = '';
        setup({
            enabled: true,
            pausedUntil: 0,
            pauseUsage: {count: 9, date: '2026-08-24'},
            blocked: [],
            statistics: {},
        });
        (document.querySelector('[data-pause-minutes="15"]') as HTMLButtonElement).click();
        expect((document.getElementById('pauseNudge') as HTMLElement).hidden).toBe(true);
    });

    it('keeps the selected nudge stable while the countdown refreshes', () => {
        jest.useFakeTimers();
        const now = new Date(2026, 7, 25, 10, 0).getTime();
        jest.setSystemTime(now);
        setup({
            enabled: true,
            pausedUntil: 0,
            pauseUsage: {count: 3, date: '2026-08-25'},
            blocked: [],
            statistics: {},
        });
        (document.querySelector('[data-pause-minutes="15"]') as HTMLButtonElement).click();
        const message = document.getElementById('pauseNudge')?.textContent;
        jest.advanceTimersByTime(5_000);
        expect(document.getElementById('pauseNudge')?.textContent).toBe(message);
    });

    it('does not restore a reminder when the popup reopens during an existing pause', () => {
        jest.useFakeTimers();
        const now = new Date(2026, 7, 25, 10, 0).getTime();
        jest.setSystemTime(now);
        setup({
            enabled: true,
            pausedUntil: now + 15 * 60_000,
            pauseUsage: {count: 4, date: '2026-08-25'},
            blocked: [],
            statistics: {},
        });
        expect((document.getElementById('pauseNudge') as HTMLElement).hidden).toBe(true);
        expect(document.getElementById('pauseRemaining')?.textContent).toBe('15 minutes remaining');
    });

    it('counts switching blocking off and shows a nudge from the fourth combined pause', () => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date(2026, 7, 25, 10, 0));
        const chromeMock = setup({
            enabled: true,
            pausedUntil: 0,
            pauseUsage: {count: 3, date: '2026-08-25'},
            blocked: [],
            statistics: {},
        });
        const toggle = document.getElementById('enabledToggle') as HTMLInputElement;
        toggle.checked = false;
        toggle.dispatchEvent(new Event('change'));
        expect((document.getElementById('pauseNudge') as HTMLElement).hidden).toBe(false);
        expect(chromeMock.storage.local.set).toHaveBeenCalledWith({
            enabled: false,
            pausedUntil: 0,
            pauseUsage: {count: 4, date: '2026-08-25'},
        });

        toggle.checked = true;
        toggle.dispatchEvent(new Event('change'));
        expect((document.getElementById('pauseNudge') as HTMLElement).hidden).toBe(true);
    });

    it('ignores malformed temporary-pause durations', () => {
        const chromeMock = setup({enabled: true, pausedUntil: 0, blocked: [], statistics: {}});
        (document.querySelector('[data-pause-minutes="invalid"]') as HTMLButtonElement).click();
        (document.querySelector('[data-pause-minutes="0"]') as HTMLButtonElement).click();
        expect(chromeMock.storage.local.set).not.toHaveBeenCalled();
    });
});
