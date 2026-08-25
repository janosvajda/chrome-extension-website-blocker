import {
    getRemainingPauseMinutes,
    incrementDailyPauseUsage,
    normalizeDailyPauseUsage,
    normalizePausedUntil,
    normalizeStatistics,
    STORAGE_KEYS,
} from './helper/extensionState';
import {getRandomItem} from './helper/getRandomItem';
import {normalizePassphraseProtection, PassphraseProtection, verifyPassphrase} from './helper/passphraseProtection';

const PAUSE_NUDGES = [
    'Boing! Another pause has entered the chat. 😄',
    'Your focus called—it says it’ll be right back. ☕',
    'The pause button is becoming today’s most-clicked celebrity. 🎬',
];

const enabledToggle = document.getElementById('enabledToggle') as HTMLInputElement;
const statusText = document.getElementById('statusText');
const activeRules = document.getElementById('activeRules');
const blockedToday = document.getElementById('blockedToday');
const blockedTotal = document.getElementById('blockedTotal');
const openOptionsButton = document.getElementById('openOptionsButton');
const pausePanel = document.getElementById('pausePanel');
const pauseChoices = document.getElementById('pauseChoices');
const activePause = document.getElementById('activePause');
const pauseRemaining = document.getElementById('pauseRemaining');
const pauseResumeTime = document.getElementById('pauseResumeTime');
const pauseNudge = document.getElementById('pauseNudge');
const resumeButton = document.getElementById('resumeButton');
const pauseButtons = document.querySelectorAll<HTMLButtonElement>('[data-pause-minutes]');
const passphrasePrompt = document.getElementById('passphrasePrompt') as HTMLElement;
const popupPassphrase = document.getElementById('popupPassphrase') as HTMLInputElement;
const popupPassphraseStatus = document.getElementById('popupPassphraseStatus') as HTMLElement;
const passphrasePromptDescription = document.getElementById('passphrasePromptDescription') as HTMLElement;
const confirmPassphraseButton = document.getElementById('confirmPassphraseButton') as HTMLButtonElement;

let blockingEnabled = true;
let pausedUntil = 0;
let pauseUsage: unknown = {};
let pauseNudgeMessage = '';
let countdownTimer: ReturnType<typeof setInterval> | undefined;
let passphraseProtection: PassphraseProtection | null = null;
let pendingProtectedAction: (() => void) | null = null;

function renderBlockingState(now = Date.now()) {
    const activePausedUntil = blockingEnabled ? normalizePausedUntil(pausedUntil, now) : 0;
    const isTemporarilyPaused = activePausedUntil > 0;
    enabledToggle.checked = blockingEnabled && !isTemporarilyPaused;

    if (statusText) {
        statusText.textContent = !blockingEnabled
            ? 'Blocking is off'
            : isTemporarilyPaused
                ? 'Blocking is temporarily paused'
                : 'Blocking is on';
        statusText.classList.toggle('paused', !blockingEnabled || isTemporarilyPaused);
    }

    if (pausePanel) pausePanel.hidden = !blockingEnabled;
    if (pauseChoices) pauseChoices.hidden = isTemporarilyPaused;
    if (activePause) activePause.hidden = !isTemporarilyPaused;
    if (pauseNudge) {
        pauseNudge.textContent = pauseNudgeMessage;
        pauseNudge.hidden = (blockingEnabled && !isTemporarilyPaused) || !pauseNudgeMessage;
    }

    if (isTemporarilyPaused) {
        const minutes = getRemainingPauseMinutes(activePausedUntil, now);
        if (pauseRemaining) {
            pauseRemaining.textContent = activePausedUntil - now < 60_000
                ? 'Less than 1 minute remaining'
                : `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} remaining`;
        }
        if (pauseResumeTime) {
            const resumeTime = new Date(activePausedUntil).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
            });
            pauseResumeTime.textContent = `Resumes automatically at ${resumeTime}`;
        }
        startCountdown();
        return;
    }

    stopCountdown();
    if (blockingEnabled && pausedUntil) {
        pausedUntil = 0;
        chrome.storage.local.set({[STORAGE_KEYS.pausedUntil]: 0});
    }
}

function startCountdown() {
    if (!countdownTimer) {
        countdownTimer = setInterval(() => renderBlockingState(), 1_000);
    }
}

function stopCountdown() {
    if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = undefined;
    }
}

chrome.storage.local.get(
    {
        [STORAGE_KEYS.enabled]: true,
        [STORAGE_KEYS.pausedUntil]: 0,
        [STORAGE_KEYS.pauseUsage]: {},
        [STORAGE_KEYS.blocked]: [],
        [STORAGE_KEYS.statistics]: {},
        [STORAGE_KEYS.passphraseProtection]: null,
    },
    (data) => {
        blockingEnabled = data[STORAGE_KEYS.enabled] !== false;
        pausedUntil = normalizePausedUntil(data[STORAGE_KEYS.pausedUntil]);
        pauseUsage = normalizeDailyPauseUsage(data[STORAGE_KEYS.pauseUsage]);
        passphraseProtection = normalizePassphraseProtection(data[STORAGE_KEYS.passphraseProtection]);
        const blocked: Array<{enabled?: boolean}> = Array.isArray(data[STORAGE_KEYS.blocked])
            ? data[STORAGE_KEYS.blocked] as Array<{enabled?: boolean}>
            : [];
        const statistics = normalizeStatistics(data[STORAGE_KEYS.statistics]);
        renderBlockingState();
        if (activeRules) {
            activeRules.textContent = String(blocked.filter((entry) => entry?.enabled).length);
        }
        if (blockedToday) {
            blockedToday.textContent = String(statistics.today);
        }
        if (blockedTotal) {
            blockedTotal.textContent = String(statistics.total);
        }
    }
);

enabledToggle.addEventListener('change', () => {
    if (!enabledToggle.checked && passphraseProtection) {
        enabledToggle.checked = true;
        requestPassphrase(
            'Enter your password to turn blocking off.',
            'Turn blocking off',
            () => setBlockingEnabled(false)
        );
        return;
    }
    setBlockingEnabled(enabledToggle.checked);
});

function setBlockingEnabled(enabled: boolean) {
    blockingEnabled = enabled;
    pausedUntil = 0;
    const values: Record<string, unknown> = {
        [STORAGE_KEYS.enabled]: blockingEnabled,
        [STORAGE_KEYS.pausedUntil]: 0,
    };
    if (!blockingEnabled) {
        pauseUsage = incrementDailyPauseUsage(pauseUsage);
        pauseNudgeMessage = normalizeDailyPauseUsage(pauseUsage).count >= 4
            ? getRandomItem(PAUSE_NUDGES) || ''
            : '';
        values[STORAGE_KEYS.pauseUsage] = pauseUsage;
    } else {
        pauseNudgeMessage = '';
    }
    chrome.storage.local.set(values);
    renderBlockingState();
}

function requestPassphrase(description: string, confirmLabel: string, action: () => void) {
    pendingProtectedAction = action;
    popupPassphrase.value = '';
    popupPassphraseStatus.textContent = '';
    passphrasePromptDescription.textContent = description;
    confirmPassphraseButton.textContent = confirmLabel;
    passphrasePrompt.hidden = false;
    popupPassphrase.focus();
}

(document.getElementById('cancelPassphraseButton') as HTMLButtonElement).addEventListener('click', () => {
    passphrasePrompt.hidden = true;
    pendingProtectedAction = null;
});

popupPassphrase.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        confirmPassphraseButton.click();
    } else if (event.key === 'Escape') {
        event.preventDefault();
        (document.getElementById('cancelPassphraseButton') as HTMLButtonElement).click();
    }
});

confirmPassphraseButton.addEventListener('click', async () => {
    if (await verifyPassphrase(popupPassphrase.value, passphraseProtection)) {
        passphrasePrompt.hidden = true;
        const action = pendingProtectedAction;
        pendingProtectedAction = null;
        action?.();
    } else {
        popupPassphraseStatus.textContent = 'Incorrect password.';
    }
});

pauseButtons.forEach((button) => {
    button.addEventListener('click', () => {
        const minutes = Number(button.dataset.pauseMinutes);
        if (!Number.isFinite(minutes) || minutes <= 0) return;
        if (passphraseProtection) {
            requestPassphrase(
                `Enter your password to pause blocking for ${minutes} minutes.`,
                `Pause for ${minutes} minutes`,
                () => startTemporaryPause(minutes)
            );
        } else {
            startTemporaryPause(minutes);
        }
    });
});

function startTemporaryPause(minutes: number) {
    pausedUntil = Date.now() + minutes * 60_000;
    pauseUsage = incrementDailyPauseUsage(pauseUsage);
    pauseNudgeMessage = normalizeDailyPauseUsage(pauseUsage).count >= 4
        ? getRandomItem(PAUSE_NUDGES) || ''
        : '';
    chrome.storage.local.set({
        [STORAGE_KEYS.pausedUntil]: pausedUntil,
        [STORAGE_KEYS.pauseUsage]: pauseUsage,
    });
    renderBlockingState();
}

resumeButton?.addEventListener('click', () => {
    pausedUntil = 0;
    chrome.storage.local.set({[STORAGE_KEYS.pausedUntil]: 0});
    renderBlockingState();
});

openOptionsButton?.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
});

window.addEventListener('unload', stopCountdown);
