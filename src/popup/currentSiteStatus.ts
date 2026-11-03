import {BlockedEntry, normalizeBlockedEntry} from '../helper/blockedEntry';
import {normalizePausedUntil} from '../helper/extensionState';
import {isScheduleActive, normalizeRules} from '../helper/schedules';

type BlockingAvailability = {blockingEnabled: boolean; pausedUntil: number};

export function createCurrentSiteStatus(
    getAvailability: () => BlockingAvailability
) {
    const panel = document.getElementById('currentSiteStatus');
    const siteName = document.getElementById('currentSiteName');
    const ruleStatus = document.getElementById('currentSiteRuleStatus');
    let rules: BlockedEntry[] = [];
    let currentUrl = '';

    function refresh(now = Date.now()) {
        if (!panel || !siteName || !ruleStatus || !currentUrl) return;
        const domain = normalizeBlockedEntry(currentUrl, 'domain');
        const exactUrl = normalizeBlockedEntry(currentUrl, 'url');
        if (!domain || !exactUrl) {
            panel.hidden = true;
            return;
        }

        const rule = findMatchingRule(rules, domain.name, exactUrl.name, new Date(now));
        siteName.textContent = domain.name;
        siteName.title = domain.name;
        ruleStatus.className = '';
        if (!rule) {
            ruleStatus.textContent = 'Not in your blocking list';
            ruleStatus.classList.add('unmatched');
        } else {
            const ruleType = (rule.scope || 'domain') === 'url' ? 'Full URL blocking' : 'Domain blocking';
            const availability = getAvailability();
            if (!rule.enabled) {
                ruleStatus.textContent = 'Blocking for this website is turned off.';
                ruleStatus.classList.add('inactive');
            } else if (!availability.blockingEnabled) {
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
        panel.hidden = false;
    }

    function load(value: unknown) {
        if (!panel) return;
        rules = normalizeRules(value);
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            currentUrl = tabs[0]?.url || '';
            refresh();
        });
    }

    return {load, refresh};
}

function findMatchingRule(
    rules: BlockedEntry[],
    domain: string,
    exactUrl: string,
    date: Date
): BlockedEntry | undefined {
    const exactRule = rules.find((rule) => (rule.scope || 'domain') === 'url' && rule.name === exactUrl);
    const domainRule = rules.find((rule) => (rule.scope || 'domain') === 'domain' && rule.name === domain);
    const matches = [exactRule, domainRule].filter((rule): rule is BlockedEntry => Boolean(rule));
    return matches.find((rule) => rule.enabled && isScheduleActive(rule.schedule, date))
        || matches.find((rule) => rule.enabled)
        || matches[0];
}
