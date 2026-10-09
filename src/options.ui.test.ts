/** @jest-environment jsdom */

import fs from 'node:fs';
import path from 'node:path';
jest.mock('./helper/passphraseProtection', () => {
    const actual = jest.requireActual('./helper/passphraseProtection');
    return {...actual, createPassphraseProtection: jest.fn(), verifyPassphrase: jest.fn()};
});

const protection = {version: 1, iterations: 600000, salt: 'AQ==', iv: 'Ag==', ciphertext: 'Aw=='};

type Data = Record<string, any>;

function setup(initial: Data = {}, missingIds: string[] = []) {
    document.documentElement.innerHTML = fs.readFileSync(path.resolve(__dirname, 'ui/options.html'), 'utf8');
    missingIds.forEach((id) => document.getElementById(id)?.remove());
    const data: Data = {blocked: [], enabled: true, schedules: [], ...initial};
    const chromeMock = {
        runtime: {
            lastError: undefined as undefined | {message: string},
            getManifest: jest.fn(() => ({version: '1.0.6'})),
        },
        storage: {local: {
            get: jest.fn((defaults: Data, callback: (value: Data) => void) => {
                callback({...defaults, ...data});
            }),
            set: jest.fn((values: Data, callback?: () => void) => {
                Object.assign(data, values);
                callback?.();
            }),
            remove: jest.fn((key: string, callback?: () => void) => {
                delete data[key];
                callback?.();
            }),
        }},
    };
    (global as any).chrome = chromeMock;
    Object.defineProperty(URL, 'createObjectURL', {value: jest.fn(() => 'blob:test'), configurable: true});
    Object.defineProperty(URL, 'revokeObjectURL', {value: jest.fn(), configurable: true});
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    jest.isolateModules(() => require('./options'));
    window.dispatchEvent(new Event('DOMContentLoaded'));
    return {chromeMock, data};
}

function addWebsite(value: string) {
    const input = document.getElementById('newWebsite') as HTMLInputElement;
    input.value = value;
    document.getElementById('addButton')?.click();
}

function searchRules(value: string) {
    const input = document.getElementById('ruleSearch') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
}

function selectRuleFilter(value: string) {
    const select = document.getElementById('ruleFilter') as HTMLSelectElement;
    select.value = value;
    select.dispatchEvent(new Event('change'));
}

function visibleRuleNames(): string[] {
    return Array.from(document.querySelectorAll('.websiteName'), (element) => element.textContent || '');
}

async function flush() {
    for (let index = 0; index < 6; index += 1) await Promise.resolve();
}

describe('options UI', () => {
    beforeEach(() => {
        jest.resetModules();
        jest.spyOn(document, 'addEventListener');
    });
    afterEach(() => {
        jest.mocked(document.addEventListener).mock.calls.forEach(([type, listener, options]) => {
            if (type === 'keydown') document.removeEventListener(type, listener, options);
        });
        jest.restoreAllMocks();
        delete (global as any).chrome;
    });

    it('adds, sorts, toggles, deletes, and paginates rules', () => {
        const {data, chromeMock} = setup();
        expect(document.getElementById('extensionVersion')?.textContent).toBe('v1.0.6');
        for (let index = 6; index >= 1; index -= 1) addWebsite(`site-${index}.example`);
        expect((document.getElementById('websiteListHeader') as HTMLElement).hidden).toBe(false);
        expect(document.querySelector('.websiteHeader')?.textContent).toBe('Website');
        expect(document.querySelector('.actionHeader')?.textContent).toBe('Blocked');
        expect(document.querySelectorAll('.websiteItem')).toHaveLength(5);
        expect(document.getElementById('pageInfo')?.textContent).toBe('Page 1 of 2');
        expect(document.querySelector('.scheduleButton')?.getAttribute('aria-label')).toBe('Add schedule');
        expect(document.querySelector('.deleteButton')?.getAttribute('aria-label')).toBe('Delete');
        (document.getElementById('nextPageButton') as HTMLButtonElement).click();
        expect(document.querySelectorAll('.websiteItem')).toHaveLength(1);
        (document.getElementById('prevPageButton') as HTMLButtonElement).click();
        const checkbox = document.querySelector('.websiteCheckbox') as HTMLInputElement;
        checkbox.checked = false;
        checkbox.dispatchEvent(new Event('change'));
        expect(data.blocked.some((entry) => entry.enabled === false)).toBe(true);
        (document.querySelector('.websiteItem button:last-child') as HTMLButtonElement).click();
        expect((document.getElementById('deleteConfirmationDialog') as HTMLElement).hidden).toBe(false);
        expect(data.blocked).toHaveLength(6);
        document.getElementById('cancelDeleteButton')?.click();
        expect(data.blocked).toHaveLength(6);
        (document.querySelector('.websiteItem button:last-child') as HTMLButtonElement).click();
        document.getElementById('confirmDeleteButton')?.click();
        expect(data.blocked).toHaveLength(5);
        expect(chromeMock.storage.local.get).toHaveBeenCalled();
    });

    it('searches the complete list without changing stored rules and paginates only matches', () => {
        const blocked = [
            {name: 'another.example', scope: 'domain', enabled: true},
            ...Array.from({length: 6}, (_, index) => ({
                name: `site-${index + 1}.example`, scope: 'domain', enabled: true,
            })),
            {name: 'unrelated.example', scope: 'domain', enabled: false},
        ];
        const {chromeMock, data} = setup({blocked});
        document.getElementById('nextPageButton')?.click();
        expect(document.getElementById('pageInfo')?.textContent).toBe('Page 2 of 2');

        searchRules('  SITE-  ');
        expect(visibleRuleNames()).toEqual(blocked.slice(1, 6).map((entry) => entry.name));
        expect(document.getElementById('ruleResultsCount')?.textContent).toBe('6 of 8 rules');
        expect(document.getElementById('pageInfo')?.textContent).toBe('Page 1 of 2');
        expect(document.querySelector('.pageNumbers [aria-current="page"]')?.textContent).toBe('1');
        document.getElementById('nextPageButton')?.click();
        expect(visibleRuleNames()).toEqual(['site-6.example']);

        searchRules('site-1');
        expect(visibleRuleNames()).toEqual(['site-1.example']);
        expect((document.getElementById('pagination') as HTMLElement).hidden).toBe(true);
        expect(document.getElementById('ruleResultsCount')?.textContent).toBe('1 of 8 rules');
        expect(data.blocked).toEqual(blocked);
        expect(chromeMock.storage.local.set).not.toHaveBeenCalled();
    });

    it.each([
        ['all', ['alpha.example', 'beta.example', 'https://delta.example/path?tab=1#section', 'https://gamma.example/path']],
        ['enabled', ['alpha.example', 'https://gamma.example/path']],
        ['disabled', ['beta.example', 'https://delta.example/path?tab=1#section']],
        ['scheduled', ['beta.example', 'https://gamma.example/path']],
        ['unscheduled', ['alpha.example', 'https://delta.example/path?tab=1#section']],
        ['domain', ['alpha.example', 'beta.example']],
        ['url', ['https://delta.example/path?tab=1#section', 'https://gamma.example/path']],
    ])('filters by %s without modifying the saved configuration', (filter, names) => {
        const blocked = [
            {name: 'alpha.example', scope: 'domain', enabled: true},
            {name: 'beta.example', scope: 'domain', enabled: false, schedule: {daily: [{day: 1, mode: 'all-day'}]}},
            {name: 'https://gamma.example/path', scope: 'url', enabled: true, schedule: {daily: [{day: 2, mode: 'all-day'}]}},
            {name: 'https://delta.example/path?tab=1#section', scope: 'url', enabled: false},
        ];
        const {chromeMock, data} = setup({blocked});
        selectRuleFilter(filter);
        expect(visibleRuleNames()).toEqual(names);
        expect(data.blocked).toEqual(blocked);
        expect(chromeMock.storage.local.set).not.toHaveBeenCalled();
    });

    it('combines URL searches with filters and distinguishes no matches from an empty list', () => {
        setup({blocked: [
            {name: 'example.com', scope: 'domain', enabled: true},
            {name: 'https://other.example/path?tab=1#section', scope: 'url', enabled: false},
        ]});
        selectRuleFilter('disabled');
        searchRules('TAB=1#SECTION');
        expect(visibleRuleNames()).toEqual(['https://other.example/path?tab=1#section']);

        searchRules('no-match');
        expect(visibleRuleNames()).toEqual([]);
        expect(document.getElementById('ruleEmptyTitle')?.textContent).toBe('No matching rules');
        expect((document.getElementById('websiteListHeader') as HTMLElement).hidden).toBe(true);
        expect(document.getElementById('ruleResultsCount')?.textContent).toBe('0 of 2 rules');
        expect((document.getElementById('ruleEmptyState') as HTMLElement).hidden).toBe(false);
        document.getElementById('clearRuleSearchButton')?.click();
        expect((document.getElementById('ruleFilter') as HTMLSelectElement).value).toBe('disabled');
        expect(visibleRuleNames()).toEqual(['https://other.example/path?tab=1#section']);
        expect(document.activeElement?.id).toBe('ruleSearch');

        document.getElementById('clearRuleFiltersButton')?.click();
        expect(visibleRuleNames()).toHaveLength(2);
        expect((document.getElementById('websiteListHeader') as HTMLElement).hidden).toBe(false);
        expect((document.getElementById('ruleFilter') as HTMLSelectElement).value).toBe('all');
        expect((document.getElementById('clearRuleFiltersButton') as HTMLElement).hidden).toBe(true);
        expect(document.getElementById('ruleResultsCount')?.textContent).toBe('2 rules');

        jest.resetModules();
        setup();
        expect(document.getElementById('ruleEmptyTitle')?.textContent).toBe('No rules yet');
        expect(document.getElementById('ruleResultsCount')?.textContent).toBe('0 rules');
        expect((document.querySelector('.ruleTools') as HTMLElement).hidden).toBe(false);
        searchRules('   ');
        expect((document.getElementById('clearRuleFiltersButton') as HTMLElement).hidden).toBe(true);
        document.getElementById('clearRuleSearchButton')?.click();
        addWebsite('first.example');
        expect(document.getElementById('ruleResultsCount')?.textContent).toBe('1 rule');
        expect((document.getElementById('ruleEmptyState') as HTMLElement).hidden).toBe(true);
    });

    it('updates status-filtered results after toggling, clamps pagination, and retains hidden rules', () => {
        const hiddenRule = {name: 'hidden.example', scope: 'domain', enabled: false};
        const {data} = setup({blocked: [
            hiddenRule,
            ...Array.from({length: 6}, (_, index) => ({
                name: `site-${index + 1}.example`, scope: 'domain', enabled: true,
            })),
        ]});
        selectRuleFilter('enabled');
        document.getElementById('nextPageButton')?.click();
        const checkbox = document.querySelector('.websiteCheckbox') as HTMLInputElement;
        checkbox.checked = false;
        checkbox.dispatchEvent(new Event('change'));
        expect(visibleRuleNames()).toHaveLength(5);
        expect(document.getElementById('pageInfo')?.textContent).toBe('Page 1 of 1');
        expect(data.blocked).toHaveLength(7);
        expect(data.blocked).toContainEqual(hiddenRule);
        expect(data.blocked).toContainEqual({name: 'site-6.example', scope: 'domain', enabled: false});
        expect(document.activeElement).toBe(document.querySelector('.websiteCheckbox'));

        searchRules('site-1');
        const lastMatch = document.querySelector('.websiteCheckbox') as HTMLInputElement;
        lastMatch.checked = false;
        lastMatch.dispatchEvent(new Event('change'));
        expect(visibleRuleNames()).toHaveLength(0);
        expect(document.activeElement?.id).toBe('ruleFilter');

        selectRuleFilter('disabled');
        const disabledCheckbox = document.querySelector('.websiteCheckbox') as HTMLInputElement;
        disabledCheckbox.checked = true;
        disabledCheckbox.dispatchEvent(new Event('change'));
        expect(visibleRuleNames()).toHaveLength(0);
        expect(data.blocked).toContainEqual({name: 'site-1.example', scope: 'domain', enabled: true});
    });

    it('edits schedules and deletes the correct filtered rule while retaining other rules', () => {
        const hiddenRule = {name: 'alpha.example', scope: 'domain', enabled: true};
        const urlRule = {name: 'https://target.example/path', scope: 'url', enabled: true};
        const {data} = setup({blocked: [hiddenRule, urlRule]});
        selectRuleFilter('url');
        (document.querySelector('.scheduleButton') as HTMLButtonElement).click();
        expect(document.getElementById('scheduleRuleName')?.textContent).toBe(urlRule.name);
        document.getElementById('saveScheduleButton')?.click();
        expect(data.blocked.find((entry) => entry.name === urlRule.name).schedule.daily).toHaveLength(5);
        expect(data.blocked).toContainEqual(hiddenRule);

        selectRuleFilter('scheduled');
        (document.querySelector('.scheduleButton') as HTMLButtonElement).click();
        document.getElementById('removeScheduleButton')?.click();
        expect(visibleRuleNames()).toHaveLength(0);
        selectRuleFilter('url');
        (document.querySelector('.deleteButton') as HTMLButtonElement).click();
        document.getElementById('confirmDeleteButton')?.click();
        expect(data.blocked).toEqual([hiddenRule]);
        expect(document.getElementById('ruleResultsCount')?.textContent).toBe('0 of 1 rules');
    });

    it('clears filters after successfully adding a rule so the new rule is visible', () => {
        const {data} = setup({blocked: [{name: 'existing.example', scope: 'domain', enabled: true}]});
        searchRules('unmatched');
        selectRuleFilter('disabled');
        addWebsite('new.example');
        expect((document.getElementById('ruleSearch') as HTMLInputElement).value).toBe('');
        expect((document.getElementById('ruleFilter') as HTMLSelectElement).value).toBe('all');
        expect(visibleRuleNames()).toContain('new.example');
        expect(data.blocked).toHaveLength(2);
    });

    it('submits through the Add Site form and rejects invalid and duplicate rules', () => {
        setup({
            blocked: [{name: 'existing.example', scope: 'domain', enabled: true}],
            schedules: [{
                id: 'work', name: 'Work', days: [1], start: '09:00', end: '17:00', enabled: true,
                rules: [{name: 'scheduled.example', scope: 'domain', enabled: true}],
            }],
        });
        addWebsite('not-valid');
        expect(document.getElementById('addWebsiteStatus')?.textContent).toBe('');
        expect((document.getElementById('addWebsiteErrorDialog') as HTMLElement).hidden).toBe(false);
        expect(document.getElementById('addWebsiteErrorMessage')?.textContent).toContain('Enter a valid website');
        document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', cancelable: true}));
        expect((document.getElementById('addWebsiteErrorDialog') as HTMLElement).hidden).toBe(true);
        addWebsite('existing.example');
        expect(document.getElementById('addWebsiteErrorMessage')?.textContent).toContain('already covered');
        addWebsite('https://scheduled.example/path');
        document.getElementById('blockUrlButton')?.click();
        expect(document.getElementById('addWebsiteErrorMessage')?.textContent).toContain('already covered');
        const input = document.getElementById('newWebsite') as HTMLInputElement;
        input.value = 'keyboard.example';
        document.getElementById('addWebsite')?.dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}));
        expect(document.getElementById('addWebsiteStatus')?.textContent).toBe('Website added.');
    });

    it.each([
        [{enabled: false}, 'currently off'],
        [{enabled: true, pausedUntil: Date.now() + 60_000}, 'temporarily paused'],
    ])('adds a Settings rule and warns when blocking is unavailable', (state, message) => {
        const {data} = setup(state);

        addWebsite('example.com');

        expect(data.blocked).toEqual([
            {name: 'example.com', scope: 'domain', enabled: true},
        ]);
        expect((document.getElementById('addWebsiteErrorDialog') as HTMLElement).hidden).toBe(false);
        expect(document.getElementById('addWebsiteErrorTitle')?.textContent).toBe('Website added');
        expect(document.getElementById('addWebsiteErrorMessage')?.textContent).toContain(message);
    });

    it('asks whether a path URL should block its domain or only the URL', () => {
        const {data} = setup();

        addWebsite('https://chrome.google.com/webstore');
        expect((document.getElementById('blockScopeDialog') as HTMLElement).hidden).toBe(false);
        expect(document.getElementById('blockScopeValue')?.textContent).toContain('https://chrome.google.com/webstore');
        expect(data.blocked).toHaveLength(0);
        document.getElementById('blockUrlButton')?.click();
        expect(data.blocked).toEqual([{
            name: 'https://chrome.google.com/webstore', scope: 'url', enabled: true,
        }]);

        addWebsite('https://example.com/path');
        document.getElementById('blockDomainButton')?.click();
        expect(data.blocked).toContainEqual({name: 'example.com', scope: 'domain', enabled: true});

        addWebsite('https://cancel.example/path');
        document.getElementById('cancelBlockScopeButton')?.click();
        expect((document.getElementById('blockScopeDialog') as HTMLElement).hidden).toBe(true);
        expect(data.blocked).toHaveLength(2);
        document.getElementById('blockUrlButton')?.click();
        expect(data.blocked).toHaveLength(2);

        addWebsite('https://origin.example');
        expect(data.blocked).toContainEqual({name: 'origin.example', scope: 'domain', enabled: true});
        expect((document.getElementById('blockScopeDialog') as HTMLElement).hidden).toBe(true);
    });

    it('allows a domain to replace narrower URL coverage but rejects a URL covered by a domain', () => {
        const existingUrl = 'https://chrome.google.com/webstore/devconsole/item/edit/status';
        const {data} = setup({
            blocked: [{name: existingUrl, scope: 'url', enabled: true}],
        });

        addWebsite('chrome.google.com');
        expect(data.blocked).toContainEqual({name: 'chrome.google.com', scope: 'domain', enabled: true});
        expect(document.getElementById('addWebsiteStatus')?.textContent).toBe('Website added.');

        addWebsite('https://chrome.google.com/another/page');
        document.getElementById('blockUrlButton')?.click();
        expect(document.getElementById('addWebsiteErrorMessage')?.textContent).toContain('already covered');
        expect(data.blocked).toHaveLength(2);
    });

    it('allows a URL beneath a disabled domain but still rejects an exact disabled duplicate', () => {
        const {data} = setup({
            blocked: [{name: 'example.com', scope: 'domain', enabled: false}],
        });

        addWebsite('https://example.com/allowed-while-domain-disabled');
        document.getElementById('blockUrlButton')?.click();
        expect(data.blocked).toContainEqual({
            name: 'https://example.com/allowed-while-domain-disabled', scope: 'url', enabled: true,
        });

        data.blocked[1].enabled = false;
        addWebsite('https://example.com/allowed-while-domain-disabled/');
        document.getElementById('blockUrlButton')?.click();
        expect(document.getElementById('addWebsiteErrorMessage')?.textContent).toContain('already covered');
        expect(data.blocked).toHaveLength(2);
    });

    it('drops malformed stored rules', () => {
        setup({blocked: [null, {}, {name: 'not valid', scope: 'domain', enabled: true}]});
        expect(document.querySelectorAll('.websiteItem')).toHaveLength(0);
    });

    it('exports normalized configuration', () => {
        setup({enabled: false, blocked: 'invalid', schedules: 'invalid'});
        document.getElementById('openTransferDialogButton')?.click();
        expect((document.getElementById('transferDialog') as HTMLElement).hidden).toBe(false);
        document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', cancelable: true}));
        expect((document.getElementById('transferDialog') as HTMLElement).hidden).toBe(true);
        document.getElementById('openTransferDialogButton')?.click();
        document.getElementById('exportButton')?.click();
        expect(URL.createObjectURL).toHaveBeenCalled();
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
        expect(document.getElementById('transferStatus')?.textContent).toBe('Configuration exported.');
        expect((document.getElementById('exportSuccessDialog') as HTMLElement).hidden).toBe(false);
        expect(document.getElementById('exportedFileName')?.textContent).toMatch(/^tiny-blocker-backup-\d{4}-\d{2}-\d{2}\.json$/);
        document.getElementById('closeExportSuccessButton')?.click();
        expect((document.getElementById('exportSuccessDialog') as HTMLElement).hidden).toBe(true);
    });

    it('imports a valid backup and reports invalid files and storage errors', async () => {
        const {chromeMock, data} = setup();
        searchRules('unmatched');
        selectRuleFilter('disabled');
        const input = document.getElementById('importFile') as HTMLInputElement;
        const validFile = {text: jest.fn(async () => JSON.stringify({
            version: 3, enabled: false,
            blocked: [{
                name: 'imported.example', scope: 'domain', enabled: true,
                schedule: {days: [1], start: '09:00', end: '17:00'},
            }],
        }))};
        Object.defineProperty(input, 'files', {value: [validFile], configurable: true});
        input.dispatchEvent(new Event('change'));
        expect((document.getElementById('importConfirmationDialog') as HTMLElement).hidden).toBe(false);
        document.getElementById('confirmImportButton')?.click();
        await flush();
        expect(data.enabled).toBe(false);
        expect((document.getElementById('ruleSearch') as HTMLInputElement).value).toBe('');
        expect((document.getElementById('ruleFilter') as HTMLSelectElement).value).toBe('all');
        expect(visibleRuleNames()).toEqual(['imported.example']);
        expect(document.getElementById('transferStatus')?.textContent).toBe('Imported 1 rules.');
        expect(document.getElementById('importResultTitle')?.textContent).toBe('Import complete');
        expect(document.getElementById('importResultMessage')?.textContent).toBe('Imported 1 rule successfully.');
        document.getElementById('closeImportResultButton')?.click();
        expect((document.getElementById('importResultDialog') as HTMLElement).hidden).toBe(true);

        const twoRuleFile = {text: jest.fn(async () => JSON.stringify({
            version: 3,
            blocked: [
                {name: 'one.example', scope: 'domain', enabled: true},
                {name: 'two.example', scope: 'domain', enabled: true},
            ],
        }))};
        Object.defineProperty(input, 'files', {value: [twoRuleFile], configurable: true});
        input.dispatchEvent(new Event('change'));
        document.getElementById('confirmImportButton')?.click();
        await flush();
        expect(document.getElementById('importResultMessage')?.textContent).toBe('Imported 2 rules successfully.');
        document.getElementById('closeImportResultButton')?.click();

        const badFile = {text: jest.fn(async () => '{bad json')};
        Object.defineProperty(input, 'files', {value: [badFile], configurable: true});
        input.dispatchEvent(new Event('change'));
        document.getElementById('confirmImportButton')?.click();
        await flush();
        expect(document.getElementById('transferStatus')?.classList.contains('error')).toBe(true);
        expect(document.getElementById('importResultTitle')?.textContent).toBe('Import failed');
        document.getElementById('closeImportResultButton')?.click();

        chromeMock.runtime.lastError = {message: 'Storage failed'};
        const anotherFile = {text: jest.fn(async () => JSON.stringify({version: 1, blocked: []}))};
        Object.defineProperty(input, 'files', {value: [anotherFile], configurable: true});
        input.dispatchEvent(new Event('change'));
        document.getElementById('confirmImportButton')?.click();
        await flush();
        expect(document.getElementById('transferStatus')?.textContent).toBe('Storage failed');
        expect(document.getElementById('importResultMessage')?.textContent).toBe('Storage failed');
        document.getElementById('closeImportResultButton')?.click();

        chromeMock.runtime.lastError = undefined;
        const rejectedFile = {text: jest.fn(async () => Promise.reject('plain failure'))};
        Object.defineProperty(input, 'files', {value: [rejectedFile], configurable: true});
        input.dispatchEvent(new Event('change'));
        document.getElementById('confirmImportButton')?.click();
        await flush();
        expect(document.getElementById('transferStatus')?.textContent).toBe('Unable to import this file.');
        expect(document.getElementById('importResultMessage')?.textContent).toBe('Unable to import this file.');
        document.getElementById('closeImportResultButton')?.click();
    });

    it('opens the hidden import input and ignores an empty selection', async () => {
        setup();
        const input = document.getElementById('importFile') as HTMLInputElement;
        const click = jest.spyOn(input, 'click');
        document.getElementById('importButton')?.click();
        expect(click).toHaveBeenCalled();
        Object.defineProperty(input, 'files', {value: [], configurable: true});
        input.dispatchEvent(new Event('change'));
        await flush();
        expect(document.getElementById('transferStatus')?.textContent).toBe('');
        document.getElementById('confirmImportButton')?.click();
        await flush();
        expect(document.getElementById('transferStatus')?.textContent).toBe('');

        const selectedFile = {text: jest.fn(async () => '{}')};
        Object.defineProperty(input, 'files', {value: [selectedFile], configurable: true});
        input.dispatchEvent(new Event('change'));
        expect((document.getElementById('importConfirmationDialog') as HTMLElement).hidden).toBe(false);
        document.getElementById('cancelImportButton')?.click();
        expect((document.getElementById('importConfirmationDialog') as HTMLElement).hidden).toBe(true);
        expect(selectedFile.text).not.toHaveBeenCalled();
    });

    it('adds, validates, edits, and removes a schedule directly on a rule', () => {
        const {data} = setup({blocked: [{name: 'focus.example', scope: 'domain', enabled: true}]});
        document.getElementById('saveScheduleButton')?.click();
        document.getElementById('removeScheduleButton')?.click();
        (document.querySelector('.scheduleButton') as HTMLButtonElement).click();
        expect((document.getElementById('scheduleDialog') as HTMLElement).hidden).toBe(false);
        expect(document.getElementById('scheduleRuleName')?.textContent).toBe('focus.example');
        expect(document.getElementById('scheduleDialogTitle')?.textContent).toBe('Schedule blocking');
        expect(document.getElementById('scheduleRuleName')?.closest('.scheduleDialogHeader')).not.toBeNull();
        expect(document.getElementById('scheduleExplanation')?.textContent).toBe(
            'When this rule is enabled, the website is blocked during the selected days and times. Outside this schedule, it can be opened.',
        );
        document.querySelectorAll<HTMLInputElement>('.scheduleDayEnabled')
            .forEach((input) => { input.checked = false; });
        document.getElementById('saveScheduleButton')?.click();
        expect(document.getElementById('scheduleStatus')?.classList.contains('error')).toBe(true);
        const monday = document.querySelector<HTMLElement>('[data-schedule-day="1"]') as HTMLElement;
        (monday.querySelector('.scheduleDayEnabled') as HTMLInputElement).checked = true;
        (monday.querySelector('.scheduleDayMode') as HTMLSelectElement).value = 'all-day';
        const tuesday = document.querySelector<HTMLElement>('[data-schedule-day="2"]') as HTMLElement;
        (tuesday.querySelector('.scheduleDayEnabled') as HTMLInputElement).checked = true;
        (tuesday.querySelector('.scheduleDayStart') as HTMLInputElement).value = '10:00';
        (tuesday.querySelector('.scheduleDayEnd') as HTMLInputElement).value = '16:00';
        document.getElementById('saveScheduleButton')?.click();
        expect(data.blocked[0].schedule).toEqual({daily: [
            {day: 1, mode: 'all-day'},
            {day: 2, mode: 'period', start: '10:00', end: '16:00'},
        ]});
        expect(document.querySelector('.websiteSchedule')?.textContent)
            .toBe('Scheduled Mon | all day; Tue | 10:00-16:00');
        expect(document.querySelector('.scheduleStatusBadge')?.textContent).toBe('Scheduled');

        (document.querySelector('.scheduleButton') as HTMLButtonElement).click();
        expect((document.getElementById('removeScheduleButton') as HTMLButtonElement).hidden).toBe(false);
        document.getElementById('removeScheduleButton')?.click();
        expect(data.blocked[0].schedule).toBeUndefined();
        expect(document.querySelector('.websiteSchedule')?.textContent).toBe('Always');
        (document.querySelector('.scheduleButton') as HTMLButtonElement).click();
        document.getElementById('cancelScheduleButton')?.click();
        expect((document.getElementById('scheduleDialog') as HTMLElement).hidden).toBe(true);
    });

    it('copies a saved schedule into a filtered rule for review without changing other rules or enabled states', () => {
        const schedule = {daily: [
            {day: 1, mode: 'all-day'},
            {day: 3, mode: 'period', start: '09:15', end: '16:45'},
            {day: 5, mode: 'period', start: '22:00', end: '06:00'},
        ]};
        const source = {name: 'source.example', scope: 'domain', enabled: true, schedule};
        const disabledSource = {name: 'https://source.example/path', scope: 'url', enabled: false, schedule: {daily: [{day: 0, mode: 'all-day'}]}};
        const target = {name: 'https://target.example/path', scope: 'url', enabled: false, schedule: {daily: [{day: 2, mode: 'all-day'}]}};
        const untouched = {name: 'untouched.example', scope: 'domain', enabled: true};
        const {data, chromeMock} = setup({blocked: [source, disabledSource, target, untouched]});
        searchRules('target.example');
        selectRuleFilter('url');
        (document.querySelector('.scheduleButton') as HTMLButtonElement).click();
        expect((document.getElementById('copyScheduleButton') as HTMLElement).hidden).toBe(false);
        document.getElementById('copyScheduleButton')?.click();
        const selector = document.getElementById('scheduleCopySource') as HTMLSelectElement;
        const editor = document.getElementById('scheduleDialog') as HTMLElement;
        expect(editor.hidden).toBe(false);
        expect(editor.hasAttribute('inert')).toBe(true);
        expect(editor.getAttribute('aria-hidden')).toBe('true');
        expect(Array.from(selector.options, (option) => option.textContent)).toEqual([
            'Choose a rule…', disabledSource.name, source.name,
        ]);
        expect(document.activeElement).toBe(selector);
        expect((document.getElementById('useCopiedScheduleButton') as HTMLButtonElement).disabled).toBe(true);
        selector.value = JSON.stringify([source.scope, source.name]);
        selector.dispatchEvent(new Event('change'));
        expect(document.getElementById('scheduleCopyPreview')?.textContent).toBe('Mon | all day; Wed | 09:15-16:45; Fri | 22:00-06:00');
        document.getElementById('useCopiedScheduleButton')?.click();
        expect((document.getElementById('scheduleCopyDialog') as HTMLElement).hidden).toBe(true);
        expect((document.getElementById('scheduleDialog') as HTMLElement).hidden).toBe(false);
        expect(editor.hasAttribute('inert')).toBe(false);
        expect(editor.hasAttribute('aria-hidden')).toBe(false);
        expect(chromeMock.storage.local.set).not.toHaveBeenCalled();
        expect(data.blocked).toContainEqual(target);
        expect(document.getElementById('scheduleStatus')?.textContent).toContain('Copied from source.example');
        const monday = document.querySelector('[data-schedule-day="1"]') as HTMLElement;
        expect((monday.querySelector('.scheduleDayMode') as HTMLSelectElement).value).toBe('all-day');
        const friday = document.querySelector('[data-schedule-day="5"]') as HTMLElement;
        expect((friday.querySelector('.scheduleDayStart') as HTMLInputElement).value).toBe('22:00');
        expect((friday.querySelector('.scheduleDayEnd') as HTMLInputElement).value).toBe('06:00');
        const wednesday = document.querySelector('[data-schedule-day="3"]') as HTMLElement;
        (wednesday.querySelector('.scheduleDayEnd') as HTMLInputElement).value = '17:00';
        document.getElementById('saveScheduleButton')?.click();
        expect(chromeMock.storage.local.set).toHaveBeenCalledTimes(1);
        expect(data.blocked).toHaveLength(4);
        expect(data.blocked).toContainEqual({...target, schedule: {daily: [
            schedule.daily[0], {...schedule.daily[1], end: '17:00'}, schedule.daily[2],
        ]}});
        expect(data.blocked).toContainEqual(source);
        expect(data.blocked).toContainEqual(disabledSource);
        expect(data.blocked).toContainEqual(untouched);
    });

    it('cancels copying without losing draft edits and discards copied times when the editor is cancelled', () => {
        const source = {name: 'source.example', scope: 'domain', enabled: false, schedule: {daily: [{day: 0, mode: 'all-day'}]}};
        const target = {name: 'target.example', scope: 'domain', enabled: true};
        const {data, chromeMock} = setup({blocked: [source, target]});
        searchRules('target.example');
        (document.querySelector('.scheduleButton') as HTMLButtonElement).click();
        const mondayStart = document.querySelector('[data-schedule-day="1"] .scheduleDayStart') as HTMLInputElement;
        mondayStart.value = '10:30';
        document.getElementById('copyScheduleButton')?.click();
        document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true, cancelable: true}));
        expect((document.getElementById('scheduleCopyDialog') as HTMLElement).hidden).toBe(true);
        expect((document.getElementById('scheduleDialog') as HTMLElement).hidden).toBe(false);
        expect(document.activeElement?.id).toBe('copyScheduleButton');
        expect(document.getElementById('scheduleDialog')?.hasAttribute('inert')).toBe(false);
        expect(document.getElementById('scheduleDialog')?.hasAttribute('aria-hidden')).toBe(false);
        expect(mondayStart.value).toBe('10:30');

        document.getElementById('copyScheduleButton')?.click();
        const selector = document.getElementById('scheduleCopySource') as HTMLSelectElement;
        selector.value = JSON.stringify([source.scope, source.name]);
        selector.dispatchEvent(new Event('change'));
        document.getElementById('useCopiedScheduleButton')?.click();
        expect((document.querySelector('[data-schedule-day="0"] .scheduleDayEnabled') as HTMLInputElement).checked).toBe(true);
        document.getElementById('cancelScheduleButton')?.click();
        expect(data.blocked).toEqual([source, target]);
        expect(chromeMock.storage.local.set).not.toHaveBeenCalled();
        (document.querySelector('.scheduleButton') as HTMLButtonElement).click();
        expect((document.querySelector('[data-schedule-day="0"] .scheduleDayEnabled') as HTMLInputElement).checked).toBe(false);
        expect(mondayStart.value).toBe('09:00');
    });

    it('keeps copy controls unavailable without a source and traps keyboard focus within the picker', () => {
        setup({blocked: [{name: 'only.example', scope: 'domain', enabled: true, schedule: {daily: [{day: 1, mode: 'all-day'}]}}]});
        document.getElementById('copyScheduleButton')?.click();
        (document.querySelector('.scheduleButton') as HTMLButtonElement).click();
        expect((document.getElementById('copyScheduleButton') as HTMLElement).hidden).toBe(true);
        document.getElementById('copyScheduleButton')?.click();
        expect((document.getElementById('scheduleCopyDialog') as HTMLElement).hidden).toBe(true);

        jest.resetModules();
        setup({blocked: [
            {name: 'source.example', scope: 'domain', enabled: true, schedule: {daily: [{day: 1, mode: 'all-day'}]}},
            {name: 'target.example', scope: 'domain', enabled: true},
        ]});
        searchRules('target');
        (document.querySelector('.scheduleButton') as HTMLButtonElement).click();
        document.getElementById('copyScheduleButton')?.click();
        const selector = document.getElementById('scheduleCopySource') as HTMLSelectElement;
        const useButton = document.getElementById('useCopiedScheduleButton') as HTMLButtonElement;
        const cancelButton = document.getElementById('cancelCopyScheduleButton') as HTMLButtonElement;
        selector.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab', shiftKey: true, bubbles: true, cancelable: true}));
        expect(document.activeElement).toBe(cancelButton);
        cancelButton.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab', bubbles: true, cancelable: true}));
        expect(document.activeElement).toBe(selector);
        selector.value = JSON.stringify(['domain', 'source.example']);
        selector.dispatchEvent(new Event('change'));
        selector.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab', shiftKey: true, bubbles: true, cancelable: true}));
        expect(document.activeElement).toBe(useButton);
        useButton.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab', bubbles: true, cancelable: true}));
        expect(document.activeElement).toBe(selector);
        const normalTab = new KeyboardEvent('keydown', {key: 'Tab', bubbles: true, cancelable: true});
        selector.dispatchEvent(normalTab);
        expect(normalTab.defaultPrevented).toBe(false);
        selector.value = '';
        selector.dispatchEvent(new Event('change'));
        expect(useButton.disabled).toBe(true);
        expect((document.getElementById('scheduleCopyPreview') as HTMLElement).hidden).toBe(true);
        useButton.dispatchEvent(new Event('click'));
        expect((document.getElementById('scheduleCopyDialog') as HTMLElement).hidden).toBe(false);
        cancelButton.click();
        document.getElementById('cancelScheduleButton')?.click();
        useButton.dispatchEvent(new Event('click'));
        cancelButton.click();
        expect((document.getElementById('scheduleDialog') as HTMLElement).hidden).toBe(true);
    });

    it.each<[string, number[], string | null, string | null]>([
        ['workdays-9-5', [1, 2, 3, 4, 5], '09:00', '17:00'],
        ['workdays-8-4', [1, 2, 3, 4, 5], '08:00', '16:00'],
        ['everyday-mornings', [0, 1, 2, 3, 4, 5, 6], '08:00', '12:00'],
        ['workday-evenings', [1, 2, 3, 4, 5], '18:00', '22:00'],
        ['weekend-mornings', [0, 6], '08:00', '12:00'],
        ['everyday-all-day', [0, 1, 2, 3, 4, 5, 6], null, null],
    ])('previews and saves the %s template only for the selected filtered rule', (id, days, start, end) => {
        const target = {
            name: 'https://target.example/path', scope: 'url', enabled: false,
            schedule: {daily: [{day: 2, mode: 'all-day'}]},
        };
        const untouched = {name: 'untouched.example', scope: 'domain', enabled: true};
        const {data, chromeMock} = setup({blocked: [target, untouched]});
        searchRules('target');
        selectRuleFilter('url');
        (document.querySelector('.scheduleButton') as HTMLButtonElement).click();
        document.getElementById('scheduleTemplatesButton')?.click();
        const selector = document.getElementById('scheduleTemplateSource') as HTMLSelectElement;
        const editor = document.getElementById('scheduleDialog') as HTMLElement;
        expect(editor.hidden).toBe(false);
        expect(editor.hasAttribute('inert')).toBe(true);
        expect(editor.getAttribute('aria-hidden')).toBe('true');
        selector.value = id;
        selector.dispatchEvent(new Event('change'));
        expect((document.getElementById('scheduleTemplatePreview') as HTMLElement).hidden).toBe(false);
        const expectedLabel = start ? `${start}-${end}` : 'all day';
        expect(document.getElementById('scheduleTemplatePreview')?.textContent).toContain(expectedLabel);
        document.getElementById('useScheduleTemplateButton')?.click();
        expect((document.getElementById('scheduleTemplateDialog') as HTMLElement).hidden).toBe(true);
        expect((document.getElementById('scheduleDialog') as HTMLElement).hidden).toBe(false);
        expect(document.activeElement?.id).toBe('scheduleTemplatesButton');
        expect(editor.hasAttribute('inert')).toBe(false);
        expect(editor.hasAttribute('aria-hidden')).toBe(false);
        expect(data.blocked).toEqual([target, untouched]);
        expect(chromeMock.storage.local.set).not.toHaveBeenCalled();
        expect(document.getElementById('scheduleStatus')?.textContent).toContain('Template applied:');
        document.getElementById('saveScheduleButton')?.click();
        const expectedSchedule = {daily: days.map((day) => start
            ? {day, mode: 'period', start, end}
            : {day, mode: 'all-day'})};
        expect(data.blocked).toEqual([{...target, schedule: expectedSchedule}, untouched]);
        expect(chromeMock.storage.local.set).toHaveBeenCalledTimes(1);
    });

    it('preserves drafts when cancelling templates and allows adjustments without changing future templates', () => {
        const target = {name: 'target.example', scope: 'domain', enabled: true};
        const {data, chromeMock} = setup({blocked: [target]});
        const templateButton = document.getElementById('scheduleTemplatesButton') as HTMLButtonElement;
        const cancelButton = document.getElementById('cancelScheduleTemplateButton') as HTMLButtonElement;
        const useButton = document.getElementById('useScheduleTemplateButton') as HTMLButtonElement;
        const selector = document.getElementById('scheduleTemplateSource') as HTMLSelectElement;
        templateButton.click();
        expect((document.getElementById('scheduleTemplateDialog') as HTMLElement).hidden).toBe(true);
        (document.querySelector('.scheduleButton') as HTMLButtonElement).click();
        expect((document.getElementById('copyScheduleButton') as HTMLElement).hidden).toBe(true);
        const mondayStart = document.querySelector('[data-schedule-day="1"] .scheduleDayStart') as HTMLInputElement;
        mondayStart.value = '10:30';
        templateButton.click();
        expect(document.activeElement).toBe(selector);
        expect(useButton.disabled).toBe(true);
        selector.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab', shiftKey: true, bubbles: true, cancelable: true}));
        expect(document.activeElement).toBe(cancelButton);
        cancelButton.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab', bubbles: true, cancelable: true}));
        expect(document.activeElement).toBe(selector);
        selector.value = 'workdays-8-4';
        selector.dispatchEvent(new Event('change'));
        selector.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab', shiftKey: true, bubbles: true, cancelable: true}));
        expect(document.activeElement).toBe(useButton);
        useButton.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab', bubbles: true, cancelable: true}));
        expect(document.activeElement).toBe(selector);
        selector.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true, cancelable: true}));
        expect((document.getElementById('scheduleTemplateDialog') as HTMLElement).hidden).toBe(true);
        expect((document.getElementById('scheduleDialog') as HTMLElement).hidden).toBe(false);
        expect(document.activeElement).toBe(templateButton);
        expect(document.getElementById('scheduleDialog')?.hasAttribute('inert')).toBe(false);
        expect(document.getElementById('scheduleDialog')?.hasAttribute('aria-hidden')).toBe(false);
        expect(mondayStart.value).toBe('10:30');
        templateButton.click();
        expect(selector.value).toBe('');
        expect(useButton.disabled).toBe(true);
        useButton.dispatchEvent(new Event('click'));
        expect((document.getElementById('scheduleTemplateDialog') as HTMLElement).hidden).toBe(false);
        selector.value = 'workdays-8-4';
        selector.dispatchEvent(new Event('change'));
        selector.value = '';
        selector.dispatchEvent(new Event('change'));
        expect(useButton.disabled).toBe(true);
        expect((document.getElementById('scheduleTemplatePreview') as HTMLElement).hidden).toBe(true);
        cancelButton.click();
        expect(mondayStart.value).toBe('10:30');
        templateButton.click();
        selector.value = 'workdays-8-4';
        selector.dispatchEvent(new Event('change'));
        useButton.click();
        expect(mondayStart.value).toBe('08:00');
        mondayStart.value = '07:30';
        document.getElementById('saveScheduleButton')?.click();
        expect(data.blocked[0].schedule.daily[0].start).toBe('07:30');
        (document.querySelector('.scheduleButton') as HTMLButtonElement).click();
        templateButton.click();
        selector.value = 'workdays-8-4';
        selector.dispatchEvent(new Event('change'));
        useButton.click();
        expect(mondayStart.value).toBe('08:00');
        document.getElementById('cancelScheduleButton')?.click();
        expect(data.blocked[0].schedule.daily[0].start).toBe('07:30');
        expect(chromeMock.storage.local.set).toHaveBeenCalledTimes(1);
        useButton.dispatchEvent(new Event('click'));
        cancelButton.click();
        expect((document.getElementById('scheduleDialog') as HTMLElement).hidden).toBe(true);
    });

    it('keeps working when optional controls and status elements are absent', () => {
        setup({}, [
            'addWebsiteStatus', 'prevPageButton',
            'nextPageButton', 'pageNumbers', 'pageInfo', 'exportButton', 'importButton',
            'importFile', 'transferStatus',
        ]);
        addWebsite('example.com');
        expect(document.querySelectorAll('.websiteItem')).toHaveLength(1);

        jest.resetModules();
        setup({}, ['transferStatus']);
        document.getElementById('exportButton')?.click();
        expect(URL.createObjectURL).toHaveBeenCalled();
    });

    it('sets, changes, and removes passphrase protection with clear recovery warnings', async () => {
        const mocked = require('./helper/passphraseProtection');
        mocked.createPassphraseProtection.mockResolvedValue(protection);
        mocked.verifyPassphrase.mockResolvedValue(false);
        const {data} = setup();
        document.getElementById('openPassphraseSettingsButton')?.click();
        expect((document.getElementById('passphraseSettingsDialog') as HTMLElement).hidden).toBe(false);
        expect(document.querySelector('.passphraseWarning')).toBeNull();
        const setupSettingsChoice = document.getElementById('magicWordForSettings') as HTMLInputElement;
        expect(setupSettingsChoice.disabled).toBe(false);
        setupSettingsChoice.checked = true;
        setupSettingsChoice.dispatchEvent(new Event('change'));
        (document.getElementById('newPassphrase') as HTMLInputElement).value = 'unsaved password';
        (document.getElementById('confirmPassphrase') as HTMLInputElement).value = 'unsaved password';
        document.getElementById('closePassphraseSettingsButton')?.click();
        expect((document.getElementById('passphraseSettingsDialog') as HTMLElement).hidden).toBe(true);
        expect((document.getElementById('newPassphrase') as HTMLInputElement).value).toBe('');
        expect((document.getElementById('confirmPassphrase') as HTMLInputElement).value).toBe('');
        expect(setupSettingsChoice.checked).toBe(false);
        document.getElementById('openPassphraseSettingsButton')?.click();
        (document.getElementById('newPassphrase') as HTMLInputElement).value = 'discard with escape';
        document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', cancelable: true}));
        expect((document.getElementById('passphraseSettingsDialog') as HTMLElement).hidden).toBe(true);
        expect((document.getElementById('newPassphrase') as HTMLInputElement).value).toBe('');
        document.getElementById('openPassphraseSettingsButton')?.click();
        setupSettingsChoice.checked = true;
        setupSettingsChoice.dispatchEvent(new Event('change'));
        (document.getElementById('newPassphrase') as HTMLInputElement).value = 'a strong passphrase';
        (document.getElementById('confirmPassphrase') as HTMLInputElement).value = 'different';
        document.getElementById('savePassphraseButton')?.click();
        await flush();
        expect(document.getElementById('passphraseStatus')?.textContent).toContain('do not match');

        (document.getElementById('confirmPassphrase') as HTMLInputElement).value = 'a strong passphrase';
        document.getElementById('savePassphraseButton')?.click();
        await flush();
        expect(data.passphraseProtection).toEqual(protection);
        expect(data.magicWordForSettings).toBe(true);
        expect(document.getElementById('passphraseDescription')?.textContent).toBe('A confirmation phrase is set.');
        expect(document.getElementById('passphraseDescription')?.classList.contains('protectionActive')).toBe(true);
        expect(document.getElementById('passwordFieldsLegend')?.textContent).toBe('Change confirmation phrase');
        expect((document.getElementById('passphraseSettingsDialog') as HTMLElement).hidden).toBe(true);
        expect(document.getElementById('passwordSuccessTitle')?.textContent).toBe('Phrase set');
        expect(document.getElementById('passwordSuccessMessage')?.textContent).toBe('Your confirmation phrase is now set.');
        document.getElementById('closePasswordSuccessButton')?.click();
        expect((document.getElementById('passwordSuccessDialog') as HTMLElement).hidden).toBe(true);
        const settingsChoice = document.getElementById('magicWordForSettings') as HTMLInputElement;
        expect(settingsChoice.disabled).toBe(false);
        settingsChoice.checked = true;
        settingsChoice.dispatchEvent(new Event('change'));
        expect(data.magicWordForSettings).toBe(true);
        document.getElementById('closePassphraseSettingsButton')?.click();
        document.getElementById('openPassphraseSettingsButton')?.click();

        const currentInput = document.getElementById('currentPassphrase') as HTMLInputElement;
        expect(currentInput.hidden).toBe(false);
        currentInput.value = 'wrong password';
        (document.getElementById('newPassphrase') as HTMLInputElement).value = 'new password';
        (document.getElementById('confirmPassphrase') as HTMLInputElement).value = 'new password';
        document.getElementById('savePassphraseButton')?.click();
        await flush();
        expect(document.getElementById('passphraseStatus')?.textContent).toBe('Current confirmation phrase is incorrect.');
        expect((document.getElementById('passphraseSettingsDialog') as HTMLElement).hidden).toBe(false);

        mocked.verifyPassphrase.mockResolvedValueOnce(true);
        currentInput.value = 'a strong passphrase';
        document.getElementById('savePassphraseButton')?.click();
        await flush();
        expect((document.getElementById('passphraseSettingsDialog') as HTMLElement).hidden).toBe(true);
        expect(document.getElementById('passwordSuccessTitle')?.textContent).toBe('Phrase changed');
        expect(document.getElementById('passwordSuccessMessage')?.textContent).toBe('Your confirmation phrase was changed successfully.');
        document.getElementById('closePasswordSuccessButton')?.click();
        document.getElementById('openPassphraseSettingsButton')?.click();
        document.getElementById('removePassphraseButton')?.click();
        await flush();
        expect(data.passphraseProtection).toBeUndefined();
        expect(data.magicWordForSettings).toBe(false);
        expect((document.getElementById('passphraseSettingsDialog') as HTMLElement).hidden).toBe(true);
        expect(document.getElementById('passwordSuccessTitle')?.textContent).toBe('Phrase removed');
    });

    it('asks for the password when opening Settings if selected', async () => {
        const mocked = require('./helper/passphraseProtection');
        mocked.verifyPassphrase.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
        setup({passphraseProtection: protection, magicWordForSettings: true});
        expect((document.getElementById('settingsUnlockDialog') as HTMLElement).hidden).toBe(false);
        expect((document.getElementById('appContent') as HTMLElement).hidden).toBe(true);
        (document.getElementById('settingsUnlockMagicWord') as HTMLInputElement)
            .dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', cancelable: true}));
        await flush();
        expect(document.getElementById('settingsUnlockStatus')?.textContent).toBe('Incorrect confirmation phrase.');
        document.getElementById('unlockSettingsButton')?.click();
        await flush();
        expect((document.getElementById('settingsUnlockDialog') as HTMLElement).hidden).toBe(true);
        expect((document.getElementById('appContent') as HTMLElement).hidden).toBe(false);
    });

    it('persists and reloads the Settings password checkbox', async () => {
        const {data} = setup({passphraseProtection: protection, magicWordForSettings: false});
        document.getElementById('openPassphraseSettingsButton')?.click();
        const choice = document.getElementById('magicWordForSettings') as HTMLInputElement;
        expect(choice.checked).toBe(false);

        choice.checked = true;
        choice.dispatchEvent(new Event('change'));
        await flush();
        expect(data.magicWordForSettings).toBe(true);
        expect(choice.checked).toBe(true);
        expect(document.getElementById('settingsGateDescription')?.textContent)
            .toBe('On — your confirmation phrase is asked once when Settings opens.');

        document.getElementById('closePassphraseSettingsButton')?.click();
        choice.checked = false;
        document.getElementById('openPassphraseSettingsButton')?.click();
        expect(choice.checked).toBe(true);
    });

    it('reports passphrase creation failures', async () => {
        const mocked = require('./helper/passphraseProtection');
        mocked.createPassphraseProtection
            .mockRejectedValueOnce(new Error('Encryption failed'))
            .mockRejectedValueOnce('unknown failure');
        setup();
        const newInput = document.getElementById('newPassphrase') as HTMLInputElement;
        const confirmation = document.getElementById('confirmPassphrase') as HTMLInputElement;
        newInput.value = confirmation.value = 'a strong passphrase';
        document.getElementById('savePassphraseButton')?.click();
        await flush();
        expect(document.getElementById('passphraseStatus')?.textContent).toBe('Encryption failed');
        document.getElementById('savePassphraseButton')?.click();
        await flush();
        expect(document.getElementById('passphraseStatus')?.textContent).toBe('Unable to set the confirmation phrase.');
    });

    it('does not repeatedly ask for the password while using unlocked Settings', async () => {
        const {data} = setup({
            passphraseProtection: protection,
            blocked: [{name: 'protected.example', scope: 'domain', enabled: true}],
        });
        const checkbox = document.querySelector('.websiteCheckbox') as HTMLInputElement;
        checkbox.checked = false;
        checkbox.dispatchEvent(new Event('change'));
        await flush();
        expect(data.blocked[0].enabled).toBe(false);

        (document.querySelector('.scheduleButton') as HTMLButtonElement).click();
        expect((document.getElementById('scheduleDialog') as HTMLElement).hidden).toBe(false);
        expect(document.getElementById('passphraseDialog')).toBeNull();
    });
});
