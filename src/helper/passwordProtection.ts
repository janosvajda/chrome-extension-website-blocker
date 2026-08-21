const PASSWORD_STORAGE_KEY =
    typeof __TINY_BLOCKER_PASSWORD_STORAGE_KEY__ === 'string' &&
    __TINY_BLOCKER_PASSWORD_STORAGE_KEY__.trim().length > 0
        ? __TINY_BLOCKER_PASSWORD_STORAGE_KEY__.trim()
        : '';

const PASSWORD_SALT_STORAGE_KEY =
    typeof __TINY_BLOCKER_PASSWORD_SALT_STORAGE_KEY__ === 'string' &&
    __TINY_BLOCKER_PASSWORD_SALT_STORAGE_KEY__.trim().length > 0
        ? __TINY_BLOCKER_PASSWORD_SALT_STORAGE_KEY__.trim()
        : '';

const PBKDF2_ITERATIONS = 120000;

if (!PASSWORD_STORAGE_KEY || !PASSWORD_SALT_STORAGE_KEY) {
    throw new Error('Missing password storage keys configuration.');
}

function normalizePassword(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function bufferToHex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
}

function toBase64(bytes: Uint8Array): string {
    let binary = '';
    bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
    });
    return btoa(binary);
}

function fromBase64(value: string): Uint8Array | null {
    try {
        const binary = atob(value);
        return Uint8Array.from(binary, (char) => char.charCodeAt(0));
    } catch {
        return null;
    }
}

function createSalt(): string {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    return toBase64(salt);
}

async function hashPasswordLegacy(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return bufferToHex(digest);
}

async function hashPassword(password: string, saltBase64: string): Promise<string> {
    const salt = fromBase64(saltBase64);
    if (!salt) {
        return '';
    }
    const saltBuffer = Uint8Array.from(salt).buffer;
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        { name: 'PBKDF2' },
        false,
        ['deriveBits']
    );
    const derivedBits = await crypto.subtle.deriveBits(
        {
            name: 'PBKDF2',
            salt: saltBuffer,
            iterations: PBKDF2_ITERATIONS,
            hash: 'SHA-256',
        },
        keyMaterial,
        256
    );
    return bufferToHex(derivedBits);
}

type StoredPasswordData = {
    hash: string;
    salt: string;
};

function getStoredPasswordData(): Promise<StoredPasswordData> {
    return new Promise((resolve) => {
        chrome.storage.local.get({ [PASSWORD_STORAGE_KEY]: '', [PASSWORD_SALT_STORAGE_KEY]: '' }, (data) => {
            resolve({
                hash: normalizePassword(data[PASSWORD_STORAGE_KEY]),
                salt: normalizePassword(data[PASSWORD_SALT_STORAGE_KEY]),
            });
        });
    });
}

async function verifyPassword(password: string, storedHash: string, storedSalt: string): Promise<boolean> {
    if (!storedHash || !password) {
        return false;
    }
    if (storedSalt) {
        const inputHash = await hashPassword(password, storedSalt);
        return inputHash === storedHash;
    }

    // Backward compatibility: migrate old unsalted hashes after successful unlock.
    const legacyHash = await hashPasswordLegacy(password);
    if (legacyHash !== storedHash) {
        return false;
    }
    const newSalt = createSalt();
    const migratedHash = await hashPassword(password, newSalt);
    if (!migratedHash) {
        return true;
    }
    chrome.storage.local.set({ [PASSWORD_STORAGE_KEY]: migratedHash, [PASSWORD_SALT_STORAGE_KEY]: newSalt });
    return true;
}

function showLockScreen(lockScreen: HTMLElement | null, appContent: HTMLElement | null) {
    if (lockScreen) {
        lockScreen.removeAttribute('hidden');
    }
    if (appContent) {
        appContent.setAttribute('hidden', 'true');
    }
}

function showAppContent(lockScreen: HTMLElement | null, appContent: HTMLElement | null) {
    if (lockScreen) {
        lockScreen.setAttribute('hidden', 'true');
    }
    if (appContent) {
        appContent.removeAttribute('hidden');
    }
}

function updatePasswordButton(
    passwordButton: HTMLElement | null,
    passwordNotice: HTMLElement | null,
    hasPassword: boolean
) {
    if (passwordButton) {
        passwordButton.textContent = hasPassword ? 'Edit password' : 'Set password';
    }
    if (passwordNotice) {
        passwordNotice.toggleAttribute('hidden', !hasPassword);
    }
}

function showPasswordModal(
    passwordModal: HTMLElement | null,
    passwordTitle: HTMLElement | null,
    modalPasswordInput: HTMLInputElement | null,
    clearPasswordButton: HTMLElement | null,
    modalPasswordHint: HTMLElement | null,
    hasPassword: boolean
) {
    if (passwordTitle) {
        passwordTitle.textContent = hasPassword ? 'Edit password' : 'Set password';
    }
    if (modalPasswordInput) {
        modalPasswordInput.value = '';
        modalPasswordInput.focus();
    }
    if (clearPasswordButton) {
        clearPasswordButton.toggleAttribute('hidden', !hasPassword);
    }
    if (modalPasswordHint) {
        modalPasswordHint.textContent = '';
    }
    if (passwordModal) {
        passwordModal.removeAttribute('hidden');
    }
}

function hidePasswordModal(passwordModal: HTMLElement | null, modalPasswordHint: HTMLElement | null) {
    if (passwordModal) {
        passwordModal.setAttribute('hidden', 'true');
    }
    if (modalPasswordHint) {
        modalPasswordHint.textContent = '';
    }
}

export async function initPasswordProtection(): Promise<void> {
    const lockScreen = document.getElementById('lockScreen');
    const appContent = document.getElementById('appContent');
    const passwordInput = document.getElementById('passwordInput') as HTMLInputElement;
    const unlockButton = document.getElementById('unlockButton');
    const unlockError = document.getElementById('unlockError');

    const passwordButton = document.getElementById('passwordButton');
    const passwordModal = document.getElementById('passwordModal');
    const passwordTitle = document.getElementById('passwordTitle');
    const modalPasswordInput = document.getElementById('modalPasswordInput') as HTMLInputElement;
    const savePasswordButton = document.getElementById('savePasswordButton');
    const clearPasswordButton = document.getElementById('clearPasswordButton');
    const cancelPasswordButton = document.getElementById('cancelPasswordButton');
    const modalPasswordHint = document.getElementById('modalPasswordHint');
    const passwordNotice = document.getElementById('passwordNotice');

    const savedPasswordData = await getStoredPasswordData();
    const hasPassword = savedPasswordData.hash.length > 0;
    updatePasswordButton(passwordButton, passwordNotice, hasPassword);
    if (hasPassword) {
        showLockScreen(lockScreen, appContent);
    } else {
        showAppContent(lockScreen, appContent);
    }

    if (unlockButton) {
        unlockButton.addEventListener('click', async () => {
            const storedData = await getStoredPasswordData();
            if (!storedData.hash) {
                showAppContent(lockScreen, appContent);
                updatePasswordButton(passwordButton, passwordNotice, false);
                return;
            }
            const inputPassword = normalizePassword(passwordInput ? passwordInput.value : '');
            const isValidPassword = await verifyPassword(inputPassword, storedData.hash, storedData.salt);
            if (isValidPassword) {
                if (unlockError) {
                    unlockError.textContent = '';
                }
                if (passwordInput) {
                    passwordInput.value = '';
                }
                showAppContent(lockScreen, appContent);
            } else if (unlockError) {
                unlockError.textContent = 'Incorrect password. Try again.';
            }
        });
    }

    if (passwordInput) {
        passwordInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && unlockButton) {
                unlockButton.click();
            }
        });
    }

    if (passwordButton) {
        passwordButton.addEventListener('click', async () => {
            const currentData = await getStoredPasswordData();
            showPasswordModal(
                passwordModal,
                passwordTitle,
                modalPasswordInput,
                clearPasswordButton,
                modalPasswordHint,
                currentData.hash.length > 0
            );
        });
    }

    if (cancelPasswordButton) {
        cancelPasswordButton.addEventListener('click', () => {
            hidePasswordModal(passwordModal, modalPasswordHint);
        });
    }

    if (savePasswordButton) {
        savePasswordButton.addEventListener('click', async () => {
            const newPassword = normalizePassword(modalPasswordInput ? modalPasswordInput.value : '');
            if (!newPassword) {
                if (modalPasswordHint) {
                    modalPasswordHint.textContent = 'Enter a password to save.';
                }
                return;
            }
            const salt = createSalt();
            const hash = await hashPassword(newPassword, salt);
            if (!hash) {
                if (modalPasswordHint) {
                    modalPasswordHint.textContent = 'Could not save password. Try again.';
                }
                return;
            }
            chrome.storage.local.set({ [PASSWORD_STORAGE_KEY]: hash, [PASSWORD_SALT_STORAGE_KEY]: salt }, () => {
                updatePasswordButton(passwordButton, passwordNotice, true);
                hidePasswordModal(passwordModal, modalPasswordHint);
            });
        });
    }

    if (clearPasswordButton) {
        clearPasswordButton.addEventListener('click', () => {
            chrome.storage.local.remove([PASSWORD_STORAGE_KEY, PASSWORD_SALT_STORAGE_KEY], () => {
                updatePasswordButton(passwordButton, passwordNotice, false);
                hidePasswordModal(passwordModal, modalPasswordHint);
                showAppContent(lockScreen, appContent);
            });
        });
    }

    if (modalPasswordInput) {
        modalPasswordInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && savePasswordButton) {
                savePasswordButton.click();
            }
        });
    }
}
