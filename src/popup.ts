import {
    getRemainingPauseMinutes,
    incrementDailyPauseUsage,
    normalizeDailyPauseUsage,
    normalizePausedUntil,
    normalizeStatistics,
    STORAGE_KEYS,
    DailyPauseUsage,
} from './helper/extensionState';
import {getRandomItem} from './helper/getRandomItem';
import {normalizePassphraseProtection, PassphraseProtection} from './helper/passphraseProtection';
import {createPassphrasePrompt} from './popup/passphrasePrompt';

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
let blockingEnabled = true;
let pausedUntil = 0;
let pauseUsage: DailyPauseUsage = normalizeDailyPauseUsage({});
let pauseNudgeMessage = '';
let countdownTimer: ReturnType<typeof setInterval> | undefined;
let passphraseProtection: PassphraseProtection | null = null;
const passphrasePrompt = createPassphrasePrompt(() => passphraseProtection);

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
        return;
    }
}

function refreshBlockingState(now = Date.now()) {
    const activePausedUntil = blockingEnabled ? normalizePausedUntil(pausedUntil, now) : 0;
    if (blockingEnabled && pausedUntil && !activePausedUntil) {
        pausedUntil = 0;
        chrome.storage.local.set({[STORAGE_KEYS.pausedUntil]: 0});
    }
    renderBlockingState(now);
    if (activePausedUntil && !countdownTimer) {
        countdownTimer = setInterval(() => refreshBlockingState(), 1_000);
    } else if (!activePausedUntil && countdownTimer) {
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
        const statistics = normalizeStatistics(data[STORAGE_KEYS.statistics]);
        refreshBlockingState();
        setText(activeRules, countActiveRules(data[STORAGE_KEYS.blocked]));
        setText(blockedToday, statistics.today);
        setText(blockedTotal, statistics.total);
    }
);

enabledToggle.addEventListener('change', () => {
    if (!enabledToggle.checked && passphraseProtection) {
        enabledToggle.checked = true;
        passphrasePrompt.request(
            'Enter your confirmation phrase to turn blocking off.',
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
        recordPause();
        values[STORAGE_KEYS.pauseUsage] = pauseUsage;
    } else {
        pauseNudgeMessage = '';
    }
    chrome.storage.local.set(values);
    refreshBlockingState();
}

pauseButtons.forEach((button) => {
    button.addEventListener('click', () => {
        const minutes = Number(button.dataset.pauseMinutes);
        if (!Number.isFinite(minutes) || minutes <= 0) return;
        if (passphraseProtection) {
            passphrasePrompt.request(
                `Enter your confirmation phrase to pause blocking for ${minutes} minutes.`,
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
    recordPause();
    chrome.storage.local.set({
        [STORAGE_KEYS.pausedUntil]: pausedUntil,
        [STORAGE_KEYS.pauseUsage]: pauseUsage,
    });
    refreshBlockingState();
}

function recordPause() {
    pauseUsage = incrementDailyPauseUsage(pauseUsage);
    pauseNudgeMessage = pauseUsage.count >= 4 ? getRandomItem(PAUSE_NUDGES) || '' : '';
}

function countActiveRules(value: unknown): number {
    if (!Array.isArray(value)) return 0;
    return value.filter((entry) => isRecord(entry) && entry.enabled === true).length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function setText(element: HTMLElement | null, value: string | number) {
    if (element) element.textContent = String(value);
}

resumeButton?.addEventListener('click', () => {
    pausedUntil = 0;
    chrome.storage.local.set({[STORAGE_KEYS.pausedUntil]: 0});
    refreshBlockingState();
});

openOptionsButton?.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
});

window.addEventListener('unload', () => {
    if (countdownTimer) clearInterval(countdownTimer);
});
