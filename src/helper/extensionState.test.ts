import {
    incrementStatistics,
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
            version: 1,
            enabled: false,
            blocked: [
                { name: 'example.com', scope: 'domain', enabled: true },
                { name: 'https://example.com/page', scope: 'url', enabled: true },
            ],
        });
    });

    it('rejects unsupported backup formats', () => {
        expect(() => parseImportedConfiguration({ version: 2, blocked: [] })).toThrow(
            'Unsupported or invalid Tiny Blocker configuration file.'
        );
    });
});
