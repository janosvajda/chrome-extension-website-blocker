/** @jest-environment jsdom */

jest.mock('./helper/blockMessages', () => ({
    BlockedMessageType: {
        Joke: 'joke',
        ScientificQuotes: 'scientific_quotes',
    },
    getRandomBlockedMessage: jest.fn(() => ({message: 'Blocked message', randomItem: 'Helpful joke', type: 'joke'})),
}));

describe('warning page UI', () => {
    beforeEach(() => {
        jest.resetModules();
        document.body.innerHTML = '<div id="message"></div><div id="blockedReason" hidden></div><div id="blockedValue" hidden></div><div id="randomSection" hidden><div id="randomItemLabel"></div><div id="randomItem"></div></div>';
        window.history.replaceState({}, '', '/warning.html?reason=url&blocked=https%3A%2F%2Fexample.com%2Fpath');
    });

    it('renders the message and URL blocking reason', () => {
        jest.isolateModules(() => require('./content'));
        expect((document.getElementById('message') as HTMLElement).innerText).toBe('Blocked message');
        expect(document.getElementById('blockedReason')?.textContent).toBe('Blocked by URL rule');
        expect(document.getElementById('blockedValue')?.textContent).toBe('Blocked: https://example.com/path');
        expect((document.getElementById('randomItemLabel') as HTMLElement).innerText).toBe('A joke for you');
        expect(document.getElementById('randomSection')?.hidden).toBe(false);
        expect(document.getElementById('randomSection')?.classList.contains('quote')).toBe(false);
    });

    it('renders a domain reason without an optional random item', () => {
        const messages = require('./helper/blockMessages');
        messages.getRandomBlockedMessage.mockReturnValueOnce({message: 'Blocked', randomItem: '', type: 'scientific_quotes'});
        window.history.replaceState({}, '', '/warning.html?reason=domain');
        jest.isolateModules(() => require('./content'));
        expect(document.getElementById('blockedReason')?.textContent).toBe('Blocked by domain rule');
        expect(document.getElementById('blockedValue')?.hidden).toBe(true);
        expect(document.getElementById('randomSection')?.hidden).toBe(true);
    });

    it('leaves reason details hidden for unknown input', () => {
        window.history.replaceState({}, '', '/warning.html?reason=other');
        jest.isolateModules(() => require('./content'));
        expect(document.getElementById('blockedReason')?.hidden).toBe(true);
    });

    it('labels a scientific quote after the blocking details', () => {
        const messages = require('./helper/blockMessages');
        messages.getRandomBlockedMessage.mockReturnValueOnce({
            message: 'This site is blocked.',
            randomItem: 'A scientific quote',
            type: 'scientific_quotes',
        });
        jest.isolateModules(() => require('./content'));
        expect((document.getElementById('randomItemLabel') as HTMLElement).innerText).toBe('A quote for you');
        expect((document.getElementById('randomItem') as HTMLElement).innerText).toBe('A scientific quote');
        expect(document.getElementById('randomSection')?.classList.contains('quote')).toBe(true);
    });

    it('renders safely when optional details and random-item wrappers are absent', () => {
        document.body.innerHTML = '<div id="message"></div><div id="randomItem"></div>';
        window.history.replaceState({}, '', '/warning.html?reason=url&blocked=example.com');
        jest.isolateModules(() => require('./content'));
        expect((document.getElementById('message') as HTMLElement).innerText).toBe('Blocked message');
        expect((document.getElementById('randomItem') as HTMLElement).innerText).toBe('Helpful joke');
    });
});
