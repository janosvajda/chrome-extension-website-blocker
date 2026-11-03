import {STORAGE_KEYS} from '../helper/extensionState';
import {
    createPassphraseProtection,
    normalizePassphraseProtection,
    PassphraseProtection,
    verifyPassphrase,
} from '../helper/passphraseProtection';

export function createPassphraseController() {
    const currentPassphrase = document.getElementById('currentPassphrase') as HTMLInputElement;
    const newPassphrase = document.getElementById('newPassphrase') as HTMLInputElement;
    const confirmPassphrase = document.getElementById('confirmPassphrase') as HTMLInputElement;
    const form = document.getElementById('passwordProtectionForm') as HTMLFormElement;
    const fieldsLegend = document.getElementById('passwordFieldsLegend') as HTMLElement;
    const fields = document.querySelector('.passphraseFields') as HTMLElement;
    const saveButton = document.getElementById('savePassphraseButton') as HTMLButtonElement;
    const removeButton = document.getElementById('removePassphraseButton') as HTMLButtonElement;
    const status = document.getElementById('passphraseStatus') as HTMLElement;
    const description = document.getElementById('passphraseDescription') as HTMLElement;
    const settingsDialog = document.getElementById('passphraseSettingsDialog') as HTMLElement;
    const successDialog = document.getElementById('passwordSuccessDialog') as HTMLElement;
    const successTitle = document.getElementById('passwordSuccessTitle') as HTMLElement;
    const successMessage = document.getElementById('passwordSuccessMessage') as HTMLElement;
    const askWhenOpening = document.getElementById('magicWordForSettings') as HTMLInputElement;
    const gateDescription = document.getElementById('settingsGateDescription') as HTMLElement;
    const gateStatus = document.getElementById('settingsGateStatus') as HTMLElement;
    const unlockDialog = document.getElementById('settingsUnlockDialog') as HTMLElement;
    const unlockPassphrase = document.getElementById('settingsUnlockMagicWord') as HTMLInputElement;
    const unlockStatus = document.getElementById('settingsUnlockStatus') as HTMLElement;
    const appContent = document.getElementById('appContent') as HTMLElement;

    let protection: PassphraseProtection | null = null;
    let askWhenOpeningSettings = false;
    let settingsAccessGranted = false;

    function initialize(storedProtection, storedAskWhenOpening): void {
        protection = normalizePassphraseProtection(storedProtection);
        askWhenOpeningSettings = storedAskWhenOpening === true && Boolean(protection);
        renderSettings();
        applySettingsGate();
    }

    function renderSettings(): void {
        description.textContent = protection
            ? 'A confirmation phrase is set.'
            : 'Choose a confirmation phrase for pausing or turning off blocking.';
        description.classList.toggle('protectionActive', Boolean(protection));
        fieldsLegend.textContent = protection ? 'Change confirmation phrase' : 'Create confirmation phrase';
        currentPassphrase.hidden = !protection;
        fields.classList.toggle('changingPassword', Boolean(protection));
        saveButton.textContent = protection ? 'Change phrase' : 'Set phrase';
        removeButton.hidden = !protection;
        askWhenOpening.disabled = false;
        askWhenOpening.checked = askWhenOpeningSettings;
        gateDescription.textContent = askWhenOpeningSettings
            ? protection
                ? 'On — your confirmation phrase is asked once when Settings opens.'
                : 'This will turn on when you set your confirmation phrase.'
            : protection
                ? 'Off — Settings opens without asking for confirmation.'
                : 'Select this to ask for confirmation once when Settings opens.';
    }

    function applySettingsGate(): void {
        const shouldLock = Boolean(protection) && askWhenOpeningSettings && !settingsAccessGranted;
        appContent.classList.remove('settingsPending');
        appContent.hidden = shouldLock;
        unlockDialog.hidden = !shouldLock;
        if (shouldLock) unlockPassphrase.focus();
    }

    function showStatus(message: string, isError = false): void {
        status.textContent = message;
        status.classList.toggle('error', isError);
    }

    function closeSettingsDialog(): void {
        currentPassphrase.value = '';
        newPassphrase.value = '';
        confirmPassphrase.value = '';
        if (!protection) {
            askWhenOpeningSettings = false;
            renderSettings();
        }
        showStatus('');
        settingsDialog.hidden = true;
    }

    askWhenOpening.addEventListener('change', async () => {
        askWhenOpeningSettings = askWhenOpening.checked;
        gateStatus.textContent = '';
        gateStatus.classList.remove('error');
        if (protection) {
            try {
                await setLocalStorage({[STORAGE_KEYS.magicWordForSettings]: askWhenOpeningSettings});
                gateStatus.textContent = askWhenOpeningSettings
                    ? 'Settings confirmation turned on.'
                    : 'Settings confirmation turned off.';
            } catch {
                askWhenOpeningSettings = !askWhenOpeningSettings;
                gateStatus.textContent = 'Unable to save this setting.';
                gateStatus.classList.add('error');
            }
        } else if (askWhenOpeningSettings) {
            gateStatus.textContent = 'This choice will be saved when you set your confirmation phrase.';
        }
        renderSettings();
    });

    (document.getElementById('unlockSettingsButton') as HTMLButtonElement).addEventListener('click', async () => {
        if (await verifyPassphrase(unlockPassphrase.value, protection)) {
            settingsAccessGranted = true;
            unlockStatus.textContent = '';
            applySettingsGate();
        } else {
            unlockStatus.textContent = 'Incorrect confirmation phrase.';
            unlockStatus.classList.add('error');
        }
    });

    (document.getElementById('openPassphraseSettingsButton') as HTMLButtonElement).addEventListener('click', () => {
        showStatus('');
        gateStatus.textContent = '';
        gateStatus.classList.remove('error');
        chrome.storage.local.get({
            [STORAGE_KEYS.passphraseProtection]: null,
            [STORAGE_KEYS.magicWordForSettings]: false,
        }, (data) => {
            protection = normalizePassphraseProtection(data[STORAGE_KEYS.passphraseProtection]);
            askWhenOpeningSettings = data[STORAGE_KEYS.magicWordForSettings] === true && Boolean(protection);
            renderSettings();
            settingsDialog.hidden = false;
            (protection ? currentPassphrase : newPassphrase).focus();
        });
    });

    (document.getElementById('closePassphraseSettingsButton') as HTMLButtonElement)
        .addEventListener('click', closeSettingsDialog);

    unlockPassphrase.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            (document.getElementById('unlockSettingsButton') as HTMLButtonElement).click();
        }
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        showStatus('');
        if (newPassphrase.value !== confirmPassphrase.value) {
            showStatus('The confirmation phrases do not match.', true);
            return;
        }
        try {
            const changingExistingPassword = Boolean(protection);
            if (changingExistingPassword && !await verifyPassphrase(currentPassphrase.value, protection)) {
                showStatus('Current confirmation phrase is incorrect.', true);
                return;
            }
            const nextProtection = await createPassphraseProtection(newPassphrase.value);
            await setLocalStorage({
                [STORAGE_KEYS.passphraseProtection]: nextProtection,
                [STORAGE_KEYS.magicWordForSettings]: askWhenOpeningSettings,
            });
            protection = nextProtection;
            currentPassphrase.value = '';
            newPassphrase.value = '';
            confirmPassphrase.value = '';
            renderSettings();
            settingsDialog.hidden = true;
            successTitle.textContent = changingExistingPassword ? 'Phrase changed' : 'Phrase set';
            successMessage.textContent = changingExistingPassword
                ? 'Your confirmation phrase was changed successfully.'
                : 'Your confirmation phrase is now set.';
            successDialog.hidden = false;
        } catch (error) {
            showStatus(error instanceof Error ? error.message : 'Unable to set the confirmation phrase.', true);
        }
    });

    document.getElementById('closePasswordSuccessButton')?.addEventListener('click', () => {
        successDialog.hidden = true;
    });

    removeButton.addEventListener('click', async () => {
        await new Promise<void>((resolve) => chrome.storage.local.remove(STORAGE_KEYS.passphraseProtection, resolve));
        protection = null;
        askWhenOpeningSettings = false;
        currentPassphrase.value = '';
        newPassphrase.value = '';
        confirmPassphrase.value = '';
        renderSettings();
        chrome.storage.local.set({[STORAGE_KEYS.magicWordForSettings]: false});
        settingsDialog.hidden = true;
        successTitle.textContent = 'Phrase removed';
        successMessage.textContent = 'Your confirmation phrase was removed.';
        successDialog.hidden = false;
    });

    return {initialize};
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
