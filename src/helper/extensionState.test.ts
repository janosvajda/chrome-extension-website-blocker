import {
    getLocalDateKey,
    getRemainingPauseMinutes,
    incrementStatistics,
    incrementDailyPauseUsage,
    normalizeDailyPauseUsage,
    normalizePausedUntil,
    normalizeStatistics,
    parseImportedConfiguration,
} from './extensionState';

describe('extensionState', () => {
    const today = new Date(2026, 7, 21);

    it('increments daily and lifetime block counts', () => {
        expect(incrementStatistics({ total: 4, today: 2, date: '2026-08-21' }, today)).toEqual({
            total: 5,
            today: 3,
            date: '2026-08-21',
        });
    });

    it('resets the daily count when the local date changes', () => {
        expect(normalizeStatistics({ total: 8, today: 5, date: '2026-08-20' }, today)).toEqual({
            total: 8,
            today: 0,
            date: '2026-08-21',
        });
    });

    it('uses the current local date and sanitizes invalid counters', () => {
        expect(getLocalDateKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(normalizeStatistics({total: -1, today: 1.5, date: 'invalid'}, today)).toEqual({
            total: 0,
            today: 0,
            date: '2026-08-21',
        });
    });

    it('normalizes temporary pauses and calculates remaining minutes', () => {
        const now = new Date(2026, 7, 25, 10, 0).getTime();
        expect(normalizePausedUntil(now + 90_000, now)).toBe(now + 90_000);
        expect(getRemainingPauseMinutes(now + 90_000, now)).toBe(2);
        expect(getRemainingPauseMinutes(now + 30_000, now)).toBe(1);
        expect(getRemainingPauseMinutes(now, now)).toBe(0);
        expect(normalizePausedUntil(now, now)).toBe(0);
        expect(normalizePausedUntil('later', now)).toBe(0);
        expect(normalizePausedUntil(Number.MAX_SAFE_INTEGER + 1, now)).toBe(0);
    });

    it('counts temporary pauses per local day and resets invalid or old counts', () => {
        expect(incrementDailyPauseUsage({count: 3, date: '2026-08-21'}, today)).toEqual({
            count: 4,
            date: '2026-08-21',
        });
        expect(normalizeDailyPauseUsage({count: 8, date: '2026-08-20'}, today)).toEqual({
            count: 0,
            date: '2026-08-21',
        });
        expect(normalizeDailyPauseUsage({count: -1, date: '2026-08-21'}, today).count).toBe(0);
    });

    it('validates, normalizes, and deduplicates imported rules', () => {
        expect(parseImportedConfiguration({
            version: 1,
            enabled: false,
            blocked: [
                { name: 'https://www.example.com', scope: 'domain', enabled: true },
                { name: 'example.com', scope: 'domain', enabled: false },
                { name: 'https://example.com/page/', scope: 'url', enabled: true },
            ],
        })).toEqual({
            version: 3,
            enabled: false,
            blocked: [
                { name: 'example.com', scope: 'domain', enabled: true },
                { name: 'https://example.com/page', scope: 'url', enabled: true },
            ],
        });
    });

    it('migrates version 2 scheduled groups into per-rule schedules', () => {
        expect(parseImportedConfiguration({
            version: 2,
            enabled: true,
            schedules: [{
                id: 'work', name: 'Work hours', days: [1, 2, 3, 4, 5],
                start: '09:00', end: '17:00', enabled: true,
                rules: [{name: 'example.com', scope: 'domain', enabled: true}],
            }],
            blocked: [],
        })).toEqual({
            version: 3,
            enabled: true,
            blocked: [{
                name: 'example.com', scope: 'domain', enabled: true,
                schedule: {days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00'},
            }],
        });
    });

    it('rejects unsupported backup formats', () => {
        expect(() => parseImportedConfiguration(null)).toThrow(
            'The selected file does not contain a configuration object.'
        );
        expect(() => parseImportedConfiguration({ version: 4, blocked: [] })).toThrow(
            'Unsupported or invalid Tiny Blocker configuration file.'
        );
        expect(() => parseImportedConfiguration({blocked: []})).toThrow(
            'Unsupported or invalid Tiny Blocker configuration file.'
        );
    });

    it('drops invalid and duplicate imported rules and defaults enabled state', () => {
        expect(parseImportedConfiguration({
            version: 3,
            blocked: [
                null,
                {name: 'bad value', scope: 'domain'},
                {name: 'example.com', scope: 'domain', enabled: true},
                {name: 'https://example.com', scope: 'domain', enabled: false},
            ],
        })).toEqual(expect.objectContaining({
            enabled: true,
            blocked: [{name: 'example.com', scope: 'domain', enabled: true}],
        }));
    });
});
