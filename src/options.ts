import {
    BlockScope,
    NormalizedBlockedEntry,
    RuleSchedule,
    blockedEntryCovers,
    normalizeBlockedEntry,
    requiresBlockScopeChoice,
} from './helper/blockedEntry';
import {parseImportedConfiguration, STORAGE_KEYS} from './helper/extensionState';
import {migrateLegacyScheduleGroups, normalizeRuleSchedule} from './helper/schedules';
import {
    createPassphraseProtection,
    normalizePassphraseProtection,
    PassphraseProtection,
    verifyPassphrase,
} from './helper/passphraseProtection';

const websiteList = document.getElementById('websiteList');
const addWebsiteForm = document.getElementById('addWebsite') as HTMLFormElement;
const newWebsiteInput = document.getElementById('newWebsite') as HTMLInputElement;
const addWebsiteStatus = document.getElementById('addWebsiteStatus');
const prevPageButton = document.getElementById('prevPageButton') as HTMLButtonElement;
const nextPageButton = document.getElementById('nextPageButton') as HTMLButtonElement;
const pageNumbers = document.getElementById('pageNumbers');
const pageInfo = document.getElementById('pageInfo');
const exportButton = document.getElementById('exportButton');
const importButton = document.getElementById('importButton');
const importFileInput = document.getElementById('importFile') as HTMLInputElement;
const transferStatus = document.getElementById('transferStatus');
const scheduleDialog = document.getElementById('scheduleDialog') as HTMLElement;
const blockScopeDialog = document.getElementById('blockScopeDialog') as HTMLElement;
const blockScopeValue = document.getElementById('blockScopeValue') as HTMLElement;
const cancelBlockScopeButton = document.getElementById('cancelBlockScopeButton') as HTMLButtonElement;
const blockDomainButton = document.getElementById('blockDomainButton') as HTMLButtonElement;
const blockUrlButton = document.getElementById('blockUrlButton') as HTMLButtonElement;
const deleteConfirmationDialog = document.getElementById('deleteConfirmationDialog') as HTMLElement;
const deleteRuleValue = document.getElementById('deleteRuleValue') as HTMLElement;
const cancelDeleteButton = document.getElementById('cancelDeleteButton') as HTMLButtonElement;
const confirmDeleteButton = document.getElementById('confirmDeleteButton') as HTMLButtonElement;
const addWebsiteErrorDialog = document.getElementById('addWebsiteErrorDialog') as HTMLElement;
const addWebsiteErrorMessage = document.getElementById('addWebsiteErrorMessage') as HTMLElement;
const scheduleRuleName = document.getElementById('scheduleRuleName');
const scheduleStart = document.getElementById('scheduleStart') as HTMLInputElement;
const scheduleEnd = document.getElementById('scheduleEnd') as HTMLInputElement;
const scheduleStatus = document.getElementById('scheduleStatus');
const removeScheduleButton = document.getElementById('removeScheduleButton') as HTMLButtonElement;
const currentPassphrase = document.getElementById('currentPassphrase') as HTMLInputElement;
const newPassphrase = document.getElementById('newPassphrase') as HTMLInputElement;
const confirmPassphrase = document.getElementById('confirmPassphrase') as HTMLInputElement;
const passwordProtectionForm = document.getElementById('passwordProtectionForm') as HTMLFormElement;
const passwordFieldsLegend = document.getElementById('passwordFieldsLegend') as HTMLElement;
const passphraseFields = document.querySelector('.passphraseFields') as HTMLElement;
const savePassphraseButton = document.getElementById('savePassphraseButton') as HTMLButtonElement;
const removePassphraseButton = document.getElementById('removePassphraseButton') as HTMLButtonElement;
const passphraseStatus = document.getElementById('passphraseStatus') as HTMLElement;
const passphraseDescription = document.getElementById('passphraseDescription') as HTMLElement;
const passphraseSettingsDialog = document.getElementById('passphraseSettingsDialog') as HTMLElement;
const transferDialog = document.getElementById('transferDialog') as HTMLElement;
const importConfirmationDialog = document.getElementById('importConfirmationDialog') as HTMLElement;
const exportSuccessDialog = document.getElementById('exportSuccessDialog') as HTMLElement;
const exportedFileName = document.getElementById('exportedFileName') as HTMLElement;
const importResultDialog = document.getElementById('importResultDialog') as HTMLElement;
const importResultTitle = document.getElementById('importResultTitle') as HTMLElement;
const importResultMessage = document.getElementById('importResultMessage') as HTMLElement;
const passwordSuccessDialog = document.getElementById('passwordSuccessDialog') as HTMLElement;
const passwordSuccessTitle = document.getElementById('passwordSuccessTitle') as HTMLElement;
const passwordSuccessMessage = document.getElementById('passwordSuccessMessage') as HTMLElement;
const magicWordForSettings = document.getElementById('magicWordForSettings') as HTMLInputElement;
const settingsGateDescription = document.getElementById('settingsGateDescription') as HTMLElement;
const settingsGateStatus = document.getElementById('settingsGateStatus') as HTMLElement;
const settingsUnlockDialog = document.getElementById('settingsUnlockDialog') as HTMLElement;
const settingsUnlockMagicWord = document.getElementById('settingsUnlockMagicWord') as HTMLInputElement;
const settingsUnlockStatus = document.getElementById('settingsUnlockStatus') as HTMLElement;
const extensionVersion = document.getElementById('extensionVersion') as HTMLElement;
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
let pendingWebsiteInput: string | null = null;
let pendingDeleteEntry: NormalizedBlockedEntry | null = null;
let passphraseProtection: PassphraseProtection | null = null;
let pendingImportFile: File | null = null;
let requireMagicWordForSettings = false;
let settingsAccessGranted = false;

extensionVersion.textContent = `v${chrome.runtime.getManifest().version}`;

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
    if (schedule) {
        scheduleSummary.classList.add('scheduled');
        const scheduleBadge = document.createElement('span');
        scheduleBadge.className = 'scheduleStatusBadge';
        scheduleBadge.textContent = 'Scheduled';
        scheduleSummary.appendChild(scheduleBadge);
        scheduleSummary.append(` ${formatSchedule(schedule)}`);
    } else {
        scheduleSummary.textContent = 'Always';
    }
    websiteDetails.appendChild(scheduleSummary);

    const websiteScope = document.createElement('span');
    websiteScope.className = 'websiteScope';
    websiteScope.textContent = normalizedWebsite.scope === 'url' ? 'URL' : 'Domain';

    const websiteCheckbox = document.createElement('input');
    websiteCheckbox.type = 'checkbox';
    websiteCheckbox.className = 'websiteCheckbox';
    websiteCheckbox.checked = enabled;

    const scheduleButton = document.createElement('button');
    const scheduleLabel = schedule ? 'Edit schedule' : 'Add schedule';
    scheduleButton.className = 'iconButton scheduleButton';
    scheduleButton.classList.toggle('hasSchedule', Boolean(schedule));
    scheduleButton.textContent = '🗓';
    scheduleButton.setAttribute('aria-label', scheduleLabel);
    scheduleButton.title = scheduleLabel;
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
    deleteButton.className = 'iconButton deleteButton';
    deleteButton.textContent = '🗑';
    deleteButton.setAttribute('aria-label', 'Delete');
    deleteButton.title = 'Delete rule';
    deleteButton.addEventListener('click', () => {
        pendingDeleteEntry = normalizedWebsite;
        deleteRuleValue.textContent = normalizedWebsite.name;
        deleteConfirmationDialog.hidden = false;
    });

    websiteItem.appendChild(websiteDetails);
    websiteItem.appendChild(websiteScope);
    websiteItem.appendChild(websiteCheckbox);
    websiteItem.appendChild(scheduleButton);
    websiteItem.appendChild(deleteButton);
    websiteList.appendChild(websiteItem);

    return websiteItem;
}

// Load and normalize the list once, then render the first page.
function loadAndPopulateWebsiteList() {
    chrome.storage.local.get({
        blocked: [], schedules: [],
        [STORAGE_KEYS.passphraseProtection]: null,
        [STORAGE_KEYS.magicWordForSettings]: false,
    }, (data) => {
        passphraseProtection = normalizePassphraseProtection(data[STORAGE_KEYS.passphraseProtection]);
        requireMagicWordForSettings = data[STORAGE_KEYS.magicWordForSettings] === true && Boolean(passphraseProtection);
        renderPassphraseSettings();
        applySettingsGate();
        const migrated = migrateLegacyScheduleGroups(data.blocked, data.schedules);
        blockedEntries = normalizeBlockedEntries(migrated.blocked);
        if (migrated.migrated) chrome.storage.local.set({blocked: blockedEntries, schedules: []});
        currentPage = 1;
        renderPage(currentPage);
    });
}

// Initialize protected UI and blocked list after load.
window.addEventListener('DOMContentLoaded', () => {
    loadAndPopulateWebsiteList();
});

// A form submit gives the button and Enter key one shared path.
addWebsiteForm.addEventListener('submit', (event) => {
    event.preventDefault();
    submitBlockedEntry();
});

function submitBlockedEntry() {
    const websiteName = newWebsiteInput.value.toString().trim();
    const normalized = normalizeBlockedEntry(websiteName, 'domain');
    if (!websiteName || !normalized) {
        showAddWebsiteStatus('Enter a valid website, such as example.com or https://example.co.uk.', true);
        return;
    }
    if (requiresBlockScopeChoice(websiteName)) {
        pendingWebsiteInput = websiteName;
        blockScopeValue.textContent = websiteName;
        blockScopeDialog.hidden = false;
        return;
    }
    if (!addBlockedEntry(normalized)) {
        showAddWebsiteStatus('This website is already covered by an existing rule.', true);
        return;
    }
    newWebsiteInput.value = '';
    showAddWebsiteStatus('Website added.');
}

function closeBlockScopeDialog() {
    blockScopeDialog.hidden = true;
    pendingWebsiteInput = null;
}

function addPendingWebsite(scope: BlockScope) {
    if (!pendingWebsiteInput) return;
    const websiteName = pendingWebsiteInput;
    closeBlockScopeDialog();
    if (!addBlockedEntry(normalizeBlockedEntry(websiteName, scope) as NormalizedBlockedEntry)) {
        showAddWebsiteStatus('This website is already covered by an existing rule.', true);
        return;
    }
    newWebsiteInput.value = '';
    showAddWebsiteStatus('Website added.');
}

cancelBlockScopeButton.addEventListener('click', closeBlockScopeDialog);
blockDomainButton.addEventListener('click', () => addPendingWebsite('domain'));
blockUrlButton.addEventListener('click', () => addPendingWebsite('url'));

cancelDeleteButton.addEventListener('click', () => {
    pendingDeleteEntry = null;
    deleteConfirmationDialog.hidden = true;
});

confirmDeleteButton.addEventListener('click', () => {
    if (!pendingDeleteEntry) return;
    const entryToDelete = pendingDeleteEntry;
    blockedEntries = blockedEntries.filter((entry) =>
        !(entry.name === entryToDelete.name && entry.scope === entryToDelete.scope)
    );
    pendingDeleteEntry = null;
    deleteConfirmationDialog.hidden = true;
    persistBlockedEntries();
    renderPage(currentPage);
});

function showAddWebsiteStatus(message: string, isError = false) {
    newWebsiteInput.setAttribute('aria-invalid', String(isError));
    if (addWebsiteStatus) {
        addWebsiteStatus.textContent = isError ? '' : message;
        addWebsiteStatus.classList.toggle('error', isError);
    }
    if (isError) {
        addWebsiteErrorMessage.textContent = message;
        addWebsiteErrorDialog.hidden = false;
        (document.getElementById('closeAddWebsiteErrorButton') as HTMLButtonElement).focus();
    }
}

document.getElementById('closeAddWebsiteErrorButton')?.addEventListener('click', () => {
    addWebsiteErrorDialog.hidden = true;
    newWebsiteInput.focus();
});

(document.getElementById('openTransferDialogButton') as HTMLButtonElement).addEventListener('click', () => {
    showTransferStatus('');
    transferDialog.hidden = false;
});

function closeTransferDialog() {
    showTransferStatus('');
    transferDialog.hidden = true;
}

(document.getElementById('closeTransferDialogButton') as HTMLButtonElement).addEventListener('click', closeTransferDialog);

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
        const fileName = `tiny-blocker-backup-${new Date().toISOString().slice(0, 10)}.json`;
        link.download = fileName;
        link.click();
        URL.revokeObjectURL(downloadUrl);
        showTransferStatus('Configuration exported.');
        exportedFileName.textContent = fileName;
        exportSuccessDialog.hidden = false;
    });
});

(document.getElementById('closeExportSuccessButton') as HTMLButtonElement).addEventListener('click', () => {
    exportSuccessDialog.hidden = true;
});

importButton?.addEventListener('click', () => importFileInput?.click());

importFileInput?.addEventListener('change', async () => {
    const file = importFileInput.files?.[0];
    if (!file) return;
    pendingImportFile = file;
    importConfirmationDialog.hidden = false;
});

(document.getElementById('cancelImportButton') as HTMLButtonElement).addEventListener('click', clearPendingImport);
(document.getElementById('confirmImportButton') as HTMLButtonElement).addEventListener('click', async () => {
    const file = pendingImportFile;
    if (!file) return;
    importConfirmationDialog.hidden = true;
    try {
        const configuration = parseImportedConfiguration(JSON.parse(await file.text()));
        await setLocalStorage({
            [STORAGE_KEYS.blocked]: configuration.blocked,
            [STORAGE_KEYS.enabled]: configuration.enabled,
            [STORAGE_KEYS.pausedUntil]: 0,
            [STORAGE_KEYS.schedules]: [],
        });
        blockedEntries = normalizeBlockedEntries(configuration.blocked);
        renderPage(1);
        showTransferStatus(`Imported ${blockedEntries.length} rules.`);
        showImportResult(true, `Imported ${blockedEntries.length} ${blockedEntries.length === 1 ? 'rule' : 'rules'} successfully.`);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to import this file.';
        showTransferStatus(message, true);
        showImportResult(false, message);
    } finally {
        clearPendingImport();
    }
});

function clearPendingImport() {
    pendingImportFile = null;
    importConfirmationDialog.hidden = true;
    importFileInput.value = '';
}

function showImportResult(success: boolean, message: string) {
    importResultTitle.textContent = success ? 'Import complete' : 'Import failed';
    importResultMessage.textContent = message;
    importResultDialog.hidden = false;
}

(document.getElementById('closeImportResultButton') as HTMLButtonElement).addEventListener('click', () => {
    importResultDialog.hidden = true;
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

function renderPassphraseSettings() {
    passphraseDescription.textContent = passphraseProtection
        ? 'A confirmation phrase is set.'
        : 'Choose a confirmation phrase for pausing or turning off blocking.';
    passphraseDescription.classList.toggle('protectionActive', Boolean(passphraseProtection));
    passwordFieldsLegend.textContent = passphraseProtection ? 'Change confirmation phrase' : 'Create confirmation phrase';
    currentPassphrase.hidden = !passphraseProtection;
    passphraseFields.classList.toggle('changingPassword', Boolean(passphraseProtection));
    savePassphraseButton.textContent = passphraseProtection ? 'Change phrase' : 'Set phrase';
    removePassphraseButton.hidden = !passphraseProtection;
    magicWordForSettings.disabled = false;
    magicWordForSettings.checked = requireMagicWordForSettings;
    settingsGateDescription.textContent = requireMagicWordForSettings
        ? passphraseProtection
            ? 'On — your confirmation phrase is asked once when Settings opens.'
            : 'This will turn on when you set your confirmation phrase.'
        : passphraseProtection
            ? 'Off — Settings opens without asking for confirmation.'
            : 'Select this to ask for confirmation once when Settings opens.';
}

function applySettingsGate() {
    const shouldLock = Boolean(passphraseProtection) && requireMagicWordForSettings && !settingsAccessGranted;
    const appContent = document.getElementById('appContent') as HTMLElement;
    appContent.classList.remove('settingsPending');
    appContent.hidden = shouldLock;
    settingsUnlockDialog.hidden = !shouldLock;
    if (shouldLock) settingsUnlockMagicWord.focus();
}

magicWordForSettings.addEventListener('change', async () => {
    requireMagicWordForSettings = magicWordForSettings.checked;
    settingsGateStatus.textContent = '';
    settingsGateStatus.classList.remove('error');
    if (passphraseProtection) {
        try {
            await setLocalStorage({[STORAGE_KEYS.magicWordForSettings]: requireMagicWordForSettings});
            settingsGateStatus.textContent = requireMagicWordForSettings
                ? 'Settings confirmation turned on.'
                : 'Settings confirmation turned off.';
        } catch {
            requireMagicWordForSettings = !requireMagicWordForSettings;
            settingsGateStatus.textContent = 'Unable to save this setting.';
            settingsGateStatus.classList.add('error');
        }
    } else if (requireMagicWordForSettings) {
        settingsGateStatus.textContent = 'This choice will be saved when you set your confirmation phrase.';
    }
    renderPassphraseSettings();
});

(document.getElementById('unlockSettingsButton') as HTMLButtonElement).addEventListener('click', async () => {
    if (await verifyPassphrase(settingsUnlockMagicWord.value, passphraseProtection)) {
        settingsAccessGranted = true;
        settingsUnlockStatus.textContent = '';
        applySettingsGate();
    } else {
        settingsUnlockStatus.textContent = 'Incorrect confirmation phrase.';
        settingsUnlockStatus.classList.add('error');
    }
});

function showPassphraseStatus(message: string, isError = false) {
    passphraseStatus.textContent = message;
    passphraseStatus.classList.toggle('error', isError);
}

(document.getElementById('openPassphraseSettingsButton') as HTMLButtonElement).addEventListener('click', () => {
    showPassphraseStatus('');
    settingsGateStatus.textContent = '';
    settingsGateStatus.classList.remove('error');
    chrome.storage.local.get({
        [STORAGE_KEYS.passphraseProtection]: null,
        [STORAGE_KEYS.magicWordForSettings]: false,
    }, (data) => {
        passphraseProtection = normalizePassphraseProtection(data[STORAGE_KEYS.passphraseProtection]);
        requireMagicWordForSettings = data[STORAGE_KEYS.magicWordForSettings] === true
            && Boolean(passphraseProtection);
        renderPassphraseSettings();
        passphraseSettingsDialog.hidden = false;
        (passphraseProtection ? currentPassphrase : newPassphrase).focus();
    });
});

function closePasswordProtectionDialog() {
    currentPassphrase.value = '';
    newPassphrase.value = '';
    confirmPassphrase.value = '';
    if (!passphraseProtection) {
        requireMagicWordForSettings = false;
        renderPassphraseSettings();
    }
    showPassphraseStatus('');
    passphraseSettingsDialog.hidden = true;
}

(document.getElementById('closePassphraseSettingsButton') as HTMLButtonElement).addEventListener('click', closePasswordProtectionDialog);

document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const dismissibleDialogs: Array<[HTMLElement, string]> = [
        [addWebsiteErrorDialog, 'closeAddWebsiteErrorButton'],
        [passwordSuccessDialog, 'closePasswordSuccessButton'],
        [exportSuccessDialog, 'closeExportSuccessButton'],
        [importResultDialog, 'closeImportResultButton'],
        [importConfirmationDialog, 'cancelImportButton'],
        [deleteConfirmationDialog, 'cancelDeleteButton'],
        [blockScopeDialog, 'cancelBlockScopeButton'],
        [scheduleDialog, 'cancelScheduleButton'],
        [passphraseSettingsDialog, 'closePassphraseSettingsButton'],
        [transferDialog, 'closeTransferDialogButton'],
    ];
    const visibleDialog = dismissibleDialogs.find(([dialog]) => !dialog.hidden);
    if (!visibleDialog) return;
    event.preventDefault();
    (document.getElementById(visibleDialog[1]) as HTMLButtonElement).click();
});

settingsUnlockMagicWord.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        (document.getElementById('unlockSettingsButton') as HTMLButtonElement).click();
    }
});

passwordProtectionForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    showPassphraseStatus('');
    if (newPassphrase.value !== confirmPassphrase.value) {
        showPassphraseStatus('The confirmation phrases do not match.', true);
        return;
    }
    try {
        const changingExistingPassword = Boolean(passphraseProtection);
        if (changingExistingPassword && !await verifyPassphrase(currentPassphrase.value, passphraseProtection)) {
            showPassphraseStatus('Current confirmation phrase is incorrect.', true);
            return;
        }
        const protection = await createPassphraseProtection(newPassphrase.value);
        await setLocalStorage({
            [STORAGE_KEYS.passphraseProtection]: protection,
            [STORAGE_KEYS.magicWordForSettings]: requireMagicWordForSettings,
        });
        passphraseProtection = protection;
        currentPassphrase.value = '';
        newPassphrase.value = '';
        confirmPassphrase.value = '';
        renderPassphraseSettings();
        passphraseSettingsDialog.hidden = true;
        passwordSuccessTitle.textContent = changingExistingPassword ? 'Phrase changed' : 'Phrase set';
        passwordSuccessMessage.textContent = changingExistingPassword
            ? 'Your confirmation phrase was changed successfully.'
            : 'Your confirmation phrase is now set.';
        passwordSuccessDialog.hidden = false;
    } catch (error) {
        showPassphraseStatus(error instanceof Error ? error.message : 'Unable to set the confirmation phrase.', true);
    }
});

document.getElementById('closePasswordSuccessButton')?.addEventListener('click', () => {
    passwordSuccessDialog.hidden = true;
});

removePassphraseButton.addEventListener('click', async () => {
    await new Promise<void>((resolve) => chrome.storage.local.remove(STORAGE_KEYS.passphraseProtection, resolve));
    passphraseProtection = null;
    requireMagicWordForSettings = false;
    currentPassphrase.value = '';
    newPassphrase.value = '';
    confirmPassphrase.value = '';
    renderPassphraseSettings();
    chrome.storage.local.set({[STORAGE_KEYS.magicWordForSettings]: false});
    passphraseSettingsDialog.hidden = true;
    passwordSuccessTitle.textContent = 'Phrase removed';
    passwordSuccessMessage.textContent = 'Your confirmation phrase was removed.';
    passwordSuccessDialog.hidden = false;
});

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
function addBlockedEntry(normalized: NormalizedBlockedEntry) {
    const alreadyCovered = blockedEntries.some((entry) => {
        const sameRule = entry.scope === normalized.scope && entry.name === normalized.name;
        return sameRule || (entry.enabled && blockedEntryCovers(entry, normalized));
    });
    if (alreadyCovered) return false;
    blockedEntries.push({
        name: normalized.name,
        scope: normalized.scope,
        enabled: true,
    });
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
    showScheduleEditor(index);
}

function showScheduleEditor(index: number) {
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
