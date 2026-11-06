import {BlockedEntry, RuleSchedule, hostnameMatchesDomain, normalizeBlockedEntry} from '../helper/blockedEntry';
import type {AddCurrentSiteRuleResponse, EnableCurrentSiteRuleResponse} from '../helper/backgroundMessages';
import {normalizePausedUntil} from '../helper/extensionState';
import {formatSchedule, isScheduleActive, normalizeRules} from '../helper/schedules';

type BlockingAvailability = {blockingEnabled: boolean; pausedUntil: number};
type AddCurrentSiteRule = (
    tabId: number,
    url: string,
    done: (response: AddCurrentSiteRuleResponse) => void,
) => void;
type EnableCurrentSiteRule = (
    tabId: number,
    url: string,
    rule: Pick<BlockedEntry, 'name' | 'scope'>,
    done: (response: EnableCurrentSiteRuleResponse) => void,
) => void;

export function createCurrentSiteStatus(
    getAvailability: () => BlockingAvailability,
    addCurrentSiteRule?: AddCurrentSiteRule,
    enableCurrentSiteRule?: EnableCurrentSiteRule,
) {
    const panel = document.getElementById('currentSiteStatus');
    const siteName = document.getElementById('currentSiteName');
    const ruleStatus = document.getElementById('currentSiteRuleStatus');
    const addButton = document.getElementById('blockCurrentSiteButton') as HTMLButtonElement | null;
    const enableButton = document.getElementById('enableCurrentSiteRuleButton') as HTMLButtonElement | null;
    let rules: BlockedEntry[] = [];
    let currentTabId: number | null = null;
    let currentUrl = '';
    let additionState: 'idle' | 'adding' | 'added' | 'error' = 'idle';
    let additionOutcome: 'added' | 'updated' | 'existing' = 'added';
    let reloadOutcome: 'started' | 'skipped' | 'failed' = 'skipped';
    let enableState: 'idle' | 'enabling' | 'enabled' | 'error' = 'idle';
    let currentRule: BlockedEntry | null = null;

    function refresh(now = Date.now()) {
        if (!panel || !siteName || !ruleStatus || !currentUrl) return;
        const domain = normalizeBlockedEntry(currentUrl, 'domain');
        const exactUrl = normalizeBlockedEntry(currentUrl, 'url');
        if (!domain || !exactUrl) {
            panel.hidden = true;
            if (addButton) addButton.hidden = true;
            if (enableButton) enableButton.hidden = true;
            return;
        }

        const rule = findMatchingRule(rules, domain.name, exactUrl.name, new Date(now));
        currentRule = rule || null;
        siteName.textContent = domain.name;
        siteName.title = domain.name;
        ruleStatus.className = '';
        if (!rule) {
            if (enableButton) enableButton.hidden = true;
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
                addButton.hidden = !addCurrentSiteRule || currentTabId === null;
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
                if (enableState === 'enabling') {
                    ruleStatus.textContent = 'Enabling blocking for this website…';
                    ruleStatus.classList.add('scheduled');
                } else if (enableState === 'error') {
                    ruleStatus.textContent = 'Could not enable blocking. Please try again.';
                    ruleStatus.classList.add('error');
                } else {
                    ruleStatus.textContent = 'A block exists for this website, but it is disabled.';
                    ruleStatus.classList.add('inactive');
                }
                if (enableButton) {
                    enableButton.hidden = !enableCurrentSiteRule || currentTabId === null;
                    enableButton.disabled = enableState === 'enabling';
                }
            } else {
                if (enableButton) enableButton.hidden = true;
                const ruleType = (rule.scope || 'domain') === 'url' ? 'Full URL blocking' : 'Domain blocking';
                if (enableState === 'enabled' && !availability.blockingEnabled) {
                    ruleStatus.textContent = 'Blocking is enabled for this website. Tiny Website Blocker is currently off.';
                    ruleStatus.classList.add('inactive');
                } else if (enableState === 'enabled' && normalizePausedUntil(availability.pausedUntil, now) > 0) {
                    ruleStatus.textContent = 'Blocking is enabled for this website. Blocking is temporarily paused.';
                    ruleStatus.classList.add('inactive');
                } else if (enableState === 'enabled' && rule.schedule && !isScheduleActive(rule.schedule, new Date(now))) {
                    showAvailableSchedule(ruleStatus, rule.schedule);
                } else if (enableState === 'enabled' && reloadOutcome === 'started') {
                    ruleStatus.textContent = 'Blocking enabled. Reloading this page now.';
                    ruleStatus.classList.add('active');
                } else if (enableState === 'enabled') {
                    ruleStatus.textContent = 'Blocking enabled. Reload this page to apply it.';
                    ruleStatus.classList.add('active');
                } else if (!availability.blockingEnabled) {
                    ruleStatus.textContent = `${ruleType} · Extension is off`;
                    ruleStatus.classList.add('inactive');
                } else if (normalizePausedUntil(availability.pausedUntil, now) > 0) {
                    ruleStatus.textContent = `${ruleType} · Blocking is paused`;
                    ruleStatus.classList.add('inactive');
                } else if (rule.schedule && !isScheduleActive(rule.schedule, new Date(now))) {
                    showAvailableSchedule(ruleStatus, rule.schedule);
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
        enableState = 'idle';
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            currentTabId = Number.isInteger(tabs[0]?.id) ? tabs[0].id! : null;
            currentUrl = tabs[0]?.url || '';
            refresh();
        });
    }

    addButton?.addEventListener('click', () => {
        if (!addCurrentSiteRule || currentTabId === null || !currentUrl || additionState === 'adding') return;
        additionState = 'adding';
        refresh();
        addCurrentSiteRule(currentTabId, currentUrl, (response) => {
            if (response.ok === false) {
                additionState = response.cancelled ? 'idle' : 'error';
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

    enableButton?.addEventListener('click', () => {
        if (!enableCurrentSiteRule || currentTabId === null || !currentUrl
            || !currentRule || currentRule.enabled || enableState === 'enabling') return;
        const rule = {name: currentRule.name, scope: currentRule.scope || 'domain'};
        enableState = 'enabling';
        refresh();
        enableCurrentSiteRule(currentTabId, currentUrl, rule, (response) => {
            if (response.ok === false) {
                enableState = response.cancelled ? 'idle' : 'error';
                refresh();
                return;
            }
            rules = normalizeRules(response.blocked);
            reloadOutcome = response.reload;
            enableState = 'enabled';
            refresh();
        });
    });

    return {load, refresh};
}

function showAvailableSchedule(ruleStatus: HTMLElement, schedule: RuleSchedule): void {
    const scheduleDetails = document.createElement('span');
    scheduleDetails.className = 'scheduleDetails';
    scheduleDetails.textContent = `Scheduled blocking: ${formatSchedule(schedule)}`;
    const availability = document.createElement('span');
    availability.className = 'availableNow';
    availability.textContent = 'Available now';
    ruleStatus.replaceChildren(scheduleDetails, availability);
    ruleStatus.classList.add('scheduled');
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
