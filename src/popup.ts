import {normalizeStatistics, STORAGE_KEYS} from './helper/extensionState';

const enabledToggle = document.getElementById('enabledToggle') as HTMLInputElement;
const statusText = document.getElementById('statusText');
const activeRules = document.getElementById('activeRules');
const blockedToday = document.getElementById('blockedToday');
const blockedTotal = document.getElementById('blockedTotal');
const openOptionsButton = document.getElementById('openOptionsButton');

function renderEnabled(enabled: boolean) {
    enabledToggle.checked = enabled;
    if (statusText) {
        statusText.textContent = enabled ? 'Blocking is on' : 'Blocking is paused';
        statusText.classList.toggle('paused', !enabled);
    }
}

chrome.storage.local.get(
    { [STORAGE_KEYS.enabled]: true, [STORAGE_KEYS.blocked]: [], [STORAGE_KEYS.statistics]: {} },
    (data) => {
        const enabled = data[STORAGE_KEYS.enabled] !== false;
        const blocked: Array<{enabled?: boolean}> = Array.isArray(data[STORAGE_KEYS.blocked])
            ? data[STORAGE_KEYS.blocked] as Array<{enabled?: boolean}>
            : [];
        const statistics = normalizeStatistics(data[STORAGE_KEYS.statistics]);
        renderEnabled(enabled);
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
    const enabled = enabledToggle.checked;
    chrome.storage.local.set({ [STORAGE_KEYS.enabled]: enabled });
    renderEnabled(enabled);
});

openOptionsButton?.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
});
