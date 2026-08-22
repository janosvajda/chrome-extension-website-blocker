import {RuleSchedule, blockedEntriesOverlap, normalizeBlockedEntry} from './helper/blockedEntry';
import {parseImportedConfiguration, STORAGE_KEYS} from './helper/extensionState';
import {migrateLegacyScheduleGroups, normalizeRuleSchedule} from './helper/schedules';

const websiteList = document.getElementById('websiteList');
const addButton = document.getElementById('addButton');
const newWebsiteInput = document.getElementById('newWebsite') as HTMLInputElement;
const addWebsiteStatus = document.getElementById('addWebsiteStatus');
const refreshButton = document.getElementById('refreshButton');
const prevPageButton = document.getElementById('prevPageButton') as HTMLButtonElement;
const nextPageButton = document.getElementById('nextPageButton') as HTMLButtonElement;
const pageNumbers = document.getElementById('pageNumbers');
const pageInfo = document.getElementById('pageInfo');
const exportButton = document.getElementById('exportButton');
const importButton = document.getElementById('importButton');
const importFileInput = document.getElementById('importFile') as HTMLInputElement;
const transferStatus = document.getElementById('transferStatus');
const scheduleDialog = document.getElementById('scheduleDialog') as HTMLElement;
const scheduleRuleName = document.getElementById('scheduleRuleName');
const scheduleStart = document.getElementById('scheduleStart') as HTMLInputElement;
const scheduleEnd = document.getElementById('scheduleEnd') as HTMLInputElement;
const scheduleStatus = document.getElementById('scheduleStatus');
const removeScheduleButton = document.getElementById('removeScheduleButton') as HTMLButtonElement;
type BlockedEntry = {
    name: string;
    scope: 'domain' | 'url';
    enabled: boolean;
    schedule?: RuleSchedule;
};

// Pagination defaults keep the list readable on smaller screens.
const pageSize = 5;
let currentPage = 1;
let blockedEntries: BlockedEntry[] = [];
let editingScheduleIndex: number | null = null;

// Render a single entry row and wire its UI events.
function createWebsiteItem(website, enabled, scope, schedule?: RuleSchedule) {
    const normalizedWebsite = normalizeBlockedEntry(website, scope);
    if (!normalizedWebsite) {
        return null;
    }
    const websiteItem = document.createElement('div');
    websiteItem.className = 'websiteItem';
    websiteItem.setAttribute('data-scope', normalizedWebsite.scope);

    const websiteDetails = document.createElement('div');
    websiteDetails.className = 'websiteDetails';

    const websiteName = document.createElement('div');
    websiteName.className = 'websiteName';
    websiteName.textContent = normalizedWebsite.name;
    websiteDetails.appendChild(websiteName);

    const scheduleSummary = document.createElement('div');
    scheduleSummary.className = 'websiteSchedule';
    scheduleSummary.textContent = formatSchedule(schedule);
    websiteDetails.appendChild(scheduleSummary);

    const websiteScope = document.createElement('span');
    websiteScope.className = 'websiteScope';
    websiteScope.textContent = normalizedWebsite.scope === 'url' ? 'URL' : 'Domain';

    const websiteCheckbox = document.createElement('input');
    websiteCheckbox.type = 'checkbox';
    websiteCheckbox.className = 'websiteCheckbox';
    websiteCheckbox.checked = enabled;

    const scheduleButton = document.createElement('button');
    scheduleButton.className = 'ghostButton scheduleButton';
    scheduleButton.textContent = schedule ? 'Edit schedule' : 'Schedule';
    scheduleButton.addEventListener('click', () => {
        const index = blockedEntries.findIndex((entry) =>
            entry.name === normalizedWebsite.name && entry.scope === normalizedWebsite.scope
        );
        if (index >= 0) openScheduleEditor(index);
    });

    // Add an event listener to the checkbox to update local storage when checked or unchecked
    websiteCheckbox.addEventListener('change', () => {
        const index = blockedEntries.findIndex((entry) =>
            entry.name === normalizedWebsite.name && entry.scope === normalizedWebsite.scope
        );
        if (index >= 0) {
            blockedEntries[index] = { ...blockedEntries[index], enabled: websiteCheckbox.checked };
            persistBlockedEntries();
        }
    });

    const deleteButton = document.createElement('button');
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', () => {
        blockedEntries = blockedEntries.filter((entry) =>
            !(entry.name === normalizedWebsite.name && entry.scope === normalizedWebsite.scope)
        );
        persistBlockedEntries();
        renderPage(currentPage);
    });

    websiteItem.appendChild(websiteDetails);
    websiteItem.appendChild(websiteScope);
    websiteItem.appendChild(scheduleButton);
    websiteItem.appendChild(websiteCheckbox);
    websiteItem.appendChild(deleteButton);
    websiteList.appendChild(websiteItem);

    return websiteItem;
}

// Load and normalize the list once, then render the first page.
function loadAndPopulateWebsiteList() {
    chrome.storage.local.get({ blocked: [], schedules: [] }, (data) => {
        const migrated = migrateLegacyScheduleGroups(data.blocked, data.schedules);
        blockedEntries = normalizeBlockedEntries(migrated.blocked);
        if (migrated.migrated) chrome.storage.local.set({blocked: blockedEntries, schedules: []});
        currentPage = 1;
        renderPage(currentPage);
    });
}

function refreshWebsiteList() {
    loadAndPopulateWebsiteList();
}

// Add by keyboard for quick entry.
newWebsiteInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        submitBlockedEntry();
    }
});

// Initialize protected UI and blocked list after load.
window.addEventListener('DOMContentLoaded', () => {
    loadAndPopulateWebsiteList();
});

// Add by button click.
addButton.addEventListener('click', () => {
    submitBlockedEntry();
});

function submitBlockedEntry() {
    const websiteName = newWebsiteInput.value.toString().trim();
    const normalized = normalizeBlockedEntry(websiteName, 'domain');
    const existsInMainList = normalized && blockedEntries.some((entry) =>
        blockedEntriesOverlap(entry, normalized)
    );
    if (existsInMainList) {
        showAddWebsiteStatus('This website is already in the always-blocked list.', true);
        return;
    }
    if (!websiteName || !addBlockedEntry(websiteName)) {
        showAddWebsiteStatus('Enter a valid website, such as example.com or https://example.co.uk.', true);
        return;
    }
    newWebsiteInput.value = '';
    showAddWebsiteStatus('Website added.');
}

function showAddWebsiteStatus(message: string, isError = false) {
    newWebsiteInput.setAttribute('aria-invalid', String(isError));
    if (addWebsiteStatus) {
        addWebsiteStatus.textContent = message;
        addWebsiteStatus.classList.toggle('error', isError);
    }
}

if (refreshButton) {
    refreshButton.addEventListener('click', () => {
        refreshWebsiteList();
    });
}

exportButton?.addEventListener('click', () => {
    chrome.storage.local.get({ blocked: [], enabled: true }, (data) => {
        const configuration = {
            version: 3,
            enabled: data.enabled !== false,
            blocked: normalizeBlockedEntries(Array.isArray(data.blocked) ? data.blocked : []),
        };
        const blob = new Blob([JSON.stringify(configuration, null, 2)], { type: 'application/json' });
        const downloadUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = `tiny-blocker-backup-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(downloadUrl);
        showTransferStatus('Configuration exported.');
    });
});

importButton?.addEventListener('click', () => importFileInput?.click());

importFileInput?.addEventListener('change', async () => {
    const file = importFileInput.files?.[0];
    if (!file) {
        return;
    }
    try {
        const configuration = parseImportedConfiguration(JSON.parse(await file.text()));
        await setLocalStorage({
            [STORAGE_KEYS.blocked]: configuration.blocked,
            [STORAGE_KEYS.enabled]: configuration.enabled,
            [STORAGE_KEYS.schedules]: [],
        });
        blockedEntries = normalizeBlockedEntries(configuration.blocked);
        renderPage(1);
        showTransferStatus(`Imported ${blockedEntries.length} rules.`);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to import this file.';
        showTransferStatus(message, true);
    } finally {
        importFileInput.value = '';
    }
});

function showTransferStatus(message: string, isError = false) {
    if (transferStatus) {
        transferStatus.textContent = message;
        transferStatus.classList.toggle('error', isError);
    }
}

function setLocalStorage(values: Record<string, unknown>): Promise<void> {
    return new Promise((resolve, reject) => {
        chrome.storage.local.set(values, () => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            resolve();
        });
    });
}

// Render one page worth of entries and update pagination controls.
function renderPage(page) {
    const items = websiteList.querySelectorAll('.websiteItem');
    items.forEach((item) => item.remove());

    const totalPages = Math.max(1, Math.ceil(blockedEntries.length / pageSize));
    currentPage = Math.min(Math.max(1, page), totalPages);
    const startIndex = (currentPage - 1) * pageSize;
    const pageEntries = blockedEntries.slice(startIndex, startIndex + pageSize);

    pageEntries.forEach((website) => {
        createWebsiteItem(
            website.name,
            website.enabled,
            website.scope,
            website.schedule
        );
    });

    renderPagination(totalPages);
}

// Build numbered pagination buttons and status text.
function renderPagination(totalPages) {
    if (prevPageButton) {
        prevPageButton.disabled = currentPage <= 1;
        prevPageButton.onclick = () => renderPage(currentPage - 1);
    }
    if (nextPageButton) {
        nextPageButton.disabled = currentPage >= totalPages;
        nextPageButton.onclick = () => renderPage(currentPage + 1);
    }
    if (pageNumbers) {
        pageNumbers.innerHTML = '';
        for (let i = 1; i <= totalPages; i += 1) {
            const button = document.createElement('button');
            button.textContent = i.toString();
            if (i === currentPage) {
                button.classList.add('active');
            }
            button.addEventListener('click', () => renderPage(i));
            pageNumbers.appendChild(button);
        }
    }
    if (pageInfo) {
        pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    }
}

// Insert or enable an entry, then persist and jump to page 1.
function addBlockedEntry(websiteName) {
    const normalized = normalizeBlockedEntry(websiteName, 'domain');
    if (!normalized) {
        return false;
    }
    const existingIndex = blockedEntries.findIndex((entry) =>
        entry.name === normalized.name && entry.scope === normalized.scope
    );
    if (existingIndex >= 0) {
        blockedEntries[existingIndex] = { ...blockedEntries[existingIndex], enabled: true };
    } else {
        blockedEntries.push({
            name: normalized.name,
            scope: normalized.scope,
            enabled: true,
        });
    }
    blockedEntries = sortBlockedEntries(blockedEntries);
    persistBlockedEntries();
    renderPage(1);
    return true;
}

// Persist the current in-memory list for background logic.
function persistBlockedEntries() {
    chrome.storage.local.set({ blocked: blockedEntries });
}

function sortBlockedEntries(entries: BlockedEntry[]) {
    return [...entries].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    );
}

function normalizeBlockedEntries(entries) {
    const normalizedEntries = (entries || []).map((entry) => {
        const normalized = normalizeBlockedEntry(entry?.name || '', entry?.scope);
        if (!normalized) {
            return null;
        }
        return {
            name: normalized.name,
            scope: normalized.scope,
            enabled: Boolean(entry?.enabled),
            ...(normalizeRuleSchedule(entry?.schedule) ? {schedule: normalizeRuleSchedule(entry.schedule)} : {}),
        } as BlockedEntry;
    }).filter((entry) => entry !== null) as BlockedEntry[];

    return sortBlockedEntries(normalizedEntries);
}

function openScheduleEditor(index: number) {
    const entry = blockedEntries[index];
    editingScheduleIndex = index;
    if (scheduleRuleName) scheduleRuleName.textContent = entry.name;
    const schedule = entry.schedule;
    scheduleStart.value = schedule?.start || '09:00';
    scheduleEnd.value = schedule?.end || '17:00';
    document.querySelectorAll<HTMLInputElement>('input[name="scheduleDay"]').forEach((input) => {
        input.checked = schedule ? schedule.days.includes(Number(input.value)) : [1, 2, 3, 4, 5].includes(Number(input.value));
    });
    removeScheduleButton.hidden = !schedule;
    showScheduleStatus('');
    scheduleDialog.hidden = false;
}

document.getElementById('cancelScheduleButton')?.addEventListener('click', closeScheduleEditor);
document.getElementById('saveScheduleButton')?.addEventListener('click', () => {
    if (editingScheduleIndex === null) return;
    const schedule = normalizeRuleSchedule({
        days: [...document.querySelectorAll<HTMLInputElement>('input[name="scheduleDay"]:checked')]
            .map((input) => Number(input.value)),
        start: scheduleStart.value,
        end: scheduleEnd.value,
    });
    if (!schedule) {
        showScheduleStatus('Select at least one day and choose different valid start and end times.', true);
        return;
    }
    blockedEntries[editingScheduleIndex] = {...blockedEntries[editingScheduleIndex], schedule};
    persistBlockedEntries();
    closeScheduleEditor();
    renderPage(currentPage);
});
removeScheduleButton.addEventListener('click', () => {
    if (editingScheduleIndex === null) return;
    const entry = {...blockedEntries[editingScheduleIndex]};
    delete entry.schedule;
    blockedEntries[editingScheduleIndex] = entry;
    persistBlockedEntries();
    closeScheduleEditor();
    renderPage(currentPage);
});

function closeScheduleEditor() {
    scheduleDialog.hidden = true;
    editingScheduleIndex = null;
}

function showScheduleStatus(message: string, isError = false) {
    if (!scheduleStatus) return;
    scheduleStatus.textContent = message;
    scheduleStatus.classList.toggle('error', isError);
}

function formatSchedule(schedule?: RuleSchedule): string {
    if (!schedule) return 'Always';
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return `${schedule.days.map((day) => dayNames[day]).join(', ')} | ${schedule.start}-${schedule.end}`;
}
