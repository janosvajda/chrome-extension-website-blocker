import {BlockedEntry, hostnameMatchesDomain, normalizeBlockedEntry} from '../helper/blockedEntry';
import type {AddCurrentSiteDomainRuleResponse} from '../helper/backgroundMessages';
import {normalizePausedUntil} from '../helper/extensionState';
import {isScheduleActive, normalizeRules} from '../helper/schedules';

type BlockingAvailability = {blockingEnabled: boolean; pausedUntil: number};
type AddCurrentSiteDomainRule = (
    tabId: number,
    url: string,
    done: (response: AddCurrentSiteDomainRuleResponse) => void,
) => void;

export function createCurrentSiteStatus(
    getAvailability: () => BlockingAvailability,
    addCurrentSiteDomainRule?: AddCurrentSiteDomainRule,
) {
    const panel = document.getElementById('currentSiteStatus');
    const siteName = document.getElementById('currentSiteName');
    const ruleStatus = document.getElementById('currentSiteRuleStatus');
    const addButton = document.getElementById('blockCurrentSiteButton') as HTMLButtonElement | null;
    let rules: BlockedEntry[] = [];
    let currentTabId: number | null = null;
    let currentUrl = '';
    let additionState: 'idle' | 'adding' | 'added' | 'error' = 'idle';
    let additionOutcome: 'added' | 'updated' | 'existing' = 'added';
    let reloadOutcome: 'started' | 'skipped' | 'failed' = 'skipped';

    function refresh(now = Date.now()) {
        if (!panel || !siteName || !ruleStatus || !currentUrl) return;
        const domain = normalizeBlockedEntry(currentUrl, 'domain');
        const exactUrl = normalizeBlockedEntry(currentUrl, 'url');
        if (!domain || !exactUrl) {
            panel.hidden = true;
            if (addButton) addButton.hidden = true;
            return;
        }

        const rule = findMatchingRule(rules, domain.name, exactUrl.name, new Date(now));
        siteName.textContent = domain.name;
        siteName.title = domain.name;
        ruleStatus.className = '';
        if (!rule) {
            if (additionState === 'adding') {
                ruleStatus.textContent = 'Adding to your blocking list…';
                ruleStatus.classList.add('scheduled');
            } else if (additionState === 'error') {
                ruleStatus.textContent = 'Could not add this website. Please try again.';
                ruleStatus.classList.add('error');
            } else {
                ruleStatus.textContent = 'Not in your blocking list';
                ruleStatus.classList.add('unmatched');
            }
            if (addButton) {
                addButton.hidden = !addCurrentSiteDomainRule || currentTabId === null;
                addButton.disabled = additionState === 'adding';
            }
        } else {
            if (addButton) addButton.hidden = true;
            const availability = getAvailability();
            if (additionState === 'added') {
                if (!availability.blockingEnabled) {
                    ruleStatus.textContent = 'Added to your blocking list. Tiny Website Blocker is currently off.';
                    ruleStatus.classList.add('inactive');
                } else if (normalizePausedUntil(availability.pausedUntil, now) > 0) {
                    ruleStatus.textContent = 'Added to your blocking list. Blocking is temporarily paused.';
                    ruleStatus.classList.add('inactive');
                } else if (additionOutcome === 'existing') {
                    ruleStatus.textContent = 'This website is already in your blocking list.';
                    ruleStatus.classList.add('active');
                } else if (reloadOutcome === 'started') {
                    ruleStatus.textContent = 'Added to your blocking list. Reloading this page now.';
                    ruleStatus.classList.add('active');
                } else {
                    ruleStatus.textContent = 'Added to your blocking list. Reload this page to apply it.';
                    ruleStatus.classList.add('active');
                }
            } else if (!rule.enabled) {
                ruleStatus.textContent = 'Blocking for this website is turned off.';
                ruleStatus.classList.add('inactive');
            } else {
                const ruleType = (rule.scope || 'domain') === 'url' ? 'Full URL blocking' : 'Domain blocking';
                if (!availability.blockingEnabled) {
                    ruleStatus.textContent = `${ruleType} · Extension is off`;
                    ruleStatus.classList.add('inactive');
                } else if (normalizePausedUntil(availability.pausedUntil, now) > 0) {
                    ruleStatus.textContent = `${ruleType} · Blocking is paused`;
                    ruleStatus.classList.add('inactive');
                } else if (rule.schedule && !isScheduleActive(rule.schedule, new Date(now))) {
                    ruleStatus.textContent = 'Scheduled blocking · Available now';
                    ruleStatus.classList.add('scheduled');
                } else {
                    ruleStatus.textContent = `${ruleType} · Active now`;
                    ruleStatus.classList.add('active');
                }
            }
        }
        panel.hidden = false;
    }

    function load(value: unknown) {
        if (!panel) return;
        rules = normalizeRules(value);
        additionState = 'idle';
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            currentTabId = Number.isInteger(tabs[0]?.id) ? tabs[0].id! : null;
            currentUrl = tabs[0]?.url || '';
            refresh();
        });
    }

    addButton?.addEventListener('click', () => {
        if (!addCurrentSiteDomainRule || currentTabId === null || !currentUrl || additionState === 'adding') return;
        additionState = 'adding';
        refresh();
        addCurrentSiteDomainRule(currentTabId, currentUrl, (response) => {
            if (!response.ok) {
                additionState = 'error';
                refresh();
                return;
            }
            rules = normalizeRules(response.blocked);
            additionOutcome = response.outcome;
            reloadOutcome = response.reload;
            additionState = 'added';
            refresh();
        });
    });

    return {load, refresh};
}

function findMatchingRule(
    rules: BlockedEntry[],
    domain: string,
    exactUrl: string,
    date: Date
): BlockedEntry | undefined {
    const exactRule = rules.find((rule) => (rule.scope || 'domain') === 'url' && rule.name === exactUrl);
    const domainRules = rules.filter((rule) =>
        (rule.scope || 'domain') === 'domain' && hostnameMatchesDomain(domain, rule.name)
    ).sort((first, second) => second.name.length - first.name.length);
    const matches = [exactRule, ...domainRules].filter((rule): rule is BlockedEntry => Boolean(rule));
    return matches.find((rule) => rule.enabled && isScheduleActive(rule.schedule, date))
        || matches.find((rule) => rule.enabled)
        || matches[0];
}
