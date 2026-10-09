import {RuleSchedule} from '../helper/blockedEntry';

type ScheduleTemplate = {
    id: string;
    label: string;
    schedule: RuleSchedule;
};

const workdays = [1, 2, 3, 4, 5];
const everyDay = [0, 1, 2, 3, 4, 5, 6];

function period(days: number[], start: string, end: string): RuleSchedule {
    return {daily: days.map((day) => ({day, mode: 'period', start, end}))};
}

export const SCHEDULE_TEMPLATES: readonly ScheduleTemplate[] = [
    {id: 'workdays-9-5', label: 'Workdays · 09:00-17:00', schedule: period(workdays, '09:00', '17:00')},
    {id: 'workdays-8-4', label: 'Workdays · 08:00-16:00', schedule: period(workdays, '08:00', '16:00')},
    {id: 'everyday-mornings', label: 'Every day · 08:00-12:00', schedule: period(everyDay, '08:00', '12:00')},
    {id: 'workday-evenings', label: 'Workday evenings · 18:00-22:00', schedule: period(workdays, '18:00', '22:00')},
    {id: 'weekend-mornings', label: 'Weekend mornings · 08:00-12:00', schedule: period([0, 6], '08:00', '12:00')},
    {id: 'everyday-all-day', label: 'Every day · all day', schedule: {daily: everyDay.map((day) => ({day, mode: 'all-day'}))}},
];
