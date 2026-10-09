/// <reference types="chrome" />

import {chromium, expect, test, type BrowserContext, type Page, type Worker} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import path from 'node:path';

const extensionPath = path.resolve(__dirname, '../built');

async function expectEditorBehindPicker(page: Page, pickerId: string) {
    const editor = page.locator('#scheduleDialog');
    await expect(editor).toBeVisible();
    await expect(editor).toHaveAttribute('inert', '');
    await expect(editor).toHaveAttribute('aria-hidden', 'true');
    const state = await page.locator('#saveScheduleButton').evaluate((button, id) => {
        const focused = document.activeElement;
        button.focus();
        const bounds = button.getBoundingClientRect();
        const topDialog = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
            ?.closest('[role="dialog"]');
        return {
            focusStayedInPicker: document.activeElement === focused,
            topDialogId: topDialog?.id,
            pickerLayer: Number(getComputedStyle(document.getElementById(id)!).zIndex),
            editorLayer: Number(getComputedStyle(document.getElementById('scheduleDialog')!).zIndex),
        };
    }, pickerId);
    expect(state.focusStayedInPicker).toBe(true);
    expect(state.topDialogId).toBe(pickerId);
    expect(state.pickerLayer).toBeGreaterThan(state.editorLayer);
}

test.describe.serial('Tiny Website Blocker extension', () => {
    let context: BrowserContext;
    let serviceWorker: Worker;
    let extensionUrl: string;

    test.beforeAll(async () => {
        context = await chromium.launchPersistentContext('', {
            channel: 'chromium',
            headless: true,
            acceptDownloads: true,
            args: [
                `--disable-extensions-except=${extensionPath}`,
                `--load-extension=${extensionPath}`,
            ],
        });
        serviceWorker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
        extensionUrl = `chrome-extension://${new URL(serviceWorker.url()).hostname}`;
    });

    test.afterAll(async () => {
        await context?.close();
    });

    test.beforeEach(async () => {
        await serviceWorker.evaluate(async () => {
            await chrome.storage.local.clear();
            await chrome.storage.local.set({blocked: [], enabled: true});
        });
    });

    test('manages rules, pagination, export, and import', async () => {
        const page = await context.newPage();
        await page.goto(`${extensionUrl}/options.html`);

        for (let index = 1; index <= 6; index += 1) {
            await page.locator('#newWebsite').fill(`site-${index}.example`);
            await page.locator('#addButton').click();
        }
        await page.locator('#newWebsite').fill('site-1.example');
        await page.locator('#addButton').click();
        await expect(page.locator('#addWebsiteErrorMessage')).toHaveText(
            'This website is already covered by an existing rule.',
        );
        await expect(page.locator('#addWebsiteErrorDialog')).toBeVisible();
        await page.locator('#closeAddWebsiteErrorButton').click();
        await expect(page.locator('.websiteItem')).toHaveCount(5);
        await expect(page.locator('#pageInfo')).toHaveText('Page 1 of 2');
        await expect(page.locator('#addWebsite')).toBeInViewport();
        await expect(page.locator('.licenseFooter')).toBeInViewport();
        expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
        await page.locator('#nextPageButton').click();
        await expect(page.locator('.websiteItem')).toHaveCount(1);

        await page.locator('#openTransferDialogButton').click();
        await expect(page.locator('#transferDialog')).toBeVisible();
        const downloadPromise = page.waitForEvent('download');
        await page.locator('#exportButton').click();
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toMatch(/^tiny-blocker-backup-\d{4}-\d{2}-\d{2}\.json$/);
        await expect(page.locator('#exportSuccessDialog')).toBeVisible();
        await expect(page.locator('#exportedFileName')).toHaveText(download.suggestedFilename());
        await expect(page.locator('#exportSuccessDialog')).toContainText('Chrome’s configured Downloads folder');
        await page.locator('#closeExportSuccessButton').click();

        await page.locator('#importFile').setInputFiles({
            name: 'tiny-blocker.json',
            mimeType: 'application/json',
            buffer: Buffer.from(JSON.stringify({
                version: 1,
                enabled: false,
                blocked: [
                    {name: 'https://www.imported.example', scope: 'domain', enabled: true},
                    {name: 'https://video.example/watch?v=1', scope: 'url', enabled: true},
                ],
            })),
        });
        await expect(page.locator('#importConfirmationDialog')).toBeVisible();
        await page.locator('#confirmImportButton').click();
        await expect(page.locator('#transferStatus')).toHaveText('Imported 2 rules.');
        await expect(page.locator('#importResultDialog')).toBeVisible();
        await expect(page.locator('#importResultTitle')).toHaveText('Import complete');
        await expect(page.locator('#importResultMessage')).toHaveText('Imported 2 rules successfully.');
        await page.locator('#closeImportResultButton').click();
        await expect(page.locator('.websiteItem')).toHaveCount(2);

        await page.close();
    });

    test('searches and filters rules without losing hidden rules when editing or exporting', async () => {
        const hiddenRule = {name: 'hidden.example', scope: 'domain', enabled: false};
        const urlRule = {name: 'https://video.example/watch?item=1#section', scope: 'url', enabled: false};
        const blocked = [
            hiddenRule,
            urlRule,
            ...Array.from({length: 6}, (_, index) => ({
                name: `site-${index + 1}.example`, scope: 'domain', enabled: true,
            })),
        ];
        await serviceWorker.evaluate(async (rules) => {
            await chrome.storage.local.set({blocked: rules});
        }, blocked);
        const page = await context.newPage();
        await page.goto(`${extensionUrl}/options.html`);
        const search = page.getByRole('searchbox', {name: 'Search rules'});
        const filter = page.getByRole('combobox', {name: 'Show'});

        await page.locator('#nextPageButton').click();
        await search.fill('  SITE-  ');
        await expect(page.locator('#ruleResultsCount')).toHaveText('6 of 8 rules');
        await expect(page.locator('#pageInfo')).toHaveText('Page 1 of 2');
        await expect(page.locator('.websiteName')).toHaveText(blocked.slice(2, 7).map((entry) => entry.name));
        await page.locator('#nextPageButton').click();
        await expect(page.locator('.websiteName')).toHaveText(['site-6.example']);

        await filter.selectOption('disabled');
        await expect(page.locator('#ruleEmptyTitle')).toHaveText('No matching rules');
        await expect(page.locator('#ruleResultsCount')).toHaveText('0 of 8 rules');
        await expect(page.locator('#pagination')).toBeHidden();
        await page.getByRole('button', {name: 'Clear search', exact: true}).click();
        await expect(filter).toHaveValue('disabled');
        await expect(search).toBeFocused();
        await expect(page.locator('.websiteItem')).toHaveCount(2);
        await search.fill('ITEM=1#SECTION');
        await expect(page.locator('.websiteName')).toHaveText([urlRule.name]);
        expect(await serviceWorker.evaluate(() => chrome.storage.local.get('blocked'))).toEqual({blocked});

        await page.locator('#openTransferDialogButton').click();
        const downloadPromise = page.waitForEvent('download');
        await page.locator('#exportButton').click();
        const download = await downloadPromise;
        const downloadPath = await download.path();
        const exported = JSON.parse(await readFile(downloadPath as string, 'utf8'));
        expect(exported.blocked).toEqual(blocked);
        await page.locator('#closeExportSuccessButton').click();
        await page.locator('#closeTransferDialogButton').click();

        await page.getByRole('button', {name: 'Clear filters'}).click();
        await expect(filter).toHaveValue('all');
        await expect(search).toHaveValue('');
        await expect(page.locator('#ruleResultsCount')).toHaveText('8 rules');
        await filter.selectOption('enabled');
        await page.locator('#nextPageButton').click();
        await page.getByRole('checkbox', {name: 'Block site-6.example'}).click();
        await expect(page.locator('.websiteItem')).toHaveCount(5);
        await expect(page.locator('#ruleResultsCount')).toHaveText('5 of 8 rules');
        await expect(page.locator('#pagination')).toBeHidden();

        await filter.selectOption('url');
        await page.locator('.deleteButton').click();
        await page.locator('#confirmDeleteButton').click();
        await expect(page.locator('#ruleEmptyState')).toBeVisible();
        const saved = await serviceWorker.evaluate(() => chrome.storage.local.get('blocked'));
        expect(saved.blocked).toEqual(blocked
            .filter((entry) => entry.name !== urlRule.name)
            .map((entry) => entry.name === 'site-6.example' ? {...entry, enabled: false} : entry));
        await page.close();
    });

    test('keeps search, filters, and rule management visible in compact windows', async () => {
        await serviceWorker.evaluate(async () => {
            await chrome.storage.local.set({blocked: [
                'bbc.co.uk', 'blogger.com', 'chrome.google.com', 'dev.to', 'facebook.com',
                'github.com', 'instagram.com', 'linkedin.com', 'news.ycombinator.com', 'reddit.com',
                'stackoverflow.com', 'tiktok.com', 'twitch.tv', 'x.com', 'youtube.com',
            ].map((name) => ({name, scope: 'domain', enabled: true}))});
        });
        const page = await context.newPage();
        await page.goto(`${extensionUrl}/options.html`);
        for (const viewport of [
            {width: 1280, height: 800},
            {width: 1280, height: 1000},
            {width: 912, height: 643},
            {width: 760, height: 600},
            {width: 390, height: 844},
            {width: 320, height: 568},
        ]) {
            await page.setViewportSize(viewport);
            await expect(page.getByRole('searchbox', {name: 'Search rules'})).toBeInViewport({ratio: 1});
            await expect(page.locator('.ruleSearchLabel')).toBeInViewport({ratio: 1});
            await expect(page.getByRole('combobox', {name: 'Show'})).toBeInViewport({ratio: 1});
            if (viewport.width > 640) {
                await expect(page.locator('.websiteHeader')).toHaveText('Website');
                await expect(page.locator('.actionHeader')).toHaveText('Blocked');
                await expect(page.locator('#websiteListHeader')).toBeInViewport({ratio: 1});
                const header = await page.locator('.actionHeader').boundingBox();
                const checkbox = await page.locator('.websiteCheckbox').first().boundingBox();
                expect(Math.abs((header!.x + header!.width / 2) - (checkbox!.x + checkbox!.width / 2))).toBeLessThanOrEqual(2);
            }
            if (viewport.width <= 640 && viewport.height <= 640) {
                await page.locator('#addWebsite').scrollIntoViewIfNeeded();
                await expect(page.locator('#addWebsite')).toBeInViewport({ratio: 1});
                await page.locator('.licenseFooter').scrollIntoViewIfNeeded();
            } else {
                expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
                await expect(page.locator('#addWebsite')).toBeInViewport({ratio: 1});
            }
            await expect(page.locator('.licenseFooter')).toBeInViewport({ratio: 1});
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
            await page.screenshot({path: test.info().outputPath(`rules-${viewport.width}x${viewport.height}.png`), fullPage: true});
            if (viewport.width >= 900) {
                await expectRuleCardToFitRows(page);
                expect(await page.locator('.ruleTools').evaluate((tools) => tools.getBoundingClientRect().height)).toBeLessThanOrEqual(36);
            }
        }
        await page.setViewportSize({width: 390, height: 844});
        await page.getByRole('searchbox', {name: 'Search rules'}).fill('no-match');
        await expect(page.locator('#ruleEmptyState')).toBeVisible();
        await expect(page.getByRole('button', {name: 'Clear filters'})).toBeInViewport();
        await page.getByRole('button', {name: 'Clear filters'}).click();
        await expect(page.locator('.websiteItem')).toHaveCount(5);
        await page.close();
    });

    test('fits the rule card to full pages, partial pages, and search results in tall windows', async () => {
        const blocked = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot']
            .map((name) => ({name: `${name}.example`, scope: 'domain', enabled: true}));
        await serviceWorker.evaluate(async (rules) => {
            await chrome.storage.local.set({blocked: rules});
        }, blocked);
        const page = await context.newPage();
        await page.setViewportSize({width: 1280, height: 1000});
        await page.goto(`${extensionUrl}/options.html`);
        await expect(page.locator('.websiteItem')).toHaveCount(5);
        await expectRuleCardToFitRows(page);

        await page.locator('#nextPageButton').click();
        await expect(page.locator('.websiteName')).toHaveText(['foxtrot.example']);
        await expectRuleCardToFitRows(page);

        const search = page.getByRole('searchbox', {name: 'Search rules'});
        await search.fill('alpha');
        await expect(page.locator('.websiteName')).toHaveText(['alpha.example']);
        await expect(page.locator('#websiteListHeader')).toBeVisible();
        await expectRuleCardToFitRows(page);
        await page.screenshot({path: test.info().outputPath('single-search-result.png')});

        await search.fill('no-match');
        await expect(page.locator('#ruleEmptyState')).toBeVisible();
        await expect(page.locator('#websiteListHeader')).toBeHidden();
        expect(await page.locator('#websiteList').evaluate((list) => list.getBoundingClientRect().height)).toBeLessThanOrEqual(260);
        await page.screenshot({path: test.info().outputPath('no-search-results.png')});
        await page.getByRole('button', {name: 'Clear filters'}).click();
        await expect(page.locator('.websiteItem')).toHaveCount(5);
        await expectRuleCardToFitRows(page);
        expect(await serviceWorker.evaluate(() => chrome.storage.local.get('blocked'))).toEqual({blocked});
        await page.close();
    });

    test('chooses domain or exact URL when adding a path from Settings', async () => {
        const page = await context.newPage();
        await page.goto(`${extensionUrl}/options.html`);

        await page.locator('#newWebsite').fill('https://chrome.google.com/webstore');
        await page.locator('#newWebsite').press('Enter');
        await expect(page.locator('#blockScopeDialog')).toBeVisible();
        await page.locator('#blockUrlButton').click();
        await expect(page.locator('.websiteItem')).toContainText('https://chrome.google.com/webstore');
        await expect(page.locator('.websiteScope')).toHaveText('URL');

        await page.locator('#newWebsite').fill('chrome.google.com');
        await page.locator('#addButton').click();
        await expect(page.locator('.websiteItem[data-scope="domain"]').filter({hasText: 'chrome.google.com'})).toContainText('Domain');

        await page.locator('#newWebsite').fill('https://chrome.google.com/another/page');
        await page.locator('#addButton').click();
        await page.locator('#blockUrlButton').click();
        await expect(page.locator('#addWebsiteErrorMessage')).toHaveText('This website is already covered by an existing rule.');
        await expect(page.locator('#addWebsiteErrorDialog')).toBeVisible();
        await page.locator('#closeAddWebsiteErrorButton').click();

        await page.locator('#newWebsite').fill('https://example.com/path');
        await page.locator('#addButton').click();
        await page.locator('#blockDomainButton').click();
        await expect(page.locator('.websiteItem').filter({hasText: 'example.com'})).toContainText('Domain');

        await page.locator('#newWebsite').fill('https://origin.example');
        await page.locator('#addButton').click();
        await expect(page.locator('#blockScopeDialog')).toBeHidden();
        await expect(page.locator('.websiteItem').filter({hasText: 'origin.example'})).toContainText('Domain');

        const urlRule = page.locator('.websiteItem[data-scope="url"]').filter({hasText: 'chrome.google.com/webstore'});
        await urlRule.getByRole('button', {name: 'Delete'}).click();
        await expect(page.locator('#deleteConfirmationDialog')).toBeVisible();
        await expect(page.locator('#deleteRuleValue')).toHaveText('https://chrome.google.com/webstore');
        await page.locator('#cancelDeleteButton').click();
        await expect(urlRule).toHaveCount(1);
        await urlRule.getByRole('button', {name: 'Delete'}).click();
        await page.locator('#confirmDeleteButton').click();
        await expect(urlRule).toHaveCount(0);

        await page.close();
    });

    test('shows popup state and changes the global blocking switch', async () => {
        await serviceWorker.evaluate(async () => {
            await chrome.storage.local.set({
                enabled: true,
                blocked: [
                    {name: 'one.example', scope: 'domain', enabled: true},
                    {name: 'two.example', scope: 'domain', enabled: false},
                ],
                statistics: {total: 9, today: 3, date: new Date().toLocaleDateString('en-CA')},
            });
        });
        const popup = await context.newPage();
        await popup.goto(`${extensionUrl}/popup.html`);

        await expect(popup.locator('#activeRules')).toHaveText('1');
        await expect(popup.locator('#blockedToday')).toHaveText('3');
        await expect(popup.locator('#blockedTotal')).toHaveText('9');
        await expect(popup.locator('#statusText')).toHaveText('Blocking is on');

        await popup.locator('[data-pause-minutes="15"]').click();
        await expect(popup.locator('#statusText')).toHaveText('Blocking is temporarily paused');
        await expect(popup.locator('#pauseRemaining')).toHaveText('15 minutes remaining');
        await expect(popup.locator('#pauseResumeTime')).toContainText('Resumes automatically at');
        const pausedState = await serviceWorker.evaluate(() => chrome.storage.local.get(['enabled', 'pausedUntil']));
        expect(pausedState.enabled).toBe(true);
        expect(pausedState.pausedUntil).toBeGreaterThan(Date.now());

        await popup.locator('#resumeButton').click();
        await expect(popup.locator('#statusText')).toHaveText('Blocking is on');
        expect(await serviceWorker.evaluate(() => chrome.storage.local.get('pausedUntil'))).toEqual({pausedUntil: 0});

        await popup.locator('.slider').click();
        await expect(popup.locator('#statusText')).toHaveText('Blocking is off');
        expect(await serviceWorker.evaluate(() => chrome.storage.local.get(['enabled', 'pausedUntil', 'pauseUsage']))).toEqual({
            enabled: false,
            pausedUntil: 0,
            pauseUsage: expect.objectContaining({count: 2}),
        });
        await popup.close();
    });

    test('protects blocking changes with a locally verified passphrase', async () => {
        const options = await context.newPage();
        await options.goto(`${extensionUrl}/options.html`);
        await options.locator('#openPassphraseSettingsButton').click();
        await expect(options.locator('#passphraseSettingsDialog')).toBeVisible();
        await options.locator('#newPassphrase').fill('correct horse battery staple');
        await options.locator('#confirmPassphrase').fill('correct horse battery staple');
        await options.locator('#confirmPassphrase').press('Enter');
        await expect(options.locator('#passwordSuccessDialog')).toBeVisible();
        await expect(options.locator('#passwordSuccessMessage')).toHaveText('Your confirmation phrase is now set.');
        await options.locator('#closePasswordSuccessButton').click();
        await options.locator('#openPassphraseSettingsButton').click();
        await options.locator('#magicWordForSettings').check();
        await expect(options.locator('#settingsGateDescription'))
            .toHaveText('On — your confirmation phrase is asked once when Settings opens.');
        await options.locator('#closePassphraseSettingsButton').click();
        await options.locator('#openPassphraseSettingsButton').click();
        await expect(options.locator('#magicWordForSettings')).toBeChecked();

        const stored = await serviceWorker.evaluate(() => chrome.storage.local.get([
            'passphraseProtection',
            'magicWordForSettings',
        ]));
        expect(stored.passphraseProtection).toEqual(expect.objectContaining({
            version: 1,
            iterations: 600000,
            salt: expect.any(String),
            iv: expect.any(String),
            ciphertext: expect.any(String),
        }));
        expect(stored.magicWordForSettings).toBe(true);
        expect(JSON.stringify(stored)).not.toContain('correct horse battery staple');

        await options.close();
        const lockedOptions = await context.newPage();
        await lockedOptions.goto(`${extensionUrl}/options.html`);
        await expect(lockedOptions.locator('#settingsUnlockDialog')).toBeVisible();
        await lockedOptions.locator('#settingsUnlockMagicWord').fill('wrong password');
        await lockedOptions.locator('#unlockSettingsButton').click();
        await expect(lockedOptions.locator('#settingsUnlockStatus')).toHaveText('Incorrect confirmation phrase.');
        await lockedOptions.locator('#settingsUnlockMagicWord').fill('correct horse battery staple');
        await lockedOptions.locator('#settingsUnlockMagicWord').press('Enter');
        await expect(lockedOptions.locator('#settingsUnlockDialog')).toBeHidden();

        const popup = await context.newPage();
        await popup.goto(`${extensionUrl}/popup.html`);
        await popup.locator('.slider').click();
        await expect(popup.locator('#passphrasePrompt')).toBeVisible();
        await popup.locator('#popupPassphrase').fill('wrong passphrase');
        await popup.locator('#confirmPassphraseButton').click();
        await expect(popup.locator('#popupPassphraseStatus')).toHaveText('Incorrect confirmation phrase.');
        expect(await serviceWorker.evaluate(() => chrome.storage.local.get('enabled'))).toEqual({enabled: true});

        await popup.locator('#popupPassphrase').fill('correct horse battery staple');
        await popup.locator('#popupPassphrase').press('Enter');
        await expect(popup.locator('#statusText')).toHaveText('Blocking is off');
        expect(await serviceWorker.evaluate(() => chrome.storage.local.get('enabled'))).toEqual({enabled: false});
        await popup.close();
        await lockedOptions.close();
    });

    test('previews and copies schedules into filtered rules without changing source rules or enabled states', async () => {
        const schedule = {daily: [
            {day: 1, mode: 'all-day'},
            {day: 3, mode: 'period', start: '09:15', end: '16:45'},
            {day: 5, mode: 'period', start: '22:00', end: '06:00'},
        ]};
        const target = {
            name: 'https://target.example/focus', scope: 'url', enabled: false,
            schedule: {daily: [{day: 2, mode: 'all-day'}]},
        };
        const source = {name: 'source.example', scope: 'domain', enabled: false, schedule};
        const untouched = {name: 'untouched.example', scope: 'domain', enabled: true};
        const blocked = [target, source, untouched];
        await serviceWorker.evaluate(async (rules) => {
            await chrome.storage.local.set({blocked: rules});
        }, blocked);
        const page = await context.newPage();
        await page.setViewportSize({width: 1280, height: 800});
        await page.goto(`${extensionUrl}/options.html`);
        await page.getByRole('searchbox', {name: 'Search rules'}).fill('target.example');
        await page.getByRole('combobox', {name: 'Show'}).selectOption('url');
        await page.getByRole('button', {name: 'Edit schedule', exact: true}).click();
        const editorBounds = await page.locator('.scheduleDialogCard').boundingBox();
        await page.getByRole('button', {name: 'Copy from another rule…'}).click();
        const picker = page.getByRole('dialog', {name: 'Copy a schedule'});
        const selector = page.getByRole('combobox', {name: 'Copy from', exact: true});
        const useButton = page.getByRole('button', {name: 'Use this schedule'});
        await expect(picker).toBeVisible();
        await expectEditorBehindPicker(page, 'scheduleCopyDialog');
        expect(await page.locator('.scheduleDialogCard').boundingBox()).toEqual(editorBounds);
        await expect(selector).toBeFocused();
        await expect(useButton).toBeDisabled();
        await selector.selectOption({label: source.name});
        await expect(page.locator('#scheduleCopyPreview')).toHaveText('Mon | all day; Wed | 09:15-16:45; Fri | 22:00-06:00');
        await selector.press('Shift+Tab');
        await expect(useButton).toBeFocused();
        await useButton.press('Tab');
        await expect(selector).toBeFocused();

        for (const viewport of [
            {width: 1280, height: 800},
            {width: 390, height: 844},
            {width: 320, height: 568},
        ]) {
            await page.setViewportSize(viewport);
            await expectEditorBehindPicker(page, 'scheduleCopyDialog');
            await expect(page.locator('.scheduleCopyCard')).toBeInViewport({ratio: 1});
            await expect(useButton).toBeInViewport({ratio: 1});
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
            await page.screenshot({path: test.info().outputPath(`copy-schedule-${viewport.width}x${viewport.height}.png`)});
        }
        await selector.press('Escape');
        await expect(picker).toBeHidden();
        await expect(page.locator('#scheduleDialog')).toBeVisible();
        await expect(page.locator('#scheduleDialog')).not.toHaveAttribute('inert', '');
        await expect(page.locator('#scheduleDialog')).not.toHaveAttribute('aria-hidden', 'true');
        await expect(page.getByRole('button', {name: 'Copy from another rule…'})).toBeFocused();
        expect(await serviceWorker.evaluate(() => chrome.storage.local.get('blocked'))).toEqual({blocked});

        await page.setViewportSize({width: 1280, height: 800});
        await page.getByRole('button', {name: 'Copy from another rule…'}).click();
        await selector.selectOption({label: source.name});
        await useButton.click();
        await expect(picker).toBeHidden();
        await expect(page.getByRole('combobox', {name: 'Monday blocking mode'})).toHaveValue('all-day');
        await expect(page.getByLabel('Friday start time')).toHaveValue('22:00');
        await expect(page.getByLabel('Friday end time')).toHaveValue('06:00');
        expect(await serviceWorker.evaluate(() => chrome.storage.local.get('blocked'))).toEqual({blocked});
        await page.getByRole('button', {name: 'Save blocking schedule', exact: true}).click();
        const copiedRules = [{...target, schedule}, source, untouched];
        expect(await serviceWorker.evaluate(() => chrome.storage.local.get('blocked'))).toEqual({blocked: copiedRules});
        await expect(page.getByRole('checkbox', {name: `Block ${target.name}`, exact: true})).not.toBeChecked();

        await page.locator('#openTransferDialogButton').click();
        const downloadPromise = page.waitForEvent('download');
        await page.locator('#exportButton').click();
        const download = await downloadPromise;
        const exported = JSON.parse(await readFile(await download.path() as string, 'utf8'));
        expect(exported).toEqual({version: 4, enabled: true, blocked: copiedRules});
        await page.close();
    });

    test('previews schedule templates and saves adjusted times without changing hidden rules or enabled states', async () => {
        const target = {
            name: 'https://target.example/focus', scope: 'url', enabled: false,
            schedule: {daily: [{day: 2, mode: 'all-day'}]},
        };
        const source = {name: 'source.example', scope: 'domain', enabled: true, schedule: {daily: [{day: 1, mode: 'all-day'}]}};
        const blocked = [target, source];
        await serviceWorker.evaluate(async (rules) => {
            await chrome.storage.local.set({blocked: rules});
        }, blocked);
        const page = await context.newPage();
        await page.setViewportSize({width: 1280, height: 800});
        await page.goto(`${extensionUrl}/options.html`);
        await page.getByRole('searchbox', {name: 'Search rules'}).fill('target.example');
        await page.getByRole('combobox', {name: 'Show'}).selectOption('url');
        await page.getByRole('button', {name: 'Edit schedule', exact: true}).click();
        const templateButton = page.getByRole('button', {name: 'Use a template…', exact: true});
        await expect(templateButton).toBeVisible();
        await expect(page.getByRole('button', {name: 'Copy from another rule…'})).toBeVisible();
        const templateBounds = (await templateButton.boundingBox())!;
        const copyBounds = (await page.locator('#copyScheduleButton').boundingBox())!;
        const removeBounds = (await page.locator('#removeScheduleButton').boundingBox())!;
        const toolbarBounds = (await page.locator('.scheduleQuickActions').boundingBox())!;
        expect(Math.abs(removeBounds.y - templateBounds.y)).toBeLessThanOrEqual(1);
        expect(Math.abs(removeBounds.y - copyBounds.y)).toBeLessThanOrEqual(1);
        expect(removeBounds.x).toBeGreaterThan(copyBounds.x + copyBounds.width);
        expect(Math.abs(removeBounds.x + removeBounds.width - toolbarBounds.x - toolbarBounds.width)).toBeLessThanOrEqual(1);
        await page.screenshot({path: test.info().outputPath('schedule-template-editor.png')});
        await page.locator('[data-schedule-day="1"] .scheduleDayEnabled').check();
        await page.getByLabel('Monday start time').fill('10:30');
        const editorBounds = await page.locator('.scheduleDialogCard').boundingBox();
        await templateButton.click();
        const picker = page.getByRole('dialog', {name: 'Schedule templates', exact: true});
        const selector = page.getByRole('combobox', {name: 'Template', exact: true});
        const useButton = page.getByRole('button', {name: 'Use this template', exact: true});
        await expectEditorBehindPicker(page, 'scheduleTemplateDialog');
        expect(await page.locator('.scheduleDialogCard').boundingBox()).toEqual(editorBounds);
        await expect(selector).toBeFocused();
        await expect(useButton).toBeDisabled();
        await selector.selectOption('everyday-all-day');
        await expect(page.locator('#scheduleTemplatePreview')).toHaveText('Sun, Mon, Tue, Wed, Thu, Fri, Sat | all day');
        await selector.press('Escape');
        await expect(picker).toBeHidden();
        await expect(page.locator('#scheduleDialog')).not.toHaveAttribute('inert', '');
        await expect(page.locator('#scheduleDialog')).not.toHaveAttribute('aria-hidden', 'true');
        await expect(templateButton).toBeFocused();
        await expect(page.getByLabel('Monday start time')).toHaveValue('10:30');
        await templateButton.click();
        await expect(selector).toHaveValue('');
        await selector.selectOption('everyday-all-day');
        await useButton.click();
        await expect(page.getByRole('combobox', {name: 'Monday blocking mode'})).toHaveValue('all-day');
        await expect(page.getByLabel('Monday start time')).toBeHidden();
        expect(await serviceWorker.evaluate(() => chrome.storage.local.get('blocked'))).toEqual({blocked});
        await page.getByRole('button', {name: 'Cancel', exact: true}).click();
        await page.getByRole('button', {name: 'Edit schedule', exact: true}).click();
        await templateButton.click();
        await selector.selectOption('everyday-mornings');
        await expect(page.locator('#scheduleTemplatePreview')).toHaveText('Sun, Mon, Tue, Wed, Thu, Fri, Sat | 08:00-12:00');
        await selector.press('Shift+Tab');
        await expect(useButton).toBeFocused();
        await useButton.press('Tab');
        await expect(selector).toBeFocused();
        for (const viewport of [
            {width: 1280, height: 800},
            {width: 912, height: 643},
            {width: 390, height: 844},
            {width: 320, height: 568},
        ]) {
            await page.setViewportSize(viewport);
            await expectEditorBehindPicker(page, 'scheduleTemplateDialog');
            await expect(page.locator('.scheduleTemplateCard')).toBeInViewport({ratio: 1});
            await expect(selector).toBeInViewport({ratio: 1});
            await expect(useButton).toBeInViewport({ratio: 1});
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
            const selectBox = (await selector.boundingBox())!;
            const arrowBox = (await page.locator('.scheduleTemplateArrow').boundingBox())!;
            expect(selectBox.x + selectBox.width - arrowBox.x - arrowBox.width).toBeGreaterThanOrEqual(10);
            await page.screenshot({path: test.info().outputPath(`schedule-templates-${viewport.width}x${viewport.height}.png`)});
        }
        await useButton.click();
        await expect(page.getByLabel('Monday start time')).toHaveValue('08:00');
        await page.getByLabel('Monday end time').fill('13:00');
        const saveButton = page.getByRole('button', {name: 'Save blocking schedule', exact: true});
        await expect(saveButton).toBeInViewport({ratio: 1});
        expect(await serviceWorker.evaluate(() => chrome.storage.local.get('blocked'))).toEqual({blocked});
        await saveButton.click();
        const adjustedSchedule = {daily: Array.from({length: 7}, (_, day) => ({
            day, mode: 'period', start: '08:00', end: day === 1 ? '13:00' : '12:00',
        }))};
        expect(await serviceWorker.evaluate(() => chrome.storage.local.get('blocked'))).toEqual({
            blocked: [{...target, schedule: adjustedSchedule}, source],
        });
        await expect(page.getByRole('checkbox', {name: `Block ${target.name}`, exact: true})).not.toBeChecked();
        await page.close();
    });

    test('keeps schedule Save and Cancel at the top while the blocking times scroll', async () => {
        const rule = {
            name: 'focus.example', scope: 'domain', enabled: true,
            schedule: {daily: Array.from({length: 7}, (_, day) => ({
                day, mode: 'period', start: '09:00', end: '17:00',
            }))},
        };
        await serviceWorker.evaluate(async (blockedRule) => {
            await chrome.storage.local.set({blocked: [blockedRule]});
        }, rule);
        const page = await context.newPage();
        await page.goto(`${extensionUrl}/options.html`);
        await page.locator('.scheduleButton').click();
        const body = page.locator('.scheduleDialogBody');
        const saveButton = page.getByRole('button', {name: 'Save blocking schedule', exact: true});
        const cancelButton = page.getByRole('button', {name: 'Cancel', exact: true});
        const ruleName = page.locator('#scheduleRuleName');
        for (const viewport of [
            {width: 1280, height: 800},
            {width: 912, height: 643},
            {width: 390, height: 844},
            {width: 320, height: 568},
        ]) {
            await page.setViewportSize(viewport);
            await body.evaluate((element) => {element.scrollTop = 0;});
            await expect(saveButton).toBeInViewport({ratio: 1});
            await expect(cancelButton).toBeInViewport({ratio: 1});
            await expect(ruleName).toBeInViewport({ratio: 1});
            await expect(ruleName).toHaveText(rule.name);
            await expect(page.locator('#removeScheduleButton')).toBeInViewport({ratio: 1});
            await page.screenshot({path: test.info().outputPath(`schedule-toolbar-${viewport.width}x${viewport.height}.png`)});
            const saveTop = (await saveButton.boundingBox())!.y;
            const cancelTop = (await cancelButton.boundingBox())!.y;
            if (viewport.width <= 640 || viewport.height <= 643) {
                expect(await body.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
            } else {
                expect(await body.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(true);
            }
            await body.evaluate((element) => {element.scrollTop = element.scrollHeight;});
            await expect(saveButton).toBeInViewport({ratio: 1});
            await expect(cancelButton).toBeInViewport({ratio: 1});
            await expect(ruleName).toBeInViewport({ratio: 1});
            expect(Math.abs((await saveButton.boundingBox())!.y - saveTop)).toBeLessThanOrEqual(1);
            expect(Math.abs((await cancelButton.boundingBox())!.y - cancelTop)).toBeLessThanOrEqual(1);
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
            await page.screenshot({path: test.info().outputPath(`schedule-actions-${viewport.width}x${viewport.height}.png`)});
        }
        await cancelButton.click();
        await expect(page.locator('#scheduleDialog')).toBeHidden();
        expect(await serviceWorker.evaluate(() => chrome.storage.local.get('blocked'))).toEqual({blocked: [rule]});

        await page.locator('.scheduleButton').click();
        expect(await body.evaluate((element) => element.scrollTop)).toBe(0);
        for (const checkbox of await page.locator('.scheduleDayEnabled').all()) {
            await checkbox.uncheck();
        }
        await saveButton.click();
        await expect(page.locator('#scheduleStatus')).toContainText('Select at least one day');
        await expect(page.locator('#scheduleStatus')).toBeInViewport({ratio: 1});
        await expect(saveButton).toBeInViewport({ratio: 1});
        const friday = page.locator('[data-schedule-day="5"]');
        await friday.locator('.scheduleDayEnabled').check();
        await friday.locator('.scheduleDayMode').selectOption('all-day');
        await expect(saveButton).toBeInViewport({ratio: 1});
        await saveButton.click();
        await expect(page.locator('#scheduleDialog')).toBeHidden();
        expect(await serviceWorker.evaluate(() => chrome.storage.local.get('blocked'))).toEqual({blocked: [{
            ...rule, schedule: {daily: [{day: 5, mode: 'all-day'}]},
        }]});
        await page.close();
    });

    test('keeps long rule names beneath the schedule title without covering the action buttons', async () => {
        const longDomain = `${'long-subdomain-'.repeat(3)}example.${'another-subdomain-'.repeat(2)}example.example`;
        const longUrl = `https://video.example/${'long-path-segment-'.repeat(45)}?view=focus#chapter-2`;
        const page = await context.newPage();
        for (const rule of [
            {name: longDomain, scope: 'domain', enabled: true},
            {name: longUrl, scope: 'url', enabled: true},
        ]) {
            await serviceWorker.evaluate(async (blockedRule) => {
                await chrome.storage.local.set({blocked: [blockedRule]});
            }, rule);
            await page.goto(`${extensionUrl}/options.html`);
            await page.locator('.scheduleButton').click();
            await expect(page.locator('#scheduleRuleName')).toHaveText(rule.name);
            await expect(page.locator('#scheduleRuleName')).toHaveAttribute('title', rule.name);
            await expect(page.locator('#scheduleExplanation')).toHaveText(
                'When this rule is enabled, the website is blocked during the selected days and times. Outside this schedule, it can be opened.',
            );
            for (const viewport of [
                {width: 1280, height: 800},
                {width: 912, height: 643},
                {width: 390, height: 844},
                {width: 320, height: 568},
            ]) {
                await page.setViewportSize(viewport);
                await page.locator('.scheduleDialogBody').evaluate((body) => {body.scrollTop = body.scrollHeight;});
                const title = await page.locator('#scheduleDialogTitle').boundingBox();
                const name = await page.locator('#scheduleRuleName').boundingBox();
                const titleGroup = await page.locator('.scheduleDialogTitleGroup').boundingBox();
                await expect(page.locator('#scheduleRuleName')).toBeInViewport({ratio: 1});
                await expect(page.locator('#cancelScheduleButton')).toBeInViewport({ratio: 1});
                await expect(page.locator('#saveScheduleButton')).toBeInViewport({ratio: 1});
                expect(name!.y).toBeGreaterThanOrEqual(title!.y + title!.height);
                expect(name!.height).toBeLessThanOrEqual(56);
                const visibleNameLines = await page.locator('#scheduleRuleNameText').evaluate((text) => ({
                    height: text.clientHeight,
                    lineHeight: parseFloat(getComputedStyle(text).lineHeight),
                }));
                expect(visibleNameLines.height).toBeLessThanOrEqual(visibleNameLines.lineHeight * 2 + 1);
                expect(name!.x + name!.width).toBeLessThanOrEqual(titleGroup!.x + titleGroup!.width + 1);
                expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
                if (rule.scope === 'url') {
                    await page.screenshot({path: test.info().outputPath(`long-schedule-name-${viewport.width}x${viewport.height}.png`)});
                }
            }
            await page.locator('#cancelScheduleButton').click();
            expect(await serviceWorker.evaluate(() => chrome.storage.local.get('blocked'))).toEqual({blocked: [rule]});
        }
        await page.close();
    });

    test('edits a schedule directly on a rule in the main list', async () => {
        const page = await context.newPage();
        await page.goto(`${extensionUrl}/options.html`);
        await page.locator('#newWebsite').fill('focus.example');
        await page.locator('#addButton').click();
        await expect(page.locator('.websiteSchedule')).toHaveText('Always');
        await page.locator('.scheduleButton').click();
        await expect(page.locator('#scheduleDialog')).toBeVisible();
        for (const checkbox of await page.locator('.scheduleDayEnabled').all()) {
            await checkbox.uncheck();
        }
        const monday = page.locator('[data-schedule-day="1"]');
        await monday.locator('.scheduleDayEnabled').check();
        await monday.locator('.scheduleDayMode').selectOption('all-day');
        const tuesday = page.locator('[data-schedule-day="2"]');
        await tuesday.locator('.scheduleDayEnabled').check();
        await tuesday.locator('.scheduleDayStart').fill('10:00');
        await tuesday.locator('.scheduleDayEnd').fill('16:00');
        await page.locator('#saveScheduleButton').click();
        await expect(page.locator('.websiteSchedule')).toHaveText('Scheduled Mon | all day; Tue | 10:00-16:00');
        const stored = await serviceWorker.evaluate(() => chrome.storage.local.get('blocked'));
        expect(stored.blocked).toEqual([{
            name: 'focus.example', scope: 'domain', enabled: true,
            schedule: {daily: [
                {day: 1, mode: 'all-day'},
                {day: 2, mode: 'period', start: '10:00', end: '16:00'},
            ]},
        }]);
        await page.close();
    });

    test('round-trips per-rule schedules through JSON import and export', async () => {
        const page = await context.newPage();
        await page.goto(`${extensionUrl}/options.html`);
        await page.locator('#openTransferDialogButton').click();
        const blocked = [
            {name: 'always.example', scope: 'domain', enabled: true},
            {
                name: 'linkedin.com', scope: 'domain', enabled: true,
                schedule: {days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00'},
            },
        ];
        const normalizedBlocked = [
            blocked[0],
            {
                name: 'linkedin.com', scope: 'domain', enabled: true,
                schedule: {daily: [1, 2, 3, 4, 5].map((day) => ({
                    day, mode: 'period', start: '09:00', end: '17:00',
                }))},
            },
        ];

        await page.locator('#importFile').setInputFiles({
            name: 'scheduled-rules.json',
            mimeType: 'application/json',
            buffer: Buffer.from(JSON.stringify({
                version: 3,
                enabled: true,
                blocked,
            })),
        });
        await expect(page.locator('#importConfirmationDialog')).toBeVisible();
        await page.locator('#confirmImportButton').click();
        await expect(page.locator('#transferStatus')).toHaveText('Imported 2 rules.');
        await expect(page.locator('#importResultMessage')).toHaveText('Imported 2 rules successfully.');
        await page.locator('#closeImportResultButton').click();
        await expect(page.locator('.websiteSchedule')).toHaveText(['Always', 'Scheduled Mon, Tue, Wed, Thu, Fri | 09:00-17:00']);

        const downloadPromise = page.waitForEvent('download');
        await page.locator('#exportButton').click();
        const download = await downloadPromise;
        const downloadPath = await download.path();
        expect(downloadPath).not.toBeNull();
        const exported = JSON.parse(await readFile(downloadPath as string, 'utf8'));
        expect(exported).toEqual({
            version: 4,
            enabled: true,
            blocked: normalizedBlocked,
        });
        await page.close();
    });

    test('blocks domain and exact URL rules, opens warning pages, and records statistics', async () => {
        await serviceWorker.evaluate(async () => {
            await chrome.storage.local.set({
                enabled: true,
                blocked: [
                    {name: 'domain.invalid', scope: 'domain', enabled: true},
                    {name: 'https://exact.invalid/path?item=1', scope: 'url', enabled: true},
                ],
            });
        });

        await openBlockedPage(context, 'https://domain.invalid/anything', 'reason=domain');
        await openBlockedPage(context, 'https://exact.invalid/path?item=1', 'reason=url');

        const statistics = await serviceWorker.evaluate(() => chrome.storage.local.get('statistics'));
        expect(statistics.statistics).toEqual(expect.objectContaining({total: 2, today: 2}));
    });

    test('allows matching pages while blocking is manually or temporarily paused', async () => {
        await serviceWorker.evaluate(async () => {
            await chrome.storage.local.set({
                enabled: true,
                pausedUntil: Date.now() + 60_000,
                blocked: [{name: 'paused.invalid', scope: 'domain', enabled: true}],
            });
        });
        const page = await context.newPage();
        await page.goto('https://paused.invalid/page', {waitUntil: 'commit'}).catch(() => undefined);
        expect(page.isClosed()).toBe(false);
        expect(page.url()).not.toContain('warning.html');
        await page.close();

        await serviceWorker.evaluate(async () => {
            await chrome.storage.local.set({enabled: false, pausedUntil: 0});
        });
        const manuallyPausedPage = await context.newPage();
        await manuallyPausedPage.goto('https://paused.invalid/other', {waitUntil: 'commit'}).catch(() => undefined);
        expect(manuallyPausedPage.isClosed()).toBe(false);
        expect(manuallyPausedPage.url()).not.toContain('warning.html');
        await manuallyPausedPage.close();
    });
});

async function expectRuleCardToFitRows(page: Page): Promise<void> {
    const listSize = await page.locator('#websiteList').evaluate((list) => {
        const lastRow = list.querySelector('.websiteItem:last-child') as HTMLElement;
        return {
            contentHeight: list.scrollHeight,
            visibleHeight: list.clientHeight,
            bottomGap: list.getBoundingClientRect().bottom - lastRow.getBoundingClientRect().bottom,
        };
    });
    expect(listSize.contentHeight, 'All rows on the current page must fit without scrolling').toBeLessThanOrEqual(listSize.visibleHeight);
    expect(listSize.bottomGap, 'The card should end just below the last row').toBeLessThanOrEqual(24);
    expect(listSize.bottomGap).toBeGreaterThanOrEqual(0);
}

async function openBlockedPage(
    context: BrowserContext,
    url: string,
    expectedReason: string,
): Promise<Page> {
    const warningPromise = context.waitForEvent('page', {
        predicate: (page) => page.url().includes('warning.html'),
    });
    const blockedPage = await context.newPage();
    await blockedPage.goto(url, {waitUntil: 'commit'}).catch(() => undefined);
    const warningPage = await warningPromise;
    await warningPage.waitForLoadState('domcontentloaded');
    expect(warningPage.url()).toContain(expectedReason);
    await expect(warningPage.locator('#blockedReason')).toBeVisible();
    await warningPage.close();
    return warningPage;
}
