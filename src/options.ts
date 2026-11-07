import {STORAGE_KEYS} from './helper/extensionState';
import {migrateLegacyScheduleGroups} from './helper/schedules';
import {createScheduleEditor, ScheduledRule} from './options/scheduleEditor';
import {initializeBackupController} from './options/backupController';
import {createRuleSync, normalizeBlockedEntries} from './options/ruleSync';
import {createPassphraseController} from './options/passphraseController';
import {createRuleListController} from './options/ruleListController';
import {createAddRuleController} from './options/addRuleController';
import {initializeDialogKeyboard} from './options/dialogKeyboard';
import {initializeRuleHelpController} from './options/ruleHelpController';

const scheduleDialog = document.getElementById('scheduleDialog') as HTMLElement;
const extensionVersion = document.getElementById('extensionVersion') as HTMLElement;
const copyrightYear = document.getElementById('copyrightYear') as HTMLElement;
type BlockedEntry = ScheduledRule;

let blockedEntries: BlockedEntry[] = [];
let pendingExternalBlockedEntries: BlockedEntry[] | null = null;

const ruleSync = createRuleSync({
    applyRules: (rules) => {
        blockedEntries = rules;
    },
    onExternalRules: (rules) => {
        if (!scheduleDialog.hidden) {
            pendingExternalBlockedEntries = rules;
            return;
        }
        applyExternalBlockedEntries(rules);
    },
});
const passphraseController = createPassphraseController();

const scheduleEditor = createScheduleEditor({
    getRules: () => blockedEntries,
    saveRule: (index, rule) => {
        blockedEntries[index] = rule;
        persistBlockedEntries(() => ruleList.render());
    },
    refreshRules: () => ruleList.render(),
    onClose: (saved) => {
        if (!pendingExternalBlockedEntries) return;
        if (!saved) applyExternalBlockedEntries(pendingExternalBlockedEntries);
        pendingExternalBlockedEntries = null;
    },
});
const ruleList = createRuleListController({
    getRules: () => blockedEntries,
    replaceRules: (rules) => {
        blockedEntries = rules;
    },
    persistRules: persistBlockedEntries,
    openSchedule: (index) => scheduleEditor.open(index),
});
createAddRuleController({
    getRules: () => blockedEntries,
    addRule: ruleList.addRule,
});
initializeBackupController({
    normalizeRules: normalizeBlockedEntries,
    replaceRules: (rules) => {
        ruleSync.applySyncedRules(rules);
        ruleList.resetFilters();
    },
});
initializeDialogKeyboard();
initializeRuleHelpController();

extensionVersion.textContent = `v${chrome.runtime.getManifest().version}`;
copyrightYear.textContent = String(new Date().getFullYear());

// Load and normalize the list once, then render the first page.
function loadAndPopulateWebsiteList() {
    chrome.storage.local.get({
        blocked: [], schedules: [],
        [STORAGE_KEYS.passphraseProtection]: null,
        [STORAGE_KEYS.magicWordForSettings]: false,
    }, (data) => {
        passphraseController.initialize(
            data[STORAGE_KEYS.passphraseProtection],
            data[STORAGE_KEYS.magicWordForSettings],
        );
        const migrated = migrateLegacyScheduleGroups(data.blocked, data.schedules);
        ruleSync.applySyncedRules(normalizeBlockedEntries(migrated.blocked));
        if (migrated.migrated) chrome.storage.local.set({blocked: blockedEntries, schedules: []});
        ruleList.render(1);
    });
}

// Initialize protected UI and blocked list after load.
window.addEventListener('DOMContentLoaded', () => {
    loadAndPopulateWebsiteList();
});

function applyExternalBlockedEntries(entries: BlockedEntry[]): void {
    ruleSync.applySyncedRules(entries);
    ruleList.render();
}

// Persist the current in-memory list for background logic.
function persistBlockedEntries(onPersisted?: () => void) {
    ruleSync.persistRules(blockedEntries, onPersisted);
}
