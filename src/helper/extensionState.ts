import {BlockedEntry} from './blockedEntry';
import {migrateLegacyScheduleGroups, normalizeRules} from './schedules';

export const STORAGE_KEYS = {
    blocked: 'blocked',
    enabled: 'enabled',
    statistics: 'statistics',
    schedules: 'schedules',
} as const;

export type BlockingStatistics = {total: number; today: number; date: string};
export type ExportedConfiguration = {version: 3; enabled: boolean; blocked: BlockedEntry[]};

export function getLocalDateKey(date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function normalizeStatistics(value: unknown, date = new Date()): BlockingStatistics {
    const currentDate = getLocalDateKey(date);
    const stored = value && typeof value === 'object' ? value as Partial<BlockingStatistics> : {};
    const total = Number.isSafeInteger(stored.total) && Number(stored.total) >= 0 ? Number(stored.total) : 0;
    const storedToday = Number.isSafeInteger(stored.today) && Number(stored.today) >= 0 ? Number(stored.today) : 0;
    return {total, today: stored.date === currentDate ? storedToday : 0, date: currentDate};
}

export function incrementStatistics(value: unknown, date = new Date()): BlockingStatistics {
    const statistics = normalizeStatistics(value, date);
    return {...statistics, total: statistics.total + 1, today: statistics.today + 1};
}

export function parseImportedConfiguration(value: unknown): ExportedConfiguration {
    if (!value || typeof value !== 'object') throw new Error('The selected file does not contain a configuration object.');
    const input = value as {version?: number; enabled?: boolean; blocked?: unknown; schedules?: unknown};
    if (![1, 2, 3].includes(input.version || 0) || !Array.isArray(input.blocked)) {
        throw new Error('Unsupported or invalid Tiny Blocker configuration file.');
    }
    const blocked = input.version === 2
        ? migrateLegacyScheduleGroups(input.blocked, input.schedules).blocked
        : normalizeRules(input.blocked);
    return {version: 3, enabled: input.enabled !== false, blocked};
}
