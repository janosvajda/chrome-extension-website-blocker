import { blockedMessages } from './blockMessages';

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
            expect(message.message).toMatch(/[a-zA-Z0-9!@#$%^&*()_+{}:;<>,.?~\\/-]/);
        });
    });

    it('should have correct structure', () => {
        blockedMessages.forEach((message, index) => {
            if (index === 0) {
                expect(message.message).toEqual('Oops! The site you wanted to open is blocked.');
            } else if (index === 1) {
                expect(message.message).toEqual('Access to this site is blocked.');
            } else if (index === 2) {
                expect(message.message).toEqual('This site is blocked.');
            } else if (index === 3) {
                expect(message.message).toEqual('This distraction has been blocked.');
            } else if (index === 4) {
                expect(message.message).toEqual('This site is unavailable because it matches a blocking rule.');
            }
        });
    });
});
