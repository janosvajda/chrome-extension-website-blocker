import {formatSchedule} from './scheduleEditor';

describe('schedule presentation', () => {
    it('uses Always for missing or invalid schedules', () => {
        expect(formatSchedule()).toBe('Always');
        expect(formatSchedule({daily: []})).toBe('Always');
    });

    it('groups days that share the same blocking period', () => {
        expect(formatSchedule({daily: [
            {day: 1, mode: 'all-day'},
            {day: 2, mode: 'period', start: '09:00', end: '17:00'},
            {day: 3, mode: 'period', start: '09:00', end: '17:00'},
        ]})).toBe('Mon | all day; Tue, Wed | 09:00-17:00');
    });
});
