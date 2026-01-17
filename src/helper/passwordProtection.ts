const PASSWORD_KEY = "optionsPassword";

function normalizePassword(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function bufferToHex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}

async function hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return bufferToHex(digest);
}

function getStoredPasswordHash(): Promise<string> {
    return new Promise((resolve) => {
        chrome.storage.local.get({ [PASSWORD_KEY]: "" }, (data) => {
            resolve(normalizePassword(data[PASSWORD_KEY]));
        });
    });
}

function showLockScreen(lockScreen: HTMLElement | null, appContent: HTMLElement | null) {
    if (lockScreen) {
        lockScreen.removeAttribute("hidden");
    }
    if (appContent) {
        appContent.setAttribute("hidden", "true");
    }
}

function showAppContent(lockScreen: HTMLElement | null, appContent: HTMLElement | null) {
    if (lockScreen) {
        lockScreen.setAttribute("hidden", "true");
    }
    if (appContent) {
        appContent.removeAttribute("hidden");
    }
}

function updatePasswordButton(
    passwordButton: HTMLElement | null,
    passwordNotice: HTMLElement | null,
    hasPassword: boolean
) {
    if (passwordButton) {
        passwordButton.textContent = hasPassword ? "Edit password" : "Set password";
    }
    if (passwordNotice) {
        passwordNotice.toggleAttribute("hidden", !hasPassword);
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
        passwordTitle.textContent = hasPassword ? "Edit password" : "Set password";
    }
    if (modalPasswordInput) {
        modalPasswordInput.value = "";
        modalPasswordInput.focus();
    }
    if (clearPasswordButton) {
        clearPasswordButton.toggleAttribute("hidden", !hasPassword);
    }
    if (modalPasswordHint) {
        modalPasswordHint.textContent = "";
    }
    if (passwordModal) {
        passwordModal.removeAttribute("hidden");
    }
}

function hidePasswordModal(passwordModal: HTMLElement | null, modalPasswordHint: HTMLElement | null) {
    if (passwordModal) {
        passwordModal.setAttribute("hidden", "true");
    }
    if (modalPasswordHint) {
        modalPasswordHint.textContent = "";
    }
}

export async function initPasswordProtection(): Promise<void> {
    const lockScreen = document.getElementById("lockScreen");
    const appContent = document.getElementById("appContent");
    const passwordInput = document.getElementById("passwordInput") as HTMLInputElement;
    const unlockButton = document.getElementById("unlockButton");
    const unlockError = document.getElementById("unlockError");

    const passwordButton = document.getElementById("passwordButton");
    const passwordModal = document.getElementById("passwordModal");
    const passwordTitle = document.getElementById("passwordTitle");
    const modalPasswordInput = document.getElementById("modalPasswordInput") as HTMLInputElement;
    const savePasswordButton = document.getElementById("savePasswordButton");
    const clearPasswordButton = document.getElementById("clearPasswordButton");
    const cancelPasswordButton = document.getElementById("cancelPasswordButton");
    const modalPasswordHint = document.getElementById("modalPasswordHint");
    const passwordNotice = document.getElementById("passwordNotice");

    const savedHash = await getStoredPasswordHash();
    const hasPassword = savedHash.length > 0;
    updatePasswordButton(passwordButton, passwordNotice, hasPassword);
    if (hasPassword) {
        showLockScreen(lockScreen, appContent);
    } else {
        showAppContent(lockScreen, appContent);
    }

    if (unlockButton) {
        unlockButton.addEventListener("click", async () => {
            const storedHash = await getStoredPasswordHash();
            if (!storedHash) {
                showAppContent(lockScreen, appContent);
                updatePasswordButton(passwordButton, passwordNotice, false);
                return;
            }
            const inputPassword = normalizePassword(passwordInput ? passwordInput.value : "");
            const inputHash = inputPassword ? await hashPassword(inputPassword) : "";
            if (inputHash === storedHash) {
                if (unlockError) {
                    unlockError.textContent = "";
                }
                if (passwordInput) {
                    passwordInput.value = "";
                }
                showAppContent(lockScreen, appContent);
            } else if (unlockError) {
                unlockError.textContent = "Incorrect password. Try again.";
            }
        });
    }

    if (passwordInput) {
        passwordInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter" && unlockButton) {
                unlockButton.click();
            }
        });
    }

    if (passwordButton) {
        passwordButton.addEventListener("click", () => {
            showPasswordModal(
                passwordModal,
                passwordTitle,
                modalPasswordInput,
                clearPasswordButton,
                modalPasswordHint,
                hasPassword
            );
        });
    }

    if (cancelPasswordButton) {
        cancelPasswordButton.addEventListener("click", () => {
            hidePasswordModal(passwordModal, modalPasswordHint);
        });
    }

    if (savePasswordButton) {
        savePasswordButton.addEventListener("click", async () => {
            const newPassword = normalizePassword(modalPasswordInput ? modalPasswordInput.value : "");
            if (!newPassword) {
                if (modalPasswordHint) {
                    modalPasswordHint.textContent = "Enter a password to save.";
                }
                return;
            }
            const hash = await hashPassword(newPassword);
            chrome.storage.local.set({ [PASSWORD_KEY]: hash }, () => {
                updatePasswordButton(passwordButton, passwordNotice, true);
                hidePasswordModal(passwordModal, modalPasswordHint);
            });
        });
    }

    if (clearPasswordButton) {
        clearPasswordButton.addEventListener("click", () => {
            chrome.storage.local.remove(PASSWORD_KEY, () => {
                updatePasswordButton(passwordButton, passwordNotice, false);
                hidePasswordModal(passwordModal, modalPasswordHint);
                showAppContent(lockScreen, appContent);
            });
        });
    }

    if (modalPasswordInput) {
        modalPasswordInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter" && savePasswordButton) {
                savePasswordButton.click();
            }
        });
    }
}
