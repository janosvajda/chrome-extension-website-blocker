import {normalizeBlockedEntry} from '../helper/blockedEntry';
import {normalizeRuleSchedule} from '../helper/schedules';
import type {ScheduledRule} from './scheduleEditor';

interface RuleSyncOptions {
    applyRules: (rules: ScheduledRule[]) => void;
    onExternalRules: (rules: ScheduledRule[]) => void;
}

interface RuleSyncController {
    applySyncedRules: (rules: ScheduledRule[]) => void;
    persistRules: (rules: ScheduledRule[], onPersisted?: () => void) => void;
}

export function createRuleSync({applyRules, onExternalRules}: RuleSyncOptions): RuleSyncController {
    // Keep the last synchronized snapshot so a save changes only locally edited rules.
    let syncedRules: ScheduledRule[] = [];

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local' || !changes.blocked) return;
        const changedRules = normalizeBlockedEntries(changes.blocked.newValue);
        if (rulesEqual(changedRules, syncedRules)) return;
        onExternalRules(changedRules);
    });

    return {
        applySyncedRules(rules: ScheduledRule[]): void {
            syncedRules = cloneRules(rules);
            applyRules(rules);
        },
        persistRules(rules: ScheduledRule[], onPersisted?: () => void): void {
            const desiredRules = cloneRules(rules);
            const previouslySyncedRules = cloneRules(syncedRules);
            chrome.storage.local.get({blocked: []}, (data) => {
                const latestRules = normalizeBlockedEntries(data.blocked);
                const mergedRules = mergeRuleChanges(previouslySyncedRules, desiredRules, latestRules);
                syncedRules = cloneRules(mergedRules);
                applyRules(mergedRules);
                chrome.storage.local.set({blocked: mergedRules}, onPersisted);
            });
        },
    };
}

function mergeRuleChanges(
    previous: ScheduledRule[],
    desired: ScheduledRule[],
    latest: ScheduledRule[],
): ScheduledRule[] {
    const previousByKey = new Map(previous.map((entry) => [ruleKey(entry), entry]));
    const desiredByKey = new Map(desired.map((entry) => [ruleKey(entry), entry]));
    const mergedByKey = new Map(latest.map((entry) => [ruleKey(entry), entry]));

    previousByKey.forEach((previousEntry, key) => {
        const desiredEntry = desiredByKey.get(key);
        if (!desiredEntry) {
            mergedByKey.delete(key);
        } else if (JSON.stringify(desiredEntry) !== JSON.stringify(previousEntry)) {
            mergedByKey.set(key, desiredEntry);
        }
    });
    desiredByKey.forEach((entry, key) => {
        if (!previousByKey.has(key)) mergedByKey.set(key, entry);
    });
    return sortBlockedEntries([...mergedByKey.values()]);
}

function ruleKey(entry: Pick<ScheduledRule, 'name' | 'scope'>): string {
    return `${entry.scope || 'domain'}\n${entry.name}`;
}

function cloneRules(entries: ScheduledRule[]): ScheduledRule[] {
    return entries.map((entry) => ({...entry}));
}

function rulesEqual(first: ScheduledRule[], second: ScheduledRule[]): boolean {
    return JSON.stringify(first) === JSON.stringify(second);
}

export function sortBlockedEntries(entries: ScheduledRule[]): ScheduledRule[] {
    return [...entries].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, {sensitivity: 'base'})
    );
}

export function normalizeBlockedEntries(entries): ScheduledRule[] {
    const normalizedEntries = (entries || []).map((entry) => {
        const normalized = normalizeBlockedEntry(
            entry?.name || '',
            entry?.scope,
            entry?.includeSubdomains === false ? false : undefined,
        );
        if (!normalized) return null;
        const schedule = normalizeRuleSchedule(entry?.schedule);
        return {
            name: normalized.name,
            scope: normalized.scope,
            ...(normalized.includeSubdomains === false ? {includeSubdomains: false} : {}),
            enabled: Boolean(entry?.enabled),
            ...(schedule ? {schedule} : {}),
        } as ScheduledRule;
    }).filter((entry) => entry !== null) as ScheduledRule[];

    return sortBlockedEntries(normalizedEntries);
}
