import {parseImportedConfiguration, STORAGE_KEYS} from '../helper/extensionState';
import {ScheduledRule} from './scheduleEditor';

type BackupDependencies = {
    normalizeRules: (rules: unknown) => ScheduledRule[];
    replaceRules: (rules: ScheduledRule[]) => void;
};

export function initializeBackupController(dependencies: BackupDependencies) {
    const transferDialog = document.getElementById('transferDialog') as HTMLElement;
    const importConfirmationDialog = document.getElementById('importConfirmationDialog') as HTMLElement;
    const exportSuccessDialog = document.getElementById('exportSuccessDialog') as HTMLElement;
    const importResultDialog = document.getElementById('importResultDialog') as HTMLElement;
    const importFile = document.getElementById('importFile') as HTMLInputElement | null;
    const transferStatus = document.getElementById('transferStatus') as HTMLElement | null;
    let pendingFile: File | null = null;

    function showStatus(message: string, isError = false) {
        if (transferStatus) {
            transferStatus.textContent = message;
            transferStatus.classList.toggle('error', isError);
        }
    }
    function clearPendingImport() {
        pendingFile = null;
        importConfirmationDialog.hidden = true;
        if (importFile) importFile.value = '';
    }
    function showImportResult(success: boolean, message: string) {
        (document.getElementById('importResultTitle') as HTMLElement).textContent = success ? 'Import complete' : 'Import failed';
        (document.getElementById('importResultMessage') as HTMLElement).textContent = message;
        importResultDialog.hidden = false;
    }
    function store(values: Record<string, unknown>): Promise<void> {
        return new Promise((resolve, reject) => chrome.storage.local.set(values, () => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else resolve();
        }));
    }

    document.getElementById('openTransferDialogButton')?.addEventListener('click', () => {
        showStatus('');
        transferDialog.hidden = false;
    });
    document.getElementById('closeTransferDialogButton')?.addEventListener('click', () => {
        showStatus('');
        transferDialog.hidden = true;
    });
    document.getElementById('exportButton')?.addEventListener('click', () => {
        chrome.storage.local.get({blocked: [], enabled: true}, (data) => {
            const configuration = {
                version: 4,
                enabled: data.enabled !== false,
                blocked: dependencies.normalizeRules(Array.isArray(data.blocked) ? data.blocked : []),
            };
            const downloadUrl = URL.createObjectURL(new Blob([JSON.stringify(configuration, null, 2)], {type: 'application/json'}));
            const link = document.createElement('a');
            const fileName = `tiny-blocker-backup-${new Date().toISOString().slice(0, 10)}.json`;
            link.href = downloadUrl;
            link.download = fileName;
            link.click();
            URL.revokeObjectURL(downloadUrl);
            showStatus('Configuration exported.');
            (document.getElementById('exportedFileName') as HTMLElement).textContent = fileName;
            exportSuccessDialog.hidden = false;
        });
    });
    document.getElementById('closeExportSuccessButton')?.addEventListener('click', () => exportSuccessDialog.hidden = true);
    document.getElementById('importButton')?.addEventListener('click', () => importFile?.click());
    importFile?.addEventListener('change', () => {
        pendingFile = importFile.files?.[0] || null;
        if (pendingFile) importConfirmationDialog.hidden = false;
    });
    document.getElementById('cancelImportButton')?.addEventListener('click', clearPendingImport);
    document.getElementById('confirmImportButton')?.addEventListener('click', async () => {
        const file = pendingFile;
        if (!file) return;
        importConfirmationDialog.hidden = true;
        try {
            const configuration = parseImportedConfiguration(JSON.parse(await file.text()));
            await store({
                [STORAGE_KEYS.blocked]: configuration.blocked,
                [STORAGE_KEYS.enabled]: configuration.enabled,
                [STORAGE_KEYS.pausedUntil]: 0,
                [STORAGE_KEYS.schedules]: [],
            });
            const rules = dependencies.normalizeRules(configuration.blocked);
            dependencies.replaceRules(rules);
            showStatus(`Imported ${rules.length} rules.`);
            showImportResult(true, `Imported ${rules.length} ${rules.length === 1 ? 'rule' : 'rules'} successfully.`);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unable to import this file.';
            showStatus(message, true);
            showImportResult(false, message);
        } finally {
            clearPendingImport();
        }
    });
    document.getElementById('closeImportResultButton')?.addEventListener('click', () => importResultDialog.hidden = true);
}
