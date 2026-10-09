import {RuleSchedule} from '../helper/blockedEntry';
import {normalizeRuleSchedule} from '../helper/schedules';
import {SCHEDULE_TEMPLATES} from './scheduleTemplates';

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
    const dialogBody = document.querySelector('.scheduleDialogBody') as HTMLElement;
    const ruleName = document.getElementById('scheduleRuleName') as HTMLElement;
    const ruleNameText = document.getElementById('scheduleRuleNameText') as HTMLElement;
    const status = document.getElementById('scheduleStatus') as HTMLElement;
    const removeButton = document.getElementById('removeScheduleButton') as HTMLButtonElement;
    const removeActions = document.getElementById('scheduleRemoveActions') as HTMLElement;
    const copyButton = document.getElementById('copyScheduleButton') as HTMLButtonElement;
    const copyDialog = document.getElementById('scheduleCopyDialog') as HTMLElement;
    const copySource = document.getElementById('scheduleCopySource') as HTMLSelectElement;
    const copyPreview = document.getElementById('scheduleCopyPreview') as HTMLElement;
    const cancelCopyButton = document.getElementById('cancelCopyScheduleButton') as HTMLButtonElement;
    const useCopyButton = document.getElementById('useCopiedScheduleButton') as HTMLButtonElement;
    const templateButton = document.getElementById('scheduleTemplatesButton') as HTMLButtonElement;
    const templateDialog = document.getElementById('scheduleTemplateDialog') as HTMLElement;
    const templateSource = document.getElementById('scheduleTemplateSource') as HTMLSelectElement;
    const templatePreview = document.getElementById('scheduleTemplatePreview') as HTMLElement;
    const cancelTemplateButton = document.getElementById('cancelScheduleTemplateButton') as HTMLButtonElement;
    const useTemplateButton = document.getElementById('useScheduleTemplateButton') as HTMLButtonElement;
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
        if (isError) status.scrollIntoView?.({block: 'nearest'});
    }

    function setEditorSuspended(suspended: boolean) {
        dialog.toggleAttribute('inert', suspended);
        if (suspended) dialog.setAttribute('aria-hidden', 'true');
        else dialog.removeAttribute('aria-hidden');
    }

    function openPicker(picker: HTMLElement, selector: HTMLSelectElement) {
        picker.hidden = false;
        selector.focus();
        setEditorSuspended(true);
    }

    function close() {
        dialog.hidden = true;
        copyDialog.hidden = true;
        templateDialog.hidden = true;
        setEditorSuspended(false);
        editingIndex = null;
    }

    function open(index: number) {
        const entry = dependencies.getRules()[index];
        if (!entry) return;
        editingIndex = index;
        ruleNameText.textContent = entry.name;
        ruleName.title = entry.name;
        const schedule = normalizeRuleSchedule(entry.schedule);
        populateSchedule(schedule);
        removeButton.hidden = !schedule;
        removeActions.hidden = !schedule;
        copyButton.hidden = getCopySources().length === 0;
        copyDialog.hidden = true;
        templateDialog.hidden = true;
        setEditorSuspended(false);
        showStatus('');
        dialog.hidden = false;
        dialogBody.scrollTop = 0;
    }

    function populateSchedule(schedule: RuleSchedule | null) {
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
    }

    function ruleKey(rule: ScheduledRule): string {
        return JSON.stringify([rule.scope, rule.name]);
    }

    function getCopySources(): ScheduledRule[] {
        return dependencies.getRules().filter((rule, index) =>
            index !== editingIndex && Boolean(normalizeRuleSchedule(rule.schedule))
        );
    }

    function selectedCopySource(): ScheduledRule | undefined {
        return getCopySources().find((rule) => ruleKey(rule) === copySource.value);
    }

    function closeCopyDialog() {
        copyDialog.hidden = true;
        setEditorSuspended(false);
        if (editingIndex !== null) {
            copyButton.focus();
        }
    }

    copyButton.addEventListener('click', () => {
        if (editingIndex === null) return;
        const sources = getCopySources();
        if (!sources.length) return;
        copySource.replaceChildren(new Option('Choose a rule…', ''));
        sources.forEach((rule) => copySource.add(new Option(rule.name, ruleKey(rule))));
        copyPreview.textContent = '';
        copyPreview.hidden = true;
        useCopyButton.disabled = true;
        openPicker(copyDialog, copySource);
    });

    copySource.addEventListener('change', () => {
        const schedule = normalizeRuleSchedule(selectedCopySource()?.schedule);
        copyPreview.textContent = schedule ? formatSchedule(schedule) : '';
        copyPreview.hidden = !schedule;
        useCopyButton.disabled = !schedule;
    });

    cancelCopyButton.addEventListener('click', closeCopyDialog);
    useCopyButton.addEventListener('click', () => {
        if (editingIndex === null) return;
        const source = selectedCopySource();
        const schedule = normalizeRuleSchedule(source?.schedule);
        if (!schedule) return;
        populateSchedule(schedule);
        showStatus(`Copied from ${source.name}. Review the blocking times, then save to apply them.`);
        closeCopyDialog();
    });

    function selectedTemplate() {
        return SCHEDULE_TEMPLATES.find((template) => template.id === templateSource.value);
    }

    function closeTemplateDialog() {
        templateDialog.hidden = true;
        setEditorSuspended(false);
        if (editingIndex !== null) {
            templateButton.focus();
        }
    }

    templateButton.addEventListener('click', () => {
        if (editingIndex === null) return;
        templateSource.replaceChildren(new Option('Choose a template…', ''));
        SCHEDULE_TEMPLATES.forEach((template) => templateSource.add(new Option(template.label, template.id)));
        templatePreview.textContent = '';
        templatePreview.hidden = true;
        useTemplateButton.disabled = true;
        openPicker(templateDialog, templateSource);
    });

    templateSource.addEventListener('change', () => {
        const template = selectedTemplate();
        templatePreview.textContent = template ? formatSchedule(template.schedule) : '';
        templatePreview.hidden = !template;
        useTemplateButton.disabled = !template;
    });

    cancelTemplateButton.addEventListener('click', closeTemplateDialog);
    useTemplateButton.addEventListener('click', () => {
        if (editingIndex === null) return;
        const template = selectedTemplate();
        if (!template) return;
        populateSchedule(template.schedule);
        showStatus(`Template applied: ${template.label}. Review the blocking times, then save to apply them.`);
        closeTemplateDialog();
    });

    function trapPickerFocus(picker: HTMLElement, selector: HTMLSelectElement, cancel: HTMLButtonElement, use: HTMLButtonElement) {
        picker.addEventListener('keydown', (event) => {
            if (event.key !== 'Tab') return;
            const lastButton = use.disabled ? cancel : use;
            if (event.shiftKey && document.activeElement === selector) {
                event.preventDefault();
                lastButton.focus();
            } else if (!event.shiftKey && document.activeElement === lastButton) {
                event.preventDefault();
                selector.focus();
            }
        });
    }

    trapPickerFocus(copyDialog, copySource, cancelCopyButton, useCopyButton);
    trapPickerFocus(templateDialog, templateSource, cancelTemplateButton, useTemplateButton);

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
