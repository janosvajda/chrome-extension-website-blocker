import type {BlockedEntry} from './blockedEntry';

export const ADD_CURRENT_SITE_DOMAIN_RULE = 'addCurrentSiteDomainRule';

export type AddCurrentSiteDomainRuleRequest = {
    type: typeof ADD_CURRENT_SITE_DOMAIN_RULE;
    tabId: number;
    url: string;
};

export type AddCurrentSiteDomainRuleResponse = {
    ok: true;
    blocked: BlockedEntry[];
    enabled: boolean;
    pausedUntil: number;
    outcome: 'added' | 'updated' | 'existing';
    reload: 'started' | 'skipped' | 'failed';
} | {
    ok: false;
};
