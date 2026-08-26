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
        runtime: {lastError: undefined as undefined | {message: string}},
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

async function flush() {
    for (let index = 0; index < 6; index += 1) await Promise.resolve();
}

describe('options UI', () => {
    beforeEach(() => {
        jest.resetModules();
    });
    afterEach(() => {
        jest.restoreAllMocks();
        delete (global as any).chrome;
    });

    it('adds, sorts, toggles, deletes, and paginates rules', () => {
        const {data, chromeMock} = setup();
        for (let index = 6; index >= 1; index -= 1) addWebsite(`site-${index}.example`);
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
        document.querySelectorAll<HTMLInputElement>('input[name="scheduleDay"]')
            .forEach((input) => { input.checked = false; });
        document.getElementById('saveScheduleButton')?.click();
        expect(document.getElementById('scheduleStatus')?.classList.contains('error')).toBe(true);
        (document.querySelector('input[name="scheduleDay"][value="1"]') as HTMLInputElement).checked = true;
        document.getElementById('saveScheduleButton')?.click();
        expect(data.blocked[0].schedule).toEqual({days: [1], start: '09:00', end: '17:00'});
        expect(document.querySelector('.websiteSchedule')?.textContent).toBe('Scheduled Mon | 09:00-17:00');
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
