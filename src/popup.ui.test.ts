/** @jest-environment jsdom */

jest.mock('./helper/passphraseProtection', () => {
    const actual = jest.requireActual('./helper/passphraseProtection');
    return {...actual, verifyPassphrase: jest.fn()};
});

const mockShowBlockScopeDialog = jest.fn();
const mockShowCoveredUrlRulesDialog = jest.fn();
jest.mock('./background/dialogs', () => ({
    showBlockScopeDialog: (url: string) => mockShowBlockScopeDialog(url),
    showCoveredUrlRulesDialog: (domain: string, urls: Array<{url: string; enabled: boolean}>) =>
        mockShowCoveredUrlRulesDialog(domain, urls),
}));

const protection = {version: 1, iterations: 600000, salt: 'AQ==', iv: 'Ag==', ciphertext: 'Aw=='};

function setup(
    data: Record<string, any>,
    minimal = false,
    activeTabUrl = 'https://example.com/',
    includeCurrentSiteButton = true,
) {
    document.body.innerHTML = `
        <input id="enabledToggle" type="checkbox">
        ${minimal ? '' : `<span id="popupExtensionVersion"></span>
        <span id="statusText"></span><span id="activeRules"></span>
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
        <section id="currentSiteStatus" hidden>
            <strong id="currentSiteName"></strong><span id="currentSiteRuleStatus"></span>
            ${includeCurrentSiteButton ? `
                <button id="blockCurrentSiteButton" hidden></button>
                <button id="enableCurrentSiteRuleButton" hidden></button>` : ''}
        </section>
        <section id="passphrasePrompt" hidden>
            <p id="passphrasePromptDescription"></p>
            <input id="popupPassphrase"><span id="popupPassphraseStatus"></span>
            <button id="cancelPassphraseButton"></button><button id="confirmPassphraseButton"></button>
        </section>
        <button id="openOptionsButton"></button>`}`;
    if (minimal) {
        document.body.insertAdjacentHTML('beforeend', `
            <section id="passphrasePrompt" hidden>
                <p id="passphrasePromptDescription"></p>
                <input id="popupPassphrase"><span id="popupPassphraseStatus"></span>
                <button id="cancelPassphraseButton"></button><button id="confirmPassphraseButton"></button>
            </section>`);
    }
    const chromeMock = {
        storage: {local: {
            get: jest.fn((_defaults, callback) => callback(data)),
            set: jest.fn(),
        }},
        runtime: {
            getManifest: jest.fn(() => ({version: '1.0.7'})),
            openOptionsPage: jest.fn(),
            sendMessage: jest.fn((_message, callback) => callback({ok: false})),
            lastError: undefined,
        },
        tabs: {query: jest.fn((_query, callback) => callback([{id: 42, url: activeTabUrl}]))},
    };
    (global as any).chrome = chromeMock;
    jest.isolateModules(() => require('./popup'));
    return chromeMock;
}

async function flushPromises(): Promise<void> {
    for (let index = 0; index < 4; index += 1) await Promise.resolve();
}

describe('popup UI', () => {
    beforeEach(() => {
        jest.resetModules();
        mockShowBlockScopeDialog.mockReset();
        mockShowCoveredUrlRulesDialog.mockReset();
        mockShowBlockScopeDialog.mockResolvedValue('domain');
    });
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
        expect(document.getElementById('popupExtensionVersion')?.textContent).toBe('v1.0.7');
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

    it('shows the current website blocking status without changing its rule', () => {
        const chromeMock = setup({
            enabled: true,
            blocked: [{name: 'linkedin.com', scope: 'domain', enabled: true}],
            statistics: {},
        }, false, 'https://jobs.linkedin.com/feed/');

        expect(document.getElementById('currentSiteName')?.textContent).toBe('jobs.linkedin.com');
        expect(document.getElementById('currentSiteRuleStatus')?.textContent).toBe('Domain blocking · Active now');
        expect(chromeMock.storage.local.set).not.toHaveBeenCalled();
    });

    it('shows disabled, scheduled, and unmatched current website states', () => {
        setup({
            enabled: false,
            blocked: [{name: 'example.com', scope: 'domain', enabled: false}],
            statistics: {},
        }, false, 'https://old.example.com/');
        expect(document.getElementById('currentSiteRuleStatus')?.textContent)
            .toBe('A block exists for this website, but it is disabled.');
        expect((document.getElementById('enableCurrentSiteRuleButton') as HTMLButtonElement).hidden).toBe(false);

        jest.resetModules();
        document.body.innerHTML = '';
        jest.useFakeTimers();
        jest.setSystemTime(new Date(2026, 7, 24, 18, 0));
        setup({
            enabled: true,
            blocked: [{
                name: 'example.com', scope: 'domain', enabled: true,
                schedule: {daily: [{day: 1, mode: 'period', start: '08:00', end: '17:00'}]},
            }],
            statistics: {},
        }, false, 'https://old.example.com/');
        expect(document.querySelector('#currentSiteRuleStatus .scheduleDetails')?.textContent)
            .toBe('Scheduled blocking: Mon | 08:00-17:00');
        expect(document.querySelector('#currentSiteRuleStatus .availableNow')?.textContent)
            .toBe('Available now');

        jest.resetModules();
        document.body.innerHTML = '';
        setup({enabled: true, blocked: [], statistics: {}}, false, 'https://none.example/');
        expect(document.getElementById('currentSiteRuleStatus')?.textContent)
            .toBe('Not in your blocking list');
        expect((document.getElementById('blockCurrentSiteButton') as HTMLButtonElement).hidden).toBe(false);
    });

    it('enables the exact disabled rule and reloads the current page', () => {
        const chromeMock = setup({
            enabled: true,
            blocked: [{name: 'example.com', scope: 'domain', enabled: false}],
            statistics: {},
        }, false, 'https://old.example.com/article');
        chromeMock.runtime.sendMessage.mockImplementation((_message, callback) => callback({
            ok: true,
            blocked: [{name: 'example.com', scope: 'domain', enabled: true}],
            enabled: true,
            pausedUntil: 0,
            reload: 'started',
        }));

        document.getElementById('enableCurrentSiteRuleButton')?.click();

        expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({
            type: 'enableCurrentSiteRule',
            tabId: 42,
            url: 'https://old.example.com/article',
            rule: {name: 'example.com', scope: 'domain'},
        }, expect.any(Function));
        expect(document.getElementById('currentSiteRuleStatus')?.textContent)
            .toBe('Blocking enabled. Reloading this page now.');
        expect((document.getElementById('enableCurrentSiteRuleButton') as HTMLButtonElement).hidden).toBe(true);
        expect(document.getElementById('activeRules')?.textContent).toBe('1');
    });

    it('resolves covered full-URL blocks before enabling a disabled domain', async () => {
        const fullUrl = 'https://example.com/article';
        const chromeMock = setup({
            enabled: true,
            blocked: [
                {name: fullUrl, scope: 'url', enabled: true},
                {name: 'example.com', scope: 'domain', enabled: false},
            ],
            statistics: {},
        }, false, 'https://example.com/');
        mockShowCoveredUrlRulesDialog.mockResolvedValueOnce('delete');
        chromeMock.runtime.sendMessage.mockImplementation((request, callback) => {
            if (!request.coveredUrlAction) {
                callback({
                    ok: false,
                    coveredUrlConflict: {
                        domain: 'example.com',
                        urls: [{url: fullUrl, enabled: true}],
                    },
                });
                return;
            }
            callback({
                ok: true,
                blocked: [{name: 'example.com', scope: 'domain', enabled: true}],
                enabled: true,
                pausedUntil: 0,
                reload: 'started',
            });
        });

        document.getElementById('enableCurrentSiteRuleButton')?.click();
        await flushPromises();

        expect(mockShowCoveredUrlRulesDialog).toHaveBeenCalledWith('example.com', [
            {url: fullUrl, enabled: true},
        ]);
        expect(chromeMock.runtime.sendMessage).toHaveBeenLastCalledWith({
            type: 'enableCurrentSiteRule',
            tabId: 42,
            url: 'https://example.com/',
            rule: {name: 'example.com', scope: 'domain'},
            coveredUrlAction: 'delete',
            coveredUrls: [{url: fullUrl, enabled: true}],
        }, expect.any(Function));
        expect(document.getElementById('currentSiteRuleStatus')?.textContent)
            .toBe('Blocking enabled. Reloading this page now.');
    });

    it('keeps a disabled domain unchanged when its covered-URL dialog is cancelled', async () => {
        const fullUrl = 'https://example.com/article';
        const chromeMock = setup({
            enabled: true,
            blocked: [
                {name: fullUrl, scope: 'url', enabled: true},
                {name: 'example.com', scope: 'domain', enabled: false},
            ],
            statistics: {},
        }, false, 'https://example.com/');
        mockShowCoveredUrlRulesDialog.mockResolvedValueOnce(null);
        chromeMock.runtime.sendMessage.mockImplementation((_request, callback) => callback({
            ok: false,
            coveredUrlConflict: {
                domain: 'example.com',
                urls: [{url: fullUrl, enabled: true}],
            },
        }));

        document.getElementById('enableCurrentSiteRuleButton')?.click();
        await flushPromises();

        expect(chromeMock.runtime.sendMessage).toHaveBeenCalledTimes(1);
        expect(document.getElementById('currentSiteRuleStatus')?.textContent)
            .toBe('A block exists for this website, but it is disabled.');
        expect((document.getElementById('enableCurrentSiteRuleButton') as HTMLButtonElement).hidden).toBe(false);
    });

    it('ignores a second enable click while the first request is in progress', () => {
        const chromeMock = setup({
            enabled: true,
            blocked: [{name: 'example.com', scope: 'domain', enabled: false}],
            statistics: {},
        }, false, 'https://example.com/');
        chromeMock.runtime.sendMessage.mockImplementation(() => undefined);
        const button = document.getElementById('enableCurrentSiteRuleButton') as HTMLButtonElement;

        button.click();
        button.click();

        expect(chromeMock.runtime.sendMessage).toHaveBeenCalledTimes(1);
        expect(button.disabled).toBe(true);
        expect(document.getElementById('currentSiteRuleStatus')?.textContent)
            .toBe('Enabling blocking for this website…');
    });

    it('keeps the enable action available when enabling the rule fails', () => {
        const chromeMock = setup({
            enabled: true,
            blocked: [{name: 'https://example.com/article', scope: 'url', enabled: false}],
            statistics: {},
        }, false, 'https://example.com/article');
        chromeMock.runtime.sendMessage.mockImplementation((_message, callback) => callback({ok: false}));

        document.getElementById('enableCurrentSiteRuleButton')?.click();

        expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'enableCurrentSiteRule',
            rule: {name: 'https://example.com/article', scope: 'url'},
        }), expect.any(Function));
        expect(document.getElementById('currentSiteRuleStatus')?.textContent)
            .toBe('Could not enable blocking. Please try again.');
        const button = document.getElementById('enableCurrentSiteRuleButton') as HTMLButtonElement;
        expect(button.hidden).toBe(false);
        expect(button.disabled).toBe(false);
    });

    it.each([
        [false, 0, 'skipped', 'Blocking is enabled for this website. Tiny Website Blocker is currently off.'],
        [true, Date.now() + 60_000, 'skipped', 'Blocking is enabled for this website. Blocking is temporarily paused.'],
        [true, 0, 'failed', 'Blocking enabled. Reload this page to apply it.'],
    ] as const)(
        'explains why an enabled website did not reload',
        (enabled, pausedUntil, reload, expectedMessage) => {
            const chromeMock = setup({
                enabled,
                pausedUntil,
                blocked: [{name: 'example.com', scope: 'domain', enabled: false}],
                statistics: {},
            }, false, 'https://example.com/');
            chromeMock.runtime.sendMessage.mockImplementation((_message, callback) => callback({
                ok: true,
                blocked: [{name: 'example.com', scope: 'domain', enabled: true}],
                enabled,
                pausedUntil,
                reload,
            }));

            document.getElementById('enableCurrentSiteRuleButton')?.click();

            expect(document.getElementById('currentSiteRuleStatus')?.textContent).toBe(expectedMessage);
        }
    );

    it('shows an enabled inactive schedule without claiming that the page will reload', () => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date(2026, 7, 24, 18, 0));
        const schedule = {daily: [{day: 1, mode: 'period', start: '08:00', end: '17:00'}]};
        const chromeMock = setup({
            enabled: true,
            blocked: [{name: 'example.com', scope: 'domain', enabled: false, schedule}],
            statistics: {},
        }, false, 'https://example.com/');
        chromeMock.runtime.sendMessage.mockImplementation((_message, callback) => callback({
            ok: true,
            blocked: [{name: 'example.com', scope: 'domain', enabled: true, schedule}],
            enabled: true,
            pausedUntil: 0,
            reload: 'skipped',
        }));

        document.getElementById('enableCurrentSiteRuleButton')?.click();

        expect(document.querySelector('#currentSiteRuleStatus .scheduleDetails')?.textContent)
            .toBe('Scheduled blocking: Mon | 08:00-17:00');
        expect(document.querySelector('#currentSiteRuleStatus .availableNow')?.textContent)
            .toBe('Available now');
    });

    it('offers the shared scope choice and adds the selected full URL through the background', async () => {
        const chromeMock = setup({enabled: true, blocked: [], statistics: {}}, false, 'https://news.example.com/article');
        mockShowBlockScopeDialog.mockResolvedValueOnce('url');
        chromeMock.runtime.sendMessage.mockImplementation((_message, callback) => callback({
            ok: true,
            blocked: [
                {name: 'other.example', scope: 'domain', enabled: true},
                {name: 'https://news.example.com/article', scope: 'url', enabled: true},
            ],
            enabled: true,
            pausedUntil: 0,
            outcome: 'added',
            reload: 'started',
        }));

        document.getElementById('blockCurrentSiteButton')?.click();
        await Promise.resolve();

        expect(mockShowBlockScopeDialog).toHaveBeenCalledWith('https://news.example.com/article');
        expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({
            type: 'addCurrentSiteRule',
            tabId: 42,
            url: 'https://news.example.com/article',
            scope: 'url',
        }, expect.any(Function));
        expect(document.getElementById('currentSiteRuleStatus')?.textContent)
            .toBe('Added to your blocking list. Reloading this page now.');
        expect((document.getElementById('blockCurrentSiteButton') as HTMLButtonElement).hidden).toBe(true);
        expect(document.getElementById('activeRules')?.textContent).toBe('2');
        expect(chromeMock.storage.local.set).not.toHaveBeenCalled();
    });

    it('restores the add action when the scope dialog is cancelled', async () => {
        const chromeMock = setup({enabled: true, blocked: [], statistics: {}}, false, 'https://example.com/article');
        mockShowBlockScopeDialog.mockResolvedValueOnce(null);

        document.getElementById('blockCurrentSiteButton')?.click();
        await Promise.resolve();

        expect(chromeMock.runtime.sendMessage).not.toHaveBeenCalled();
        expect(document.getElementById('currentSiteRuleStatus')?.textContent).toBe('Not in your blocking list');
        const button = document.getElementById('blockCurrentSiteButton') as HTMLButtonElement;
        expect(button.hidden).toBe(false);
        expect(button.disabled).toBe(false);
    });

    it('resolves covered full-URL blocks before adding their domain', async () => {
        const existingUrl = 'https://example.com/existing';
        const chromeMock = setup({
            enabled: true,
            blocked: [{name: existingUrl, scope: 'url', enabled: true}],
            statistics: {},
        }, false, 'https://example.com/');
        mockShowCoveredUrlRulesDialog.mockResolvedValueOnce('disable');
        chromeMock.runtime.sendMessage.mockImplementation((request, callback) => {
            if (!request.coveredUrlAction) {
                callback({
                    ok: false,
                    coveredUrlConflict: {
                        domain: 'example.com',
                        urls: [{url: existingUrl, enabled: true}],
                    },
                });
                return;
            }
            callback({
                ok: true,
                blocked: [
                    {name: existingUrl, scope: 'url', enabled: false},
                    {name: 'example.com', scope: 'domain', enabled: true},
                ],
                enabled: true,
                pausedUntil: 0,
                outcome: 'added',
                reload: 'started',
            });
        });

        document.getElementById('blockCurrentSiteButton')?.click();
        await flushPromises();

        expect(mockShowCoveredUrlRulesDialog).toHaveBeenCalledWith('example.com', [
            {url: existingUrl, enabled: true},
        ]);
        expect(chromeMock.runtime.sendMessage).toHaveBeenLastCalledWith({
            type: 'addCurrentSiteRule',
            tabId: 42,
            url: 'https://example.com/',
            scope: 'domain',
            coveredUrlAction: 'disable',
            coveredUrls: [{url: existingUrl, enabled: true}],
        }, expect.any(Function));
        expect(document.getElementById('currentSiteRuleStatus')?.textContent)
            .toBe('Added to your blocking list. Reloading this page now.');
    });

    it('cancels adding a domain when its covered-URL dialog is cancelled', async () => {
        const existingUrl = 'https://example.com/existing';
        const chromeMock = setup({
            enabled: true,
            blocked: [{name: existingUrl, scope: 'url', enabled: true}],
            statistics: {},
        }, false, 'https://example.com/');
        mockShowCoveredUrlRulesDialog.mockResolvedValueOnce(null);
        chromeMock.runtime.sendMessage.mockImplementation((_request, callback) => callback({
            ok: false,
            coveredUrlConflict: {
                domain: 'example.com',
                urls: [{url: existingUrl, enabled: true}],
            },
        }));

        document.getElementById('blockCurrentSiteButton')?.click();
        await flushPromises();

        expect(chromeMock.runtime.sendMessage).toHaveBeenCalledTimes(1);
        expect(document.getElementById('currentSiteRuleStatus')?.textContent)
            .toBe('Not in your blocking list');
    });

    it.each([
        [false, 0, 'Added to your blocking list. Tiny Website Blocker is currently off.'],
        [true, Date.now() + 60_000, 'Added to your blocking list. Blocking is temporarily paused.'],
    ])('explains unavailable blocking after adding from the popup', (enabled, responsePausedUntil, message) => {
        const chromeMock = setup({enabled, pausedUntil: responsePausedUntil, blocked: [], statistics: {}}, false, 'https://example.com/');
        chromeMock.runtime.sendMessage.mockImplementation((_request, callback) => callback({
            ok: true,
            blocked: [{name: 'example.com', scope: 'domain', enabled: true}],
            enabled,
            pausedUntil: responsePausedUntil,
            outcome: 'added',
            reload: 'skipped',
        }));

        document.getElementById('blockCurrentSiteButton')?.click();

        expect(document.getElementById('currentSiteRuleStatus')?.textContent).toBe(message);
    });

    it('keeps the add action available after the background reports a failure', () => {
        const chromeMock = setup({enabled: true, blocked: [], statistics: {}}, false, 'https://example.com/');
        chromeMock.runtime.sendMessage.mockImplementation((_request, callback) => callback({ok: false}));

        document.getElementById('blockCurrentSiteButton')?.click();

        expect(document.getElementById('currentSiteRuleStatus')?.textContent)
            .toBe('Could not add this website. Please try again.');
        const button = document.getElementById('blockCurrentSiteButton') as HTMLButtonElement;
        expect(button.hidden).toBe(false);
        expect(button.disabled).toBe(false);
    });

    it('handles a rule added elsewhere while the popup request is in progress', () => {
        const chromeMock = setup({enabled: true, blocked: [], statistics: {}}, false, 'https://example.com/');
        chromeMock.runtime.sendMessage.mockImplementation((_request, callback) => callback({
            ok: true,
            blocked: [{name: 'example.com', scope: 'domain', enabled: true}],
            enabled: true,
            pausedUntil: 0,
            outcome: 'existing',
            reload: 'skipped',
        }));

        document.getElementById('blockCurrentSiteButton')?.click();

        expect(document.getElementById('currentSiteRuleStatus')?.textContent)
            .toBe('This website is already in your blocking list.');
    });

    it.each(['failed', 'skipped'] as const)(
        'explains when the saved rule could not reload the original tab (%s)',
        (reload) => {
            const chromeMock = setup({enabled: true, blocked: [], statistics: {}}, false, 'https://example.com/');
            chromeMock.runtime.sendMessage.mockImplementation((_request, callback) => callback({
                ok: true,
                blocked: [{name: 'example.com', scope: 'domain', enabled: true}],
                enabled: true,
                pausedUntil: 0,
                outcome: 'added',
                reload,
            }));

            document.getElementById('blockCurrentSiteButton')?.click();

            expect(document.getElementById('currentSiteRuleStatus')?.textContent)
                .toBe('Added to your blocking list. Reload this page to apply it.');
        }
    );

    it('keeps current website status hidden on unsupported browser pages', () => {
        setup({enabled: true, blocked: [], statistics: {}}, false, 'chrome://extensions/');
        expect((document.getElementById('currentSiteStatus') as HTMLElement).hidden).toBe(true);
        expect((document.getElementById('blockCurrentSiteButton') as HTMLButtonElement).hidden).toBe(true);
    });

    it('renders current-site status safely when the optional action or tab URL is unavailable', () => {
        setup({enabled: true, blocked: [], statistics: {}}, false, 'https://example.com/', false);
        expect(document.getElementById('currentSiteRuleStatus')?.textContent).toBe('Not in your blocking list');

        jest.resetModules();
        document.body.innerHTML = '';
        setup({
            enabled: true,
            blocked: [{name: 'example.com', scope: 'domain', enabled: true}],
            statistics: {},
        }, false, 'https://example.com/', false);
        expect(document.getElementById('currentSiteRuleStatus')?.textContent).toBe('Domain blocking · Active now');

        jest.resetModules();
        document.body.innerHTML = '';
        setup({enabled: true, blocked: [], statistics: {}}, false, 'chrome://extensions/', false);
        expect((document.getElementById('currentSiteStatus') as HTMLElement).hidden).toBe(true);

        jest.resetModules();
        document.body.innerHTML = '';
        setup({enabled: true, blocked: [], statistics: {}}, false, '');
        expect((document.getElementById('currentSiteStatus') as HTMLElement).hidden).toBe(true);
    });

    it('shows when global blocking is off or temporarily paused', () => {
        setup({
            enabled: false,
            blocked: [{name: 'example.com', scope: 'domain', enabled: true}],
            statistics: {},
        }, false, 'https://example.com/');
        expect(document.getElementById('currentSiteRuleStatus')?.textContent)
            .toBe('Domain blocking · Extension is off');

        jest.resetModules();
        document.body.innerHTML = '';
        setup({
            enabled: true,
            pausedUntil: Date.now() + 60_000,
            blocked: [{name: 'https://example.com/page', scope: 'url', enabled: true}],
            statistics: {},
        }, false, 'https://example.com/page');
        expect(document.getElementById('currentSiteRuleStatus')?.textContent)
            .toBe('Full URL blocking · Blocking is paused');
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

    it('requires the configured passphrase before turning blocking off', async () => {
        const mocked = require('./helper/passphraseProtection');
        mocked.verifyPassphrase.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
        const chromeMock = setup({
            enabled: true,
            passphraseProtection: protection,
            blocked: [],
            statistics: {},
        });
        const toggle = document.getElementById('enabledToggle') as HTMLInputElement;
        toggle.checked = false;
        toggle.dispatchEvent(new Event('change'));
        expect(toggle.checked).toBe(true);
        expect((document.getElementById('passphrasePrompt') as HTMLElement).hidden).toBe(false);
        expect(document.getElementById('confirmPassphraseButton')?.textContent).toBe('Turn blocking off');
        (document.getElementById('popupPassphrase') as HTMLInputElement)
            .dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', cancelable: true}));
        await Promise.resolve();
        await Promise.resolve();
        expect(document.getElementById('popupPassphraseStatus')?.textContent).toBe('Incorrect confirmation phrase.');
        document.getElementById('confirmPassphraseButton')?.click();
        await Promise.resolve();
        await Promise.resolve();
        expect(chromeMock.storage.local.set).toHaveBeenCalledWith(expect.objectContaining({enabled: false}));

        (document.getElementById('popupPassphrase') as HTMLInputElement)
            .dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', cancelable: true}));
        expect((document.getElementById('passphrasePrompt') as HTMLElement).hidden).toBe(true);
        (document.getElementById('popupPassphrase') as HTMLInputElement)
            .dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab', cancelable: true}));
    });

    it('requires the configured passphrase before starting a timed pause', async () => {
        jest.useFakeTimers();
        const now = new Date(2026, 7, 25, 10, 0).getTime();
        jest.setSystemTime(now);
        const mocked = require('./helper/passphraseProtection');
        mocked.verifyPassphrase.mockResolvedValue(true);
        const chromeMock = setup({
            enabled: true,
            passphraseProtection: protection,
            pausedUntil: 0,
            blocked: [],
            statistics: {},
        });
        (document.querySelector('[data-pause-minutes="30"]') as HTMLButtonElement).click();
        expect(document.getElementById('passphrasePromptDescription')?.textContent).toContain('30 minutes');
        expect(document.getElementById('confirmPassphraseButton')?.textContent).toBe('Pause for 30 minutes');
        expect(chromeMock.storage.local.set).not.toHaveBeenCalled();
        document.getElementById('confirmPassphraseButton')?.click();
        await Promise.resolve();
        await Promise.resolve();
        expect(chromeMock.storage.local.set).toHaveBeenCalledWith(expect.objectContaining({
            pausedUntil: now + 30 * 60_000,
        }));
    });
});
