/** @jest-environment jsdom */

import fs from 'node:fs';
import path from 'node:path';

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
    await Promise.resolve();
    await Promise.resolve();
}

describe('options UI', () => {
    beforeEach(() => jest.resetModules());
    afterEach(() => {
        jest.restoreAllMocks();
        delete (global as any).chrome;
    });

    it('adds, sorts, toggles, deletes, refreshes, and paginates rules', () => {
        const {data, chromeMock} = setup();
        for (let index = 6; index >= 1; index -= 1) addWebsite(`site-${index}.example`);
        expect(document.querySelectorAll('.websiteItem')).toHaveLength(5);
        expect(document.getElementById('pageInfo')?.textContent).toBe('Page 1 of 2');
        (document.getElementById('nextPageButton') as HTMLButtonElement).click();
        expect(document.querySelectorAll('.websiteItem')).toHaveLength(1);
        (document.getElementById('prevPageButton') as HTMLButtonElement).click();
        const checkbox = document.querySelector('.websiteCheckbox') as HTMLInputElement;
        checkbox.checked = false;
        checkbox.dispatchEvent(new Event('change'));
        expect(data.blocked.some((entry) => entry.enabled === false)).toBe(true);
        (document.querySelector('.websiteItem button:last-child') as HTMLButtonElement).click();
        expect(data.blocked).toHaveLength(5);
        document.getElementById('refreshButton')?.click();
        expect(chromeMock.storage.local.get).toHaveBeenCalled();
    });

    it('adds by Enter and rejects invalid and duplicate rules', () => {
        setup({
            blocked: [{name: 'existing.example', scope: 'domain', enabled: true}],
            schedules: [{
                id: 'work', name: 'Work', days: [1], start: '09:00', end: '17:00', enabled: true,
                rules: [{name: 'scheduled.example', scope: 'domain', enabled: true}],
            }],
        });
        addWebsite('not-valid');
        expect(document.getElementById('addWebsiteStatus')?.textContent).toContain('Enter a valid website');
        addWebsite('existing.example');
        expect(document.getElementById('addWebsiteStatus')?.textContent).toContain('already in the always-blocked');
        addWebsite('https://scheduled.example/path');
        expect(document.getElementById('addWebsiteStatus')?.textContent).toContain('already in the always-blocked');
        const input = document.getElementById('newWebsite') as HTMLInputElement;
        input.value = 'keyboard.example';
        input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}));
        input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter'}));
        expect(document.getElementById('addWebsiteStatus')?.textContent).toBe('Website added.');
    });

    it('exports normalized configuration', () => {
        setup({enabled: false, blocked: 'invalid', schedules: 'invalid'});
        document.getElementById('exportButton')?.click();
        expect(URL.createObjectURL).toHaveBeenCalled();
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
        expect(document.getElementById('transferStatus')?.textContent).toBe('Configuration exported.');
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
        await flush();
        expect(data.enabled).toBe(false);
        expect(document.getElementById('transferStatus')?.textContent).toBe('Imported 1 rules.');

        const badFile = {text: jest.fn(async () => '{bad json')};
        Object.defineProperty(input, 'files', {value: [badFile], configurable: true});
        input.dispatchEvent(new Event('change'));
        await flush();
        expect(document.getElementById('transferStatus')?.classList.contains('error')).toBe(true);

        chromeMock.runtime.lastError = {message: 'Storage failed'};
        const anotherFile = {text: jest.fn(async () => JSON.stringify({version: 1, blocked: []}))};
        Object.defineProperty(input, 'files', {value: [anotherFile], configurable: true});
        input.dispatchEvent(new Event('change'));
        await flush();
        expect(document.getElementById('transferStatus')?.textContent).toBe('Storage failed');

        chromeMock.runtime.lastError = undefined;
        const rejectedFile = {text: jest.fn(async () => Promise.reject('plain failure'))};
        Object.defineProperty(input, 'files', {value: [rejectedFile], configurable: true});
        input.dispatchEvent(new Event('change'));
        await flush();
        expect(document.getElementById('transferStatus')?.textContent).toBe('Unable to import this file.');
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
        expect(document.querySelector('.websiteSchedule')?.textContent).toBe('Mon | 09:00-17:00');

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
            'addWebsiteStatus', 'refreshButton', 'prevPageButton',
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
});
