/** @jest-environment jsdom */

import {showBlockScopeDialog, showScheduledDomainOverrideDialog} from './dialogs';

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
