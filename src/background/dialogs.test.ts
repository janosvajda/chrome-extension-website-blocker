/** @jest-environment jsdom */

import {
    showBlockScopeDialog,
    showCoveredUrlRulesDialog,
    showScheduledDomainOverrideDialog,
} from './dialogs';

describe('background injected dialogs', () => {
    const nativeAttachShadow = Element.prototype.attachShadow;
    let shadowRoots: ShadowRoot[] = [];

    beforeEach(() => {
        shadowRoots = [];
        jest.spyOn(Element.prototype, 'attachShadow').mockImplementation(function(init) {
            expect(init.mode).toBe('closed');
            const root = nativeAttachShadow.call(this, init);
            shadowRoots.push(root);
            return root;
        });
    });

    afterEach(() => {
        document.body.innerHTML = '';
        jest.restoreAllMocks();
    });

    it.each([
        ['Keep schedule', false],
        ['Remove schedule and block domain', true],
    ])('resolves the scheduled-rule action %s', async (label, expected) => {
        const result = showScheduledDomainOverrideDialog('linkedin.com', 'Mon-Fri | 08:00-17:00');

        expect(activeRoot().textContent).toContain('linkedin.com already has scheduled blocking');
        expect(activeRoot().textContent).toContain('Mon-Fri | 08:00-17:00');
        expect(activeRoot().activeElement?.textContent).toBe('Keep schedule');
        expect(document.getElementById('tiny-blocker-schedule-choice')?.shadowRoot).toBeNull();
        clickButton(label);

        await expect(result).resolves.toBe(expected);
        expect(document.getElementById('tiny-blocker-schedule-choice')).toBeNull();
    });

    it('keeps a schedule when its backdrop is clicked', async () => {
        const result = showScheduledDomainOverrideDialog('example.com', 'Sat | all day');
        (activeRoot().firstElementChild as HTMLElement).click();
        await expect(result).resolves.toBe(false);
    });

    it('keeps a schedule when Escape is pressed and replaces stale dialog markup', async () => {
        document.body.innerHTML = '<div id="tiny-blocker-schedule-choice">stale</div>';
        const result = showScheduledDomainOverrideDialog('example.com', 'Sun | all day');
        expect(document.body.textContent).not.toContain('stale');
        activeRoot().firstElementChild?.firstElementChild
            ?.dispatchEvent(new MouseEvent('click', {bubbles: true}));
        expect(document.getElementById('tiny-blocker-schedule-choice')).not.toBeNull();
        window.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}));
        await expect(result).resolves.toBe(false);
    });

    it('closes the scheduled-rule dialog with Escape after a non-Escape key', async () => {
        const result = showScheduledDomainOverrideDialog('example.com', 'Sun | all day');
        window.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab'}));
        expect(document.getElementById('tiny-blocker-schedule-choice')).not.toBeNull();
        window.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}));
        await expect(result).resolves.toBe(false);
    });

    it.each([
        ['Cancel', null],
        ['Block domain', 'domain'],
        ['Block this full URL', 'url'],
    ])('resolves the block-scope action %s', async (label, expected) => {
        const result = showBlockScopeDialog('https://example.com/path');

        expect(activeRoot().textContent).toContain('Choose how you want to block this page:');
        expect(activeRoot().textContent).toContain('https://example.com/path');
        expect(document.getElementById('tiny-blocker-choice')?.shadowRoot).toBeNull();
        clickButton(label);

        await expect(result).resolves.toBe(expected);
        expect(document.getElementById('tiny-blocker-choice')).toBeNull();
    });

    it('uses the shared responsive layout for full-page and popup rendering', async () => {
        const result = showBlockScopeDialog('https://example.com/a/very/long/path?with=query');
        const root = activeRoot();
        const styles = root.querySelector('style')?.textContent || '';

        expect(root.querySelector('.card')).not.toBeNull();
        expect(root.querySelector('.url')?.textContent).toContain('/a/very/long/path');
        expect(root.querySelector('.actions')?.children).toHaveLength(3);
        expect(styles).toContain('@media (max-width: 440px)');
        expect(styles).toContain('max-height: 88px');
        expect(styles).toContain('grid-template-columns: auto auto auto');

        clickButton('Cancel');
        await expect(result).resolves.toBeNull();
    });

    it('cancels the block-scope dialog from its backdrop', async () => {
        const result = showBlockScopeDialog('https://example.com/path');
        (activeRoot().firstElementChild as HTMLElement).click();
        await expect(result).resolves.toBeNull();
    });

    it('cancels the block-scope dialog with Escape and replaces stale dialog markup', async () => {
        document.body.innerHTML = '<div id="tiny-blocker-choice">stale</div>';
        const result = showBlockScopeDialog('https://example.com/path');
        expect(document.body.textContent).not.toContain('stale');
        activeRoot().firstElementChild?.firstElementChild
            ?.dispatchEvent(new MouseEvent('click', {bubbles: true}));
        expect(document.getElementById('tiny-blocker-choice')).not.toBeNull();
        window.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}));
        await expect(result).resolves.toBeNull();
    });

    it('closes the block-scope dialog with Escape after a non-Escape key', async () => {
        const result = showBlockScopeDialog('https://example.com/path');
        window.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab'}));
        expect(document.getElementById('tiny-blocker-choice')).not.toBeNull();
        window.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}));
        await expect(result).resolves.toBeNull();
    });

    it.each([
        ['Cancel', null],
        ['Keep URL blocks', 'keep'],
        ['Disable URL blocks', 'disable'],
        ['Delete URL blocks', 'delete'],
    ])('resolves the covered-URL action %s', async (label, expected) => {
        const urls = [
            {url: 'https://example.com/one', enabled: true},
            {url: 'https://sub.example.com/two', enabled: false},
        ];
        const result = showCoveredUrlRulesDialog('example.com', urls);

        expect(activeRoot().textContent).toContain('example.com already has URL blocks');
        expect(activeRoot().textContent).toContain('The full URLs below already have blocking rules.');
        expect(activeRoot().textContent).toContain(urls[0].url);
        expect(activeRoot().textContent).toContain(urls[1].url);
        expect([...activeRoot().querySelectorAll('.entry-status')].map((entry) => entry.textContent))
            .toEqual(['Enabled', 'Disabled']);
        expect(activeRoot().querySelectorAll('.entry')).toHaveLength(2);
        expect(activeRoot().activeElement?.textContent).toBe('Cancel');
        clickButton(label);

        await expect(result).resolves.toBe(expected);
        expect(document.getElementById('tiny-blocker-choice')).toBeNull();
    });

    it('does not offer to disable URL blocks that are already disabled', async () => {
        const result = showCoveredUrlRulesDialog('example.com', [
            {url: 'https://example.com/disabled', enabled: false},
        ]);

        expect(activeRoot().textContent).toContain('already disabled');
        expect([...activeRoot().querySelectorAll('button')].map((button) => button.textContent)).toEqual([
            'Cancel',
            'Keep URL blocks',
            'Delete URL blocks',
        ]);
        clickButton('Cancel');
        await expect(result).resolves.toBeNull();
    });

    function clickButton(label: string): void {
        const button = [...activeRoot().querySelectorAll('button')]
            .find((candidate) => candidate.textContent === label);
        if (!button) throw new Error(`Could not find button: ${label}`);
        button.click();
    }

    function activeRoot(): ShadowRoot {
        const root = shadowRoots.at(-1);
        if (!root) throw new Error('Expected an attached shadow root');
        return root;
    }
});
