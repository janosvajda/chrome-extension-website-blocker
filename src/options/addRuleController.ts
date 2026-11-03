import {
    BlockScope,
    NormalizedBlockedEntry,
    blockedEntryCovers,
    normalizeBlockedEntry,
    requiresBlockScopeChoice,
} from '../helper/blockedEntry';
import {normalizePausedUntil} from '../helper/extensionState';
import {normalizeRuleSchedule} from '../helper/schedules';
import {formatSchedule, ScheduledRule} from './scheduleEditor';

interface AddRuleOptions {
    getRules: () => ScheduledRule[];
    addRule: (rule: NormalizedBlockedEntry) => boolean;
}

export function createAddRuleController({getRules, addRule}: AddRuleOptions): void {
    const form = document.getElementById('addWebsite') as HTMLFormElement;
    const input = document.getElementById('newWebsite') as HTMLInputElement;
    const status = document.getElementById('addWebsiteStatus');
    const scopeDialog = document.getElementById('blockScopeDialog') as HTMLElement;
    const scopeValue = document.getElementById('blockScopeValue') as HTMLElement;
    const cancelScopeButton = document.getElementById('cancelBlockScopeButton') as HTMLButtonElement;
    const blockDomainButton = document.getElementById('blockDomainButton') as HTMLButtonElement;
    const blockUrlButton = document.getElementById('blockUrlButton') as HTMLButtonElement;
    const resultDialog = document.getElementById('addWebsiteErrorDialog') as HTMLElement;
    const resultTitle = document.getElementById('addWebsiteErrorTitle') as HTMLElement;
    const resultMessage = document.getElementById('addWebsiteErrorMessage') as HTMLElement;

    let pendingWebsiteInput: string | null = null;

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        const websiteName = input.value.toString().trim();
        const normalized = normalizeBlockedEntry(websiteName, 'domain');
        if (!websiteName || !normalized) {
            showStatus('Enter a valid website, such as example.com or https://example.co.uk.', true);
            return;
        }
        if (requiresBlockScopeChoice(websiteName)) {
            pendingWebsiteInput = websiteName;
            scopeValue.textContent = websiteName;
            scopeDialog.hidden = false;
            return;
        }
        addWithBlockingWarning(normalized);
    });

    function closeScopeDialog(): void {
        scopeDialog.hidden = true;
        pendingWebsiteInput = null;
    }

    function addPendingWebsite(scope: BlockScope): void {
        if (!pendingWebsiteInput) return;
        const websiteName = pendingWebsiteInput;
        closeScopeDialog();
        addWithBlockingWarning(normalizeBlockedEntry(websiteName, scope) as NormalizedBlockedEntry);
    }

    function addWithBlockingWarning(normalized: NormalizedBlockedEntry): void {
        chrome.storage.local.get({enabled: true, pausedUntil: 0}, (data) => {
            const scheduledCoverage = getRules().filter((entry) =>
                entry.enabled
                && Boolean(normalizeRuleSchedule(entry.schedule))
                && blockedEntryCovers(entry, normalized)
            ).sort((first, second) => second.name.length - first.name.length)[0];
            if (scheduledCoverage) {
                showStatus(
                    `This website is already covered by scheduled blocking for ${scheduledCoverage.name}: ${formatSchedule(scheduledCoverage.schedule)}.`,
                    true,
                );
                return;
            }
            if (!addRule(normalized)) {
                showStatus('This website is already covered by an existing rule.', true);
                return;
            }
            input.value = '';
            if (data.enabled === false) {
                showWarning('The website was added, but blocking is currently off. Turn blocking on for the rule to take effect.');
            } else if (normalizePausedUntil(data.pausedUntil) > 0) {
                showWarning('The website was added, but blocking is temporarily paused. Resume blocking for the rule to take effect.');
            } else {
                showStatus('Website added.');
            }
        });
    }

    function showStatus(message: string, isError = false): void {
        input.setAttribute('aria-invalid', String(isError));
        if (status) {
            status.textContent = isError ? '' : message;
            status.classList.toggle('error', isError);
        }
        if (isError) {
            resultTitle.textContent = 'Website not added';
            resultMessage.textContent = message;
            resultDialog.hidden = false;
            (document.getElementById('closeAddWebsiteErrorButton') as HTMLButtonElement).focus();
        }
    }

    function showWarning(message: string): void {
        input.setAttribute('aria-invalid', 'false');
        resultTitle.textContent = 'Website added';
        resultMessage.textContent = message;
        resultDialog.hidden = false;
        (document.getElementById('closeAddWebsiteErrorButton') as HTMLButtonElement).focus();
    }

    cancelScopeButton.addEventListener('click', closeScopeDialog);
    blockDomainButton.addEventListener('click', () => addPendingWebsite('domain'));
    blockUrlButton.addEventListener('click', () => addPendingWebsite('url'));
    document.getElementById('closeAddWebsiteErrorButton')?.addEventListener('click', () => {
        resultDialog.hidden = true;
        input.focus();
    });
}
