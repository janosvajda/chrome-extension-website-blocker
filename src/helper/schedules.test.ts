import {isScheduleActive, migrateLegacyScheduleGroups, normalizeRuleSchedule, normalizeRules} from './schedules';

const workHours = {days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00'};

describe('per-rule schedules', () => {
    it('normalizes valid schedules and rejects invalid values', () => {
        expect(normalizeRuleSchedule(workHours)).toEqual(workHours);
        expect(normalizeRuleSchedule(null)).toBeNull();
        expect(normalizeRuleSchedule({...workHours, days: []})).toBeNull();
        expect(normalizeRuleSchedule({...workHours, days: 'weekdays'})).toBeNull();
        expect(normalizeRuleSchedule({...workHours, days: [1, 1, 9]})).toEqual({...workHours, days: [1]});
        expect(normalizeRuleSchedule({...workHours, start: '25:00'})).toBeNull();
        expect(normalizeRuleSchedule({...workHours, end: '09:00'})).toBeNull();
    });

    it('is active only inside selected local days and times', () => {
        expect(isScheduleActive(undefined, new Date(2026, 7, 24, 1))).toBe(true);
        expect(isScheduleActive(workHours, new Date(2026, 7, 24, 9))).toBe(true);
        expect(isScheduleActive(workHours, new Date(2026, 7, 24, 17))).toBe(false);
        expect(isScheduleActive(workHours, new Date(2026, 7, 23, 12))).toBe(false);
    });

    it('supports overnight schedules', () => {
        const overnight = {days: [5], start: '22:00', end: '02:00'};
        expect(isScheduleActive(overnight, new Date(2026, 7, 21, 23))).toBe(true);
        expect(isScheduleActive(overnight, new Date(2026, 7, 22, 1))).toBe(true);
        expect(isScheduleActive(overnight, new Date(2026, 7, 22, 3))).toBe(false);
    });

    it('normalizes, deduplicates, and validates scheduled rules', () => {
        expect(normalizeRules('invalid')).toEqual([]);
        expect(normalizeRules([{name: 'default-scope.example', enabled: true}])).toEqual([
            {name: 'default-scope.example', scope: 'domain', enabled: true},
        ]);
        expect(normalizeRules([
            null, {},
            {name: 'example.com', scope: 'domain', enabled: true, schedule: workHours},
            {name: 'https://example.com', scope: 'domain', enabled: false},
            {name: 'bad value', scope: 'domain'},
        ])).toEqual([{name: 'example.com', scope: 'domain', enabled: true, schedule: workHours}]);
    });

    it('migrates enabled legacy groups into scheduled rules', () => {
        const migrated = migrateLegacyScheduleGroups(
            [{name: 'always.example', scope: 'domain', enabled: true}],
            [{
                id: 'work', name: 'Work', enabled: true, ...workHours,
                rules: [
                    {name: 'social.example', scope: 'domain', enabled: true},
                    {name: 'always.example', scope: 'domain', enabled: true},
                ],
            }],
        );
        expect(migrated.migrated).toBe(true);
        expect(migrated.blocked).toEqual([
            {name: 'always.example', scope: 'domain', enabled: true},
            {name: 'social.example', scope: 'domain', enabled: true, schedule: workHours},
        ]);
    });

    it('ignores malformed and paused legacy groups', () => {
        expect(migrateLegacyScheduleGroups([], null)).toEqual({blocked: [], migrated: false});
        const result = migrateLegacyScheduleGroups([], [
            null,
            {...workHours, enabled: true, rules: []},
            {id: 'paused', ...workHours, enabled: false, rules: [{name: 'paused.example', enabled: true}]},
        ]);
        expect(result).toEqual({blocked: [], migrated: true});
    });
});
