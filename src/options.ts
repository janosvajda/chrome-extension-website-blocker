import {
    BlockScope,
    NormalizedBlockedEntry,
    RuleSchedule,
    blockedEntryCovers,
    normalizeBlockedEntry,
    requiresBlockScopeChoice,
} from './helper/blockedEntry';
import {normalizePausedUntil, STORAGE_KEYS} from './helper/extensionState';
import {migrateLegacyScheduleGroups, normalizeRuleSchedule} from './helper/schedules';
import {createScheduleEditor, formatSchedule, ScheduledRule} from './options/scheduleEditor';
import {initializeBackupController} from './options/backupController';
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
const scheduleDialog = document.getElementById('scheduleDialog') as HTMLElement;
const scheduleCopyDialog = document.getElementById('scheduleCopyDialog') as HTMLElement;
const scheduleTemplateDialog = document.getElementById('scheduleTemplateDialog') as HTMLElement;
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
const addWebsiteErrorTitle = document.getElementById('addWebsiteErrorTitle') as HTMLElement;
const addWebsiteErrorMessage = document.getElementById('addWebsiteErrorMessage') as HTMLElement;
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
const importResultDialog = document.getElementById('importResultDialog') as HTMLElement;
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
const ruleSearch = document.getElementById('ruleSearch') as HTMLInputElement;
const ruleFilter = document.getElementById('ruleFilter') as HTMLSelectElement;
const clearRuleSearchButton = document.getElementById('clearRuleSearchButton') as HTMLButtonElement;
const clearRuleFiltersButton = document.getElementById('clearRuleFiltersButton') as HTMLButtonElement;
const ruleResultsCount = document.getElementById('ruleResultsCount') as HTMLElement;
const ruleEmptyState = document.getElementById('ruleEmptyState') as HTMLElement;
const ruleEmptyTitle = document.getElementById('ruleEmptyTitle') as HTMLElement;
const ruleEmptyDescription = document.getElementById('ruleEmptyDescription') as HTMLElement;
const websiteListHeader = document.getElementById('websiteListHeader') as HTMLElement;
const pagination = document.getElementById('pagination') as HTMLElement;
type BlockedEntry = ScheduledRule;

// Pagination defaults keep the list readable on smaller screens.
const pageSize = 5;
let currentPage = 1;
let blockedEntries: BlockedEntry[] = [];
let pendingWebsiteInput: string | null = null;
let pendingDeleteEntry: NormalizedBlockedEntry | null = null;
let passphraseProtection: PassphraseProtection | null = null;
let requireMagicWordForSettings = false;
let settingsAccessGranted = false;

const scheduleEditor = createScheduleEditor({
    getRules: () => blockedEntries,
    saveRule: (index, rule) => {
        blockedEntries[index] = rule;
        persistBlockedEntries();
    },
    refreshRules: () => renderPage(currentPage),
});
initializeBackupController({
    normalizeRules: normalizeBlockedEntries,
    replaceRules: (rules) => {
        blockedEntries = rules;
        resetRuleFilters();
    },
});

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
    websiteCheckbox.setAttribute('aria-label', `Block ${normalizedWebsite.name}`);

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
        if (index >= 0) scheduleEditor.open(index);
    });

    // Add an event listener to the checkbox to update local storage when checked or unchecked
    websiteCheckbox.addEventListener('change', () => {
        const index = blockedEntries.findIndex((entry) =>
            entry.name === normalizedWebsite.name && entry.scope === normalizedWebsite.scope
        );
        if (index >= 0) {
            blockedEntries[index] = { ...blockedEntries[index], enabled: websiteCheckbox.checked };
            persistBlockedEntries();
            if (ruleFilter.value === 'enabled' || ruleFilter.value === 'disabled') {
                const visibleIndex = Array.from(websiteList.querySelectorAll('.websiteCheckbox')).indexOf(websiteCheckbox);
                renderPage(currentPage);
                const visibleCheckboxes = websiteList.querySelectorAll<HTMLInputElement>('.websiteCheckbox');
                (visibleCheckboxes[Math.min(visibleIndex, visibleCheckboxes.length - 1)] || ruleFilter).focus();
            }
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
    addWebsiteWithBlockingWarning(normalized);
}

function closeBlockScopeDialog() {
    blockScopeDialog.hidden = true;
    pendingWebsiteInput = null;
}

function addPendingWebsite(scope: BlockScope) {
    if (!pendingWebsiteInput) return;
    const websiteName = pendingWebsiteInput;
    closeBlockScopeDialog();
    addWebsiteWithBlockingWarning(normalizeBlockedEntry(websiteName, scope) as NormalizedBlockedEntry);
}

function addWebsiteWithBlockingWarning(normalized: NormalizedBlockedEntry) {
    chrome.storage.local.get({enabled: true, pausedUntil: 0}, (data) => {
        if (!addBlockedEntry(normalized)) {
            showAddWebsiteStatus('This website is already covered by an existing rule.', true);
            return;
        }
        newWebsiteInput.value = '';
        if (data.enabled === false) {
            showAddWebsiteWarning('The website was added, but blocking is currently off. Turn blocking on for the rule to take effect.');
        } else if (normalizePausedUntil(data.pausedUntil) > 0) {
            showAddWebsiteWarning('The website was added, but blocking is temporarily paused. Resume blocking for the rule to take effect.');
        } else {
            showAddWebsiteStatus('Website added.');
        }
    });
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
        addWebsiteErrorTitle.textContent = 'Website not added';
        addWebsiteErrorMessage.textContent = message;
        addWebsiteErrorDialog.hidden = false;
        (document.getElementById('closeAddWebsiteErrorButton') as HTMLButtonElement).focus();
    }
}

function showAddWebsiteWarning(message: string) {
    newWebsiteInput.setAttribute('aria-invalid', 'false');
    addWebsiteErrorTitle.textContent = 'Website added';
    addWebsiteErrorMessage.textContent = message;
    addWebsiteErrorDialog.hidden = false;
    (document.getElementById('closeAddWebsiteErrorButton') as HTMLButtonElement).focus();
}

document.getElementById('closeAddWebsiteErrorButton')?.addEventListener('click', () => {
    addWebsiteErrorDialog.hidden = true;
    newWebsiteInput.focus();
});

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
        [scheduleCopyDialog, 'cancelCopyScheduleButton'],
        [scheduleTemplateDialog, 'cancelScheduleTemplateButton'],
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

ruleSearch.addEventListener('input', () => renderPage(1));
ruleFilter.addEventListener('change', () => renderPage(1));
clearRuleSearchButton.addEventListener('click', () => {
    ruleSearch.value = '';
    renderPage(1);
    ruleSearch.focus();
});
clearRuleFiltersButton.addEventListener('click', () => {
    resetRuleFilters();
    ruleSearch.focus();
});

function resetRuleFilters() {
    ruleSearch.value = '';
    ruleFilter.value = 'all';
    renderPage(1);
}

function matchesRuleFilter(entry: BlockedEntry): boolean {
    switch (ruleFilter.value) {
        case 'enabled': return entry.enabled;
        case 'disabled': return !entry.enabled;
        case 'scheduled': return Boolean(entry.schedule);
        case 'unscheduled': return !entry.schedule;
        case 'domain': return entry.scope === 'domain';
        case 'url': return entry.scope === 'url';
        default: return true;
    }
}

// Filter a view of the complete list; persistence always uses blockedEntries.
function renderPage(page) {
    const items = websiteList.querySelectorAll('.websiteItem');
    items.forEach((item) => item.remove());

    const query = ruleSearch.value.trim().toLowerCase();
    const filteredEntries = blockedEntries.filter((entry) =>
        entry.name.toLowerCase().includes(query) && matchesRuleFilter(entry)
    );
    const hasFilters = Boolean(query) || ruleFilter.value !== 'all';
    clearRuleSearchButton.hidden = !ruleSearch.value;
    clearRuleFiltersButton.hidden = !hasFilters;
    ruleResultsCount.textContent = hasFilters
        ? `${filteredEntries.length} of ${blockedEntries.length} rules`
        : `${blockedEntries.length} ${blockedEntries.length === 1 ? 'rule' : 'rules'}`;
    ruleEmptyState.hidden = filteredEntries.length > 0;
    websiteListHeader.hidden = filteredEntries.length === 0;
    ruleEmptyTitle.textContent = blockedEntries.length ? 'No matching rules' : 'No rules yet';
    ruleEmptyDescription.textContent = blockedEntries.length
        ? 'Try a different search or clear your filters.'
        : 'Add your first website below to get started.';

    const totalPages = Math.max(1, Math.ceil(filteredEntries.length / pageSize));
    currentPage = Math.min(Math.max(1, page), totalPages);
    const startIndex = (currentPage - 1) * pageSize;
    const pageEntries = filteredEntries.slice(startIndex, startIndex + pageSize);
    websiteList.scrollTop = 0;

    pageEntries.forEach((website) => {
        createWebsiteItem(
            website.name,
            website.enabled,
            website.scope,
            website.schedule
        );
    });

    pagination.hidden = totalPages <= 1;
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
            button.setAttribute('aria-label', `Page ${i}`);
            if (i === currentPage) {
                button.classList.add('active');
                button.setAttribute('aria-current', 'page');
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
    resetRuleFilters();
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
