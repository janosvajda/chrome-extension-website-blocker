import {formatAvailableAgain} from './availability';

describe('formatAvailableAgain', () => {
    it('formats availability later today using the selected clock format', () => {
        const now = new Date(2026, 7, 24, 10);
        const availableAt = new Date(2026, 7, 24, 17);

        expect(formatAvailableAgain(availableAt.getTime(), now, 'en-GB'))
            .toBe('Available again today at 17:00');
        expect(formatAvailableAgain(availableAt.getTime(), now, 'en-US'))
            .toBe('Available again today at 05:00 PM');
    });

    it('labels availability on the next local date as tomorrow', () => {
        expect(formatAvailableAgain(
            new Date(2026, 7, 25, 9).getTime(),
            new Date(2026, 7, 24, 23),
            'en-GB',
        )).toBe('Available again tomorrow at 09:00');
    });

    it('uses the weekday for a later date', () => {
        expect(formatAvailableAgain(
            new Date(2026, 7, 31, 9).getTime(),
            new Date(2026, 7, 26, 12),
            'en-GB',
        )).toBe('Available again on Monday at 09:00');
    });

    it('rejects missing and invalid timestamps', () => {
        const now = new Date(2026, 7, 24, 10);

        expect(formatAvailableAgain(null, now)).toBeNull();
        expect(formatAvailableAgain(Number.NaN, now)).toBeNull();
        expect(formatAvailableAgain(1e20, now)).toBeNull();
        expect(formatAvailableAgain(new Date(2026, 7, 24, 9).getTime(), now)).toBeNull();
        expect(formatAvailableAgain(now.getTime(), now)).toBeNull();
    });
});
