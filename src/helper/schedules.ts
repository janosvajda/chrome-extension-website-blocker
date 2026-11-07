import {BlockedEntry, RuleSchedule, ScheduledDay, normalizeBlockedEntry} from './blockedEntry';

type LegacyRuleSchedule = {days: number[]; start: string; end: string};
type LegacyScheduleGroup = LegacyRuleSchedule & {
    id: string;
    rules: BlockedEntry[];
    enabled: boolean;
};

type UnknownRecord = Record<string, unknown>;

const FIRST_DAY = 0;
const LAST_DAY = 6;

export function normalizeRuleSchedule(value: unknown): RuleSchedule | null {
    if (!isRecord(value)) return null;
    if (Array.isArray(value.daily)) return normalizeDailySchedule(value.daily);

    const legacy = normalizeLegacyRuleSchedule(value);
    return legacy ? convertLegacySchedule(legacy) : null;
}

export function isScheduleActive(schedule: RuleSchedule | LegacyRuleSchedule | undefined, date = new Date()): boolean {
    if (!schedule) return true;
    const normalized = normalizeRuleSchedule(schedule);
    if (!normalized) return false;

    const day = date.getDay();
    const minute = date.getHours() * 60 + date.getMinutes();
    return normalized.daily.some((entry) => isScheduledDayActive(entry, day, minute));
}

export function findNextAvailableTime(
    schedules: Array<RuleSchedule | undefined>,
    date = new Date(),
): Date | null {
    if (schedules.length === 0 || schedules.some((schedule) => !schedule)) return null;

    const normalizedSchedules = schedules
        .map((schedule) => normalizeRuleSchedule(schedule))
        .filter((schedule): schedule is RuleSchedule => Boolean(schedule));
    if (!normalizedSchedules.some((schedule) => isScheduleActive(schedule, date))) return null;

    const currentTime = date.getTime();
    const endTimes = new Set<number>();
    for (let dayOffset = -1; dayOffset <= 7; dayOffset += 1) {
        const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate() + dayOffset);
        for (const schedule of normalizedSchedules) {
            for (const entry of schedule.daily) {
                if (entry.day !== dayStart.getDay()) continue;
                const end = scheduleEndForDay(entry, dayStart);
                if (end.getTime() > currentTime) endTimes.add(end.getTime());
            }
        }
    }

    for (const endTime of [...endTimes].sort((first, second) => first - second)) {
        const candidate = new Date(endTime);
        if (!normalizedSchedules.some((schedule) => isScheduleActive(schedule, candidate))) {
            return candidate;
        }
    }
    return null;
}

export function migrateLegacyScheduleGroups(
    blockedValue: unknown,
    schedulesValue: unknown,
): {blocked: BlockedEntry[]; migrated: boolean} {
    const blocked = normalizeRules(blockedValue);
    if (!Array.isArray(schedulesValue) || schedulesValue.length === 0) return {blocked, migrated: false};
    const byKey = new Map(blocked.map((entry) => [ruleKey(entry), entry]));
    for (const value of schedulesValue) {
        const group = normalizeLegacyGroup(value);
        if (!group?.enabled) continue;
        for (const rule of group.rules) {
            const key = ruleKey(rule);
            if (!byKey.has(key)) byKey.set(key, {...rule, schedule: groupSchedule(group)});
        }
    }
    return {blocked: [...byKey.values()], migrated: true};
}

export function normalizeRules(value: unknown): BlockedEntry[] {
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    const rules: BlockedEntry[] = [];
    for (const entry of value) {
        if (!isRecord(entry) || typeof entry.name !== 'string') continue;
        const scope = entry.scope === 'domain' || entry.scope === 'url' ? entry.scope : undefined;
        const normalized = normalizeBlockedEntry(
            entry.name,
            scope,
            entry.includeSubdomains === false ? false : undefined,
        );
        if (!normalized) continue;
        const key = ruleKey(normalized);
        if (seen.has(key)) continue;
        seen.add(key);
        const schedule = normalizeRuleSchedule(entry.schedule);
        rules.push({...normalized, enabled: entry.enabled !== false, ...(schedule ? {schedule} : {})});
    }
    return rules;
}

export function formatSchedule(schedule?: RuleSchedule): string {
    if (!schedule) return 'Always';
    const normalized = normalizeRuleSchedule(schedule);
    if (!normalized) return 'Always';
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const groups = new Map<string, number[]>();
    normalized.daily.forEach((entry) => {
        const label = entry.mode === 'all-day' ? 'all day' : `${entry.start}-${entry.end}`;
        groups.set(label, [...(groups.get(label) || []), entry.day]);
    });
    return [...groups.entries()].map(([label, days]) =>
        `${days.map((day) => dayNames[day]).join(', ')} | ${label}`
    ).join('; ');
}

function normalizeLegacyGroup(value: unknown): LegacyScheduleGroup | null {
    if (!isRecord(value) || typeof value.id !== 'string') return null;
    const schedule = normalizeLegacyRuleSchedule(value);
    if (!schedule) return null;
    return {...schedule, id: value.id, enabled: value.enabled !== false, rules: normalizeRules(value.rules)};
}

function normalizeLegacyRuleSchedule(input: UnknownRecord): LegacyRuleSchedule | null {
    const days = Array.isArray(input.days)
        ? uniqueDays(input.days)
        : [];
    if (!isTime(input.start) || !isTime(input.end) || input.start === input.end || days.length === 0) return null;
    return {days, start: input.start, end: input.end};
}

function groupSchedule(group: LegacyScheduleGroup): RuleSchedule {
    return convertLegacySchedule(group);
}

function normalizeScheduledDay(value: unknown): ScheduledDay | null {
    if (!isRecord(value) || !isDay(value.day)) return null;
    if (value.mode === 'all-day') return {day: value.day, mode: 'all-day'};
    if (value.mode !== 'period' || !isTime(value.start) || !isTime(value.end) || value.start === value.end) return null;
    return {day: value.day, mode: 'period', start: value.start, end: value.end};
}

function normalizeDailySchedule(values: unknown[]): RuleSchedule | null {
    const byDay = new Map<number, ScheduledDay>();
    for (const value of values) {
        const scheduledDay = normalizeScheduledDay(value);
        if (scheduledDay && !byDay.has(scheduledDay.day)) byDay.set(scheduledDay.day, scheduledDay);
    }
    const daily = [...byDay.values()].sort((first, second) => first.day - second.day);
    return daily.length ? {daily} : null;
}

function convertLegacySchedule(schedule: LegacyRuleSchedule): RuleSchedule {
    const daily: ScheduledDay[] = schedule.days.map((day) => ({
        day,
        mode: 'period',
        start: schedule.start,
        end: schedule.end,
    }));
    return {daily};
}

function isScheduledDayActive(entry: ScheduledDay, currentDay: number, currentMinute: number): boolean {
    if (entry.mode === 'all-day') return entry.day === currentDay;

    const start = toMinute(entry.start);
    const end = toMinute(entry.end);
    if (start < end) return entry.day === currentDay && currentMinute >= start && currentMinute < end;

    const previousDay = (currentDay + LAST_DAY) % (LAST_DAY + 1);
    return (entry.day === currentDay && currentMinute >= start)
        || (entry.day === previousDay && currentMinute < end);
}

function scheduleEndForDay(entry: ScheduledDay, dayStart: Date): Date {
    if (entry.mode === 'all-day') {
        return new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate() + 1);
    }
    const [hour, minute] = entry.end.split(':').map(Number);
    const overnight = toMinute(entry.start) > toMinute(entry.end) ? 1 : 0;
    return new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate() + overnight, hour, minute);
}

function uniqueDays(values: unknown[]): number[] {
    return [...new Set(values.filter(isDay))].sort((first, second) => first - second);
}

function isDay(value: unknown): value is number {
    return Number.isInteger(value) && Number(value) >= FIRST_DAY && Number(value) <= LAST_DAY;
}

function isRecord(value: unknown): value is UnknownRecord {
    return typeof value === 'object' && value !== null;
}

function ruleKey(rule: Pick<BlockedEntry, 'name' | 'scope'>): string {
    return `${rule.scope || 'domain'}:${rule.name}`;
}

function isTime(value: unknown): value is string {
    return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function toMinute(value: string): number {
    const [hour, minute] = value.split(':').map(Number);
    return hour * 60 + minute;
}
