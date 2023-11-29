import { blockedMessages, BlockedMessageType } from './blockMessages';

describe('blockedMessages', () => {
    it('should have the correct number of messages', () => {
        expect(blockedMessages).toHaveLength(5);
    });

    it('should have unique messages', () => {
        const uniqueMessages = new Set(blockedMessages.map((message) => message.message));
        expect(uniqueMessages.size).toEqual(blockedMessages.length);
    });

    it('should not contain empty messages', () => {
        blockedMessages.forEach((message) => {
            expect(message.message.trim()).not.toEqual('');
        });
    });

    it('should not contain any undefined or null values', () => {
        blockedMessages.forEach((message) => {
            expect(message).not.toBeNull();
            expect(message).not.toBeUndefined();
        });
    });

    it('should not contain consecutive spaces', () => {
        blockedMessages.forEach((message) => {
            expect(message.message).not.toMatch(/\s{2,}/);
        });
    });

    it('should contain a variety of characters', () => {
        blockedMessages.forEach((message) => {
            expect(message.message).toMatch(/[a-zA-Z0-9!@#$%^&*()_+{}\[\]:;<>,.?~\\/-]/);
        });
    });

    it('should have correct structure', () => {
        blockedMessages.forEach((message, index) => {
            if (index === 0) {
                expect(message.message).toEqual("Oops! The site you wanted to open is blocked.");
            } else if (index === 1) {
                expect(message.message).toMatch(/Sorry, access to the requested site is restricted, but I have a quote for you:/);
            } else if (index === 2) {
                expect(message.message).toMatch(/This site is blocked, but here's a joke instead:/);
            } else if (index === 3) {
                expect(message.message).toMatch(/Blocked! But don't worry, I've got a joke for you./);
            } else if (index === 4) {
                expect(message.message).toMatch(/The website is under construction, but our humor isn't:/);
            }
        });
    });
});
