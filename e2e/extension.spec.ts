/// <reference types="chrome" />

import {chromium, expect, test, type BrowserContext, type Page, type Worker} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import path from 'node:path';

const extensionPath = path.resolve(__dirname, '../built');

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
        await expect(options.locator('#passwordSuccessMessage')).toHaveText('Password protection is now on.');
        await options.locator('#closePasswordSuccessButton').click();
        await options.locator('#openPassphraseSettingsButton').click();
        await options.locator('#magicWordForSettings').check();
        await expect(options.locator('#settingsGateDescription'))
            .toHaveText('On — your password is asked once when Settings opens.');
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
        await expect(lockedOptions.locator('#settingsUnlockStatus')).toHaveText('Incorrect password.');
        await lockedOptions.locator('#settingsUnlockMagicWord').fill('correct horse battery staple');
        await lockedOptions.locator('#settingsUnlockMagicWord').press('Enter');
        await expect(lockedOptions.locator('#settingsUnlockDialog')).toBeHidden();

        const popup = await context.newPage();
        await popup.goto(`${extensionUrl}/popup.html`);
        await popup.locator('.slider').click();
        await expect(popup.locator('#passphrasePrompt')).toBeVisible();
        await popup.locator('#popupPassphrase').fill('wrong passphrase');
        await popup.locator('#confirmPassphraseButton').click();
        await expect(popup.locator('#popupPassphraseStatus')).toHaveText('Incorrect password.');
        expect(await serviceWorker.evaluate(() => chrome.storage.local.get('enabled'))).toEqual({enabled: true});

        await popup.locator('#popupPassphrase').fill('correct horse battery staple');
        await popup.locator('#popupPassphrase').press('Enter');
        await expect(popup.locator('#statusText')).toHaveText('Blocking is off');
        expect(await serviceWorker.evaluate(() => chrome.storage.local.get('enabled'))).toEqual({enabled: false});
        await popup.close();
        await lockedOptions.close();
    });

    test('edits a schedule directly on a rule in the main list', async () => {
        const page = await context.newPage();
        await page.goto(`${extensionUrl}/options.html`);
        await page.locator('#newWebsite').fill('focus.example');
        await page.locator('#addButton').click();
        await expect(page.locator('.websiteSchedule')).toHaveText('Always');
        await page.locator('.scheduleButton').click();
        await expect(page.locator('#scheduleDialog')).toBeVisible();
        await page.locator('#saveScheduleButton').click();
        await expect(page.locator('.websiteSchedule')).toHaveText('Mon, Tue, Wed, Thu, Fri | 09:00-17:00');
        const stored = await serviceWorker.evaluate(() => chrome.storage.local.get('blocked'));
        expect(stored.blocked).toEqual([{
            name: 'focus.example', scope: 'domain', enabled: true,
            schedule: {days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00'},
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
        await expect(page.locator('.websiteSchedule')).toHaveText(['Always', 'Mon, Tue, Wed, Thu, Fri | 09:00-17:00']);

        const downloadPromise = page.waitForEvent('download');
        await page.locator('#exportButton').click();
        const download = await downloadPromise;
        const downloadPath = await download.path();
        expect(downloadPath).not.toBeNull();
        const exported = JSON.parse(await readFile(downloadPath as string, 'utf8'));
        expect(exported).toEqual({
            version: 3,
            enabled: true,
            blocked,
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
