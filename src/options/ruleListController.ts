import {
    CoveredUrlRuleAction,
    CoveredUrlRuleInfo,
    NormalizedBlockedEntry,
    applyCoveredUrlRuleAction,
    findCoveredUrlRules,
    getCoveredUrlRuleInfo,
    isBlockedEntryCovered,
    normalizeBlockedEntry,
    sameCoveredUrlRuleInfo,
} from '../helper/blockedEntry';
import {showCoveredUrlRulesDialog} from '../background/dialogs';
import {formatSchedule, ScheduledRule} from './scheduleEditor';
import {sortBlockedEntries} from './ruleSync';

interface RuleListOptions {
    getRules: () => ScheduledRule[];
    replaceRules: (rules: ScheduledRule[]) => void;
    persistRules: (onPersisted?: () => void) => void;
    openSchedule: (index: number) => void;
}

export function createRuleListController({
    getRules,
    replaceRules,
    persistRules,
    openSchedule,
}: RuleListOptions) {
    const websiteList = document.getElementById('websiteList') as HTMLElement;
    const prevPageButton = document.getElementById('prevPageButton') as HTMLButtonElement | null;
    const nextPageButton = document.getElementById('nextPageButton') as HTMLButtonElement | null;
    const pageNumbers = document.getElementById('pageNumbers');
    const pageInfo = document.getElementById('pageInfo');
    const deleteDialog = document.getElementById('deleteConfirmationDialog') as HTMLElement;
    const deleteRuleValue = document.getElementById('deleteRuleValue') as HTMLElement;
    const cancelDeleteButton = document.getElementById('cancelDeleteButton') as HTMLButtonElement;
    const confirmDeleteButton = document.getElementById('confirmDeleteButton') as HTMLButtonElement;
    const ruleSearch = document.getElementById('ruleSearch') as HTMLInputElement;
    const ruleFilter = document.getElementById('ruleFilter') as HTMLSelectElement;
    const clearSearchButton = document.getElementById('clearRuleSearchButton') as HTMLButtonElement;
    const clearFiltersButton = document.getElementById('clearRuleFiltersButton') as HTMLButtonElement;
    const resultsCount = document.getElementById('ruleResultsCount') as HTMLElement;
    const emptyState = document.getElementById('ruleEmptyState') as HTMLElement;
    const emptyTitle = document.getElementById('ruleEmptyTitle') as HTMLElement;
    const emptyDescription = document.getElementById('ruleEmptyDescription') as HTMLElement;
    const listHeader = document.getElementById('websiteListHeader') as HTMLElement;
    const pagination = document.getElementById('pagination') as HTMLElement;

    const pageSize = 5;
    let currentPage = 1;
    let pendingDeleteEntry: NormalizedBlockedEntry | null = null;

    function render(page = currentPage): void {
        websiteList.querySelectorAll('.websiteItem').forEach((item) => item.remove());

        const rules = getRules();
        const query = ruleSearch.value.trim().toLowerCase();
        const filteredRules = rules.filter((rule) =>
            rule.name.toLowerCase().includes(query) && matchesFilter(rule)
        );
        const hasFilters = Boolean(query) || ruleFilter.value !== 'all';
        clearSearchButton.hidden = !ruleSearch.value;
        clearFiltersButton.hidden = !hasFilters;
        resultsCount.textContent = hasFilters
            ? `${filteredRules.length} of ${rules.length} rules`
            : `${rules.length} ${rules.length === 1 ? 'rule' : 'rules'}`;
        emptyState.hidden = filteredRules.length > 0;
        listHeader.hidden = filteredRules.length === 0;
        emptyTitle.textContent = rules.length ? 'No matching rules' : 'No rules yet';
        emptyDescription.textContent = rules.length
            ? 'Try a different search or clear your filters.'
            : 'Add your first website below to get started.';

        const totalPages = Math.max(1, Math.ceil(filteredRules.length / pageSize));
        currentPage = Math.min(Math.max(1, page), totalPages);
        const startIndex = (currentPage - 1) * pageSize;
        websiteList.scrollTop = 0;
        filteredRules
            .slice(startIndex, startIndex + pageSize)
            .forEach(createWebsiteItem);

        pagination.hidden = totalPages <= 1;
        renderPagination(totalPages);
    }

    function resetFilters(): void {
        ruleSearch.value = '';
        ruleFilter.value = 'all';
        render(1);
    }

    function addRule(
        normalized: NormalizedBlockedEntry,
        coveredUrlAction?: CoveredUrlRuleAction,
    ): boolean {
        const rules = getRules();
        if (isBlockedEntryCovered(rules, normalized)) return false;
        const coveredUrls = findCoveredUrlRules(rules, normalized);
        if (coveredUrls.length && !coveredUrlAction) return false;
        const resolvedRules = coveredUrlAction
            ? applyCoveredUrlRuleAction(rules, normalized, coveredUrlAction)
            : rules;
        replaceRules(sortBlockedEntries([
            ...resolvedRules,
            {name: normalized.name, scope: normalized.scope, enabled: true},
        ]));
        persistRules();
        resetFilters();
        return true;
    }

    function createWebsiteItem(rule: ScheduledRule): void {
        const normalizedRule = normalizeBlockedEntry(rule.name, rule.scope);
        if (!normalizedRule) return;

        const item = document.createElement('div');
        item.className = 'websiteItem';
        item.setAttribute('data-scope', normalizedRule.scope);

        const details = document.createElement('div');
        details.className = 'websiteDetails';
        const name = document.createElement('div');
        name.className = 'websiteName';
        name.textContent = normalizedRule.name;
        const scheduleSummary = document.createElement('div');
        scheduleSummary.className = 'websiteSchedule';
        if (rule.schedule) {
            scheduleSummary.classList.add('scheduled');
            const scheduleBadge = document.createElement('span');
            scheduleBadge.className = 'scheduleStatusBadge';
            scheduleBadge.textContent = 'Scheduled';
            scheduleSummary.appendChild(scheduleBadge);
            scheduleSummary.append(` ${formatSchedule(rule.schedule)}`);
        } else {
            scheduleSummary.textContent = 'Always';
        }
        details.append(name, scheduleSummary);

        const scope = document.createElement('span');
        scope.className = 'websiteScope';
        scope.textContent = normalizedRule.scope === 'url' ? 'URL' : 'Domain';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'websiteCheckbox';
        checkbox.checked = rule.enabled;
        checkbox.setAttribute('aria-label', `Block ${normalizedRule.name}`);

        const scheduleButton = document.createElement('button');
        const scheduleLabel = rule.schedule ? 'Edit schedule' : 'Add schedule';
        scheduleButton.className = 'iconButton scheduleButton';
        scheduleButton.classList.toggle('hasSchedule', Boolean(rule.schedule));
        scheduleButton.textContent = '🗓';
        scheduleButton.setAttribute('aria-label', scheduleLabel);
        scheduleButton.title = scheduleLabel;
        scheduleButton.addEventListener('click', () => {
            const index = findRuleIndex(normalizedRule);
            if (index >= 0) openSchedule(index);
        });

        checkbox.addEventListener('change', () => {
            updateRuleEnabled(normalizedRule, checkbox.checked, checkbox);
        });

        const deleteButton = document.createElement('button');
        deleteButton.className = 'iconButton deleteButton';
        deleteButton.textContent = '🗑';
        deleteButton.setAttribute('aria-label', 'Delete');
        deleteButton.title = 'Delete rule';
        deleteButton.addEventListener('click', () => {
            pendingDeleteEntry = normalizedRule;
            deleteRuleValue.textContent = normalizedRule.name;
            deleteDialog.hidden = false;
        });

        item.append(details, scope, checkbox, scheduleButton, deleteButton);
        websiteList.appendChild(item);
    }

    function updateRuleEnabled(
        entry: NormalizedBlockedEntry,
        enabled: boolean,
        control: HTMLInputElement,
        coveredUrlAction?: CoveredUrlRuleAction,
        expectedCoveredUrls?: CoveredUrlRuleInfo[],
    ): void {
        const rules = getRules();
        const index = findRuleIndex(entry);
        if (index < 0) return;
        const currentRule = rules[index];
        if (currentRule.enabled === enabled) {
            control.checked = enabled;
            return;
        }
        const coveredUrlState = enabled
            ? getCoveredUrlRuleInfo(rules, entry)
            : [];
        const conflictChanged = coveredUrlAction
            && !sameCoveredUrlRuleInfo(coveredUrlState, expectedCoveredUrls || []);
        if (coveredUrlState.length && (!coveredUrlAction || conflictChanged)) {
            control.checked = currentRule.enabled;
            showCoveredUrlRulesDialog(entry.name, coveredUrlState).then((action) => {
                if (action) updateRuleEnabled(entry, enabled, control, action, coveredUrlState);
                else control.focus();
            });
            return;
        }
        const resolvedRules = coveredUrlAction
            ? applyCoveredUrlRuleAction(rules, entry, coveredUrlAction)
            : rules;
        const resolvedIndex = resolvedRules.findIndex((candidate) =>
            candidate.name === entry.name && candidate.scope === entry.scope
        );
        resolvedRules[resolvedIndex] = {...resolvedRules[resolvedIndex], enabled};
        replaceRules(resolvedRules);
        control.checked = enabled;
        if (coveredUrlAction === 'delete' || coveredUrlAction === 'disable') {
            persistRules(() => {
                render();
                (findRuleCheckbox(entry) || ruleFilter).focus();
            });
            return;
        }
        persistRules();
        if (ruleFilter.value === 'enabled' || ruleFilter.value === 'disabled') {
            const visibleIndex = Array.from(websiteList.querySelectorAll('.websiteCheckbox')).indexOf(control);
            render();
            const visibleCheckboxes = websiteList.querySelectorAll<HTMLInputElement>('.websiteCheckbox');
            (visibleCheckboxes[Math.min(visibleIndex, visibleCheckboxes.length - 1)] || ruleFilter).focus();
        }
    }

    function findRuleCheckbox(entry: NormalizedBlockedEntry): HTMLInputElement | null {
        const row = [...websiteList.querySelectorAll<HTMLElement>('.websiteItem')].find((item) =>
            item.getAttribute('data-scope') === entry.scope
            && item.querySelector('.websiteName')?.textContent === entry.name
        );
        return row?.querySelector<HTMLInputElement>('.websiteCheckbox') || null;
    }

    function findRuleIndex(rule: NormalizedBlockedEntry): number {
        return getRules().findIndex((entry) =>
            entry.name === rule.name && entry.scope === rule.scope
        );
    }

    function matchesFilter(entry: ScheduledRule): boolean {
        switch (ruleFilter.value) {
            case 'enabled': return entry.enabled;
            case 'disabled': return !entry.enabled;
            case 'scheduled': return Boolean(entry.schedule);
            case 'unscheduled': return !entry.schedule;
            case 'domain': return entry.scope === 'domain';
            case 'url': return entry.scope === 'url';
            default: return true;
        }
    }

    function renderPagination(totalPages: number): void {
        if (prevPageButton) {
            prevPageButton.disabled = currentPage <= 1;
            prevPageButton.onclick = () => render(currentPage - 1);
        }
        if (nextPageButton) {
            nextPageButton.disabled = currentPage >= totalPages;
            nextPageButton.onclick = () => render(currentPage + 1);
        }
        if (pageNumbers) {
            pageNumbers.innerHTML = '';
            for (let page = 1; page <= totalPages; page += 1) {
                const button = document.createElement('button');
                button.textContent = page.toString();
                button.setAttribute('aria-label', `Page ${page}`);
                if (page === currentPage) {
                    button.classList.add('active');
                    button.setAttribute('aria-current', 'page');
                }
                button.addEventListener('click', () => render(page));
                pageNumbers.appendChild(button);
            }
        }
        if (pageInfo) pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    }

    ruleSearch.addEventListener('input', () => render(1));
    ruleFilter.addEventListener('change', () => render(1));
    clearSearchButton.addEventListener('click', () => {
        ruleSearch.value = '';
        render(1);
        ruleSearch.focus();
    });
    clearFiltersButton.addEventListener('click', () => {
        resetFilters();
        ruleSearch.focus();
    });
    cancelDeleteButton.addEventListener('click', () => {
        pendingDeleteEntry = null;
        deleteDialog.hidden = true;
    });
    confirmDeleteButton.addEventListener('click', () => {
        if (!pendingDeleteEntry) return;
        const entryToDelete = pendingDeleteEntry;
        replaceRules(getRules().filter((entry) =>
            !(entry.name === entryToDelete.name && entry.scope === entryToDelete.scope)
        ));
        pendingDeleteEntry = null;
        deleteDialog.hidden = true;
        persistRules();
        render();
    });

    return {addRule, render, resetFilters};
}
