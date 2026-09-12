import {PassphraseProtection, verifyPassphrase} from '../helper/passphraseProtection';

type ProtectedAction = () => void;

export type PassphrasePrompt = {
    request(description: string, confirmLabel: string, action: ProtectedAction): void;
};

export function createPassphrasePrompt(getProtection: () => PassphraseProtection | null): PassphrasePrompt {
    const prompt = requiredElement<HTMLElement>('passphrasePrompt');
    const input = requiredElement<HTMLInputElement>('popupPassphrase');
    const status = requiredElement<HTMLElement>('popupPassphraseStatus');
    const description = requiredElement<HTMLElement>('passphrasePromptDescription');
    const confirmButton = requiredElement<HTMLButtonElement>('confirmPassphraseButton');
    const cancelButton = requiredElement<HTMLButtonElement>('cancelPassphraseButton');
    let pendingAction: ProtectedAction | null = null;

    function close() {
        prompt.hidden = true;
        input.value = '';
        status.textContent = '';
        pendingAction = null;
    }

    cancelButton.addEventListener('click', close);
    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            confirmButton.click();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            close();
        }
    });

    confirmButton.addEventListener('click', async () => {
        if (!await verifyPassphrase(input.value, getProtection())) {
            status.textContent = 'Incorrect confirmation phrase.';
            return;
        }
        const action = pendingAction;
        close();
        action?.();
    });

    return {
        request(promptDescription, confirmLabel, action) {
            pendingAction = action;
            input.value = '';
            status.textContent = '';
            description.textContent = promptDescription;
            confirmButton.textContent = confirmLabel;
            prompt.hidden = false;
            input.focus();
        },
    };
}

function requiredElement<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Missing popup element: #${id}`);
    return element as T;
}
