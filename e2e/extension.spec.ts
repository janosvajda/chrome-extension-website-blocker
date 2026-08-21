/// <reference types="chrome" />

import {chromium, expect, test, type BrowserContext, type Page, type Worker} from '@playwright/test';
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
        await expect(page.locator('.websiteItem')).toHaveCount(5);
        await expect(page.locator('#pageInfo')).toHaveText('Page 1 of 2');
        await page.locator('#nextPageButton').click();
        await expect(page.locator('.websiteItem')).toHaveCount(1);

        const downloadPromise = page.waitForEvent('download');
        await page.locator('#exportButton').click();
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toMatch(/^tiny-blocker-backup-\d{4}-\d{2}-\d{2}\.json$/);

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
        await expect(page.locator('#transferStatus')).toHaveText('Imported 2 rules.');
        await expect(page.locator('.websiteItem')).toHaveCount(2);

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
        await popup.locator('.slider').click();
        await expect(popup.locator('#statusText')).toHaveText('Blocking is paused');
        expect(await serviceWorker.evaluate(() => chrome.storage.local.get('enabled'))).toEqual({enabled: false});
        await popup.close();
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

    test('allows matching pages while global blocking is paused', async () => {
        await serviceWorker.evaluate(async () => {
            await chrome.storage.local.set({
                enabled: false,
                blocked: [{name: 'paused.invalid', scope: 'domain', enabled: true}],
            });
        });
        const page = await context.newPage();
        await page.goto('https://paused.invalid/page', {waitUntil: 'commit'}).catch(() => undefined);
        expect(page.isClosed()).toBe(false);
        expect(page.url()).not.toContain('warning.html');
        await page.close();
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
