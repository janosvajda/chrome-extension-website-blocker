import {RuleSchedule} from '../helper/blockedEntry';
import {normalizeRuleSchedule} from '../helper/schedules';

export type ScheduledRule = {
    name: string;
    scope: 'domain' | 'url';
    enabled: boolean;
    schedule?: RuleSchedule;
};

type ScheduleEditorDependencies = {
    getRules: () => ScheduledRule[];
    saveRule: (index: number, rule: ScheduledRule) => void;
    refreshRules: () => void;
};

export function createScheduleEditor(dependencies: ScheduleEditorDependencies) {
    const dialog = document.getElementById('scheduleDialog') as HTMLElement;
    const ruleName = document.getElementById('scheduleRuleName') as HTMLElement;
    const status = document.getElementById('scheduleStatus') as HTMLElement;
    const removeButton = document.getElementById('removeScheduleButton') as HTMLButtonElement;
    let editingIndex: number | null = null;

    function updateRow(row: HTMLElement) {
        const enabled = (row.querySelector('.scheduleDayEnabled') as HTMLInputElement).checked;
        const mode = (row.querySelector('.scheduleDayMode') as HTMLSelectElement).value;
        (row.querySelector('.scheduleDayMode') as HTMLSelectElement).disabled = !enabled;
        (row.querySelector('.scheduleDayTimes') as HTMLElement).hidden = !enabled || mode === 'all-day';
        row.classList.toggle('disabled', !enabled);
    }

    function showStatus(message: string, isError = false) {
        status.textContent = message;
        status.classList.toggle('error', isError);
    }

    function close() {
        dialog.hidden = true;
        editingIndex = null;
    }

    function open(index: number) {
        const entry = dependencies.getRules()[index];
        if (!entry) return;
        editingIndex = index;
        ruleName.textContent = entry.name;
        const schedule = normalizeRuleSchedule(entry.schedule);
        document.querySelectorAll<HTMLElement>('.dailyScheduleRow').forEach((row) => {
            const day = Number(row.dataset.scheduleDay);
            const configured = schedule?.daily.find((item) => item.day === day);
            const enabled = row.querySelector('.scheduleDayEnabled') as HTMLInputElement;
            const mode = row.querySelector('.scheduleDayMode') as HTMLSelectElement;
            enabled.checked = Boolean(configured) || (!schedule && day >= 1 && day <= 5);
            mode.value = configured?.mode || 'period';
            (row.querySelector('.scheduleDayStart') as HTMLInputElement).value = configured?.mode === 'period' ? configured.start : '09:00';
            (row.querySelector('.scheduleDayEnd') as HTMLInputElement).value = configured?.mode === 'period' ? configured.end : '17:00';
            updateRow(row);
        });
        removeButton.hidden = !schedule;
        showStatus('');
        dialog.hidden = false;
    }

    function readSchedule(): RuleSchedule | null {
        return normalizeRuleSchedule({
            daily: [...document.querySelectorAll<HTMLElement>('.dailyScheduleRow')].flatMap((row) => {
                if (!(row.querySelector('.scheduleDayEnabled') as HTMLInputElement).checked) return [];
                const mode = (row.querySelector('.scheduleDayMode') as HTMLSelectElement).value;
                if (mode === 'all-day') return [{day: Number(row.dataset.scheduleDay), mode}];
                return [{
                    day: Number(row.dataset.scheduleDay), mode,
                    start: (row.querySelector('.scheduleDayStart') as HTMLInputElement).value,
                    end: (row.querySelector('.scheduleDayEnd') as HTMLInputElement).value,
                }];
            }),
        });
    }

    document.getElementById('cancelScheduleButton')?.addEventListener('click', close);
    document.getElementById('saveScheduleButton')?.addEventListener('click', () => {
        if (editingIndex === null) return;
        const schedule = readSchedule();
        if (!schedule) {
            showStatus('Select at least one day. Specific-hour periods need different valid start and end times.', true);
            return;
        }
        dependencies.saveRule(editingIndex, {...dependencies.getRules()[editingIndex], schedule});
        close();
        dependencies.refreshRules();
    });
    removeButton.addEventListener('click', () => {
        if (editingIndex === null) return;
        const entry = {...dependencies.getRules()[editingIndex]};
        delete entry.schedule;
        dependencies.saveRule(editingIndex, entry);
        close();
        dependencies.refreshRules();
    });
    document.querySelectorAll<HTMLElement>('.dailyScheduleRow').forEach((row) => {
        row.querySelector('.scheduleDayEnabled')?.addEventListener('change', () => updateRow(row));
        row.querySelector('.scheduleDayMode')?.addEventListener('change', () => updateRow(row));
    });

    return {open, close};
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
