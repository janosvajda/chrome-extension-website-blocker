import {BlockedEntry, RuleSchedule, normalizeBlockedEntry} from './blockedEntry';

type LegacyScheduleGroup = RuleSchedule & {
    id: string;
    rules: BlockedEntry[];
    enabled: boolean;
};

export function normalizeRuleSchedule(value: unknown): RuleSchedule | null {
    if (!value || typeof value !== 'object') return null;
    const input = value as Partial<RuleSchedule>;
    const days = Array.isArray(input.days)
        ? [...new Set(input.days.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort()
        : [];
    if (!isTime(input.start) || !isTime(input.end) || input.start === input.end || days.length === 0) return null;
    return {days, start: input.start, end: input.end};
}

export function isScheduleActive(schedule: RuleSchedule | undefined, date = new Date()): boolean {
    if (!schedule) return true;
    const minute = date.getHours() * 60 + date.getMinutes();
    const start = toMinute(schedule.start);
    const end = toMinute(schedule.end);
    if (start < end) return schedule.days.includes(date.getDay()) && minute >= start && minute < end;
    if (minute >= start) return schedule.days.includes(date.getDay());
    return schedule.days.includes((date.getDay() + 6) % 7) && minute < end;
}

export function migrateLegacyScheduleGroups(
    blockedValue: unknown,
    schedulesValue: unknown,
): {blocked: BlockedEntry[]; migrated: boolean} {
    const blocked = normalizeRules(blockedValue);
    if (!Array.isArray(schedulesValue) || schedulesValue.length === 0) return {blocked, migrated: false};
    const byKey = new Map(blocked.map((entry) => [ruleKey(entry), entry]));
    schedulesValue.forEach((value) => {
        const group = normalizeLegacyGroup(value);
        if (!group?.enabled) return;
        group.rules.forEach((rule) => {
            const key = ruleKey(rule);
            if (!byKey.has(key)) byKey.set(key, {...rule, schedule: groupSchedule(group)});
        });
    });
    return {blocked: [...byKey.values()], migrated: true};
}

export function normalizeRules(value: unknown): BlockedEntry[] {
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    const rules: BlockedEntry[] = [];
    value.forEach((entry) => {
        if (!entry || typeof entry !== 'object') return;
        const input = entry as BlockedEntry;
        const normalized = normalizeBlockedEntry(input.name || '', input.scope);
        if (!normalized) return;
        const key = ruleKey(normalized);
        if (seen.has(key)) return;
        seen.add(key);
        const schedule = normalizeRuleSchedule(input.schedule);
        rules.push({...normalized, enabled: input.enabled !== false, ...(schedule ? {schedule} : {})});
    });
    return rules;
}

function normalizeLegacyGroup(value: unknown): LegacyScheduleGroup | null {
    if (!value || typeof value !== 'object') return null;
    const input = value as Partial<LegacyScheduleGroup>;
    const schedule = normalizeRuleSchedule(input);
    if (!schedule || typeof input.id !== 'string') return null;
    return {...schedule, id: input.id, enabled: input.enabled !== false, rules: normalizeRules(input.rules)};
}

function groupSchedule(group: LegacyScheduleGroup): RuleSchedule {
    return {days: group.days, start: group.start, end: group.end};
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
