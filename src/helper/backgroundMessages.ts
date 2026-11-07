import type {BlockedEntry, CoveredUrlRuleAction, CoveredUrlRuleInfo} from './blockedEntry';

export const ADD_CURRENT_SITE_RULE = 'addCurrentSiteRule';
export const ENABLE_CURRENT_SITE_RULE = 'enableCurrentSiteRule';

type CurrentSiteRuleSuccess = {
    ok: true;
    blocked: BlockedEntry[];
    enabled: boolean;
    pausedUntil: number;
    reload: 'started' | 'skipped' | 'failed';
};

type CoveredUrlConflict = {domain: string; urls: CoveredUrlRuleInfo[]};
type CurrentSiteRuleFailure = {ok: false; cancelled?: boolean; coveredUrlConflict?: CoveredUrlConflict};

export type CurrentSiteRuleResponse = CurrentSiteRuleSuccess | CurrentSiteRuleFailure;

export type AddCurrentSiteRuleRequest = {
    type: typeof ADD_CURRENT_SITE_RULE;
    tabId: number;
    url: string;
    scope: 'domain' | 'url';
    coveredUrlAction?: CoveredUrlRuleAction;
    coveredUrls?: CoveredUrlRuleInfo[];
};

export type AddCurrentSiteRuleResponse = (CurrentSiteRuleSuccess & {
    ok: true;
    outcome: 'added' | 'updated' | 'existing';
}) | {
    ok: false;
    cancelled?: boolean;
    coveredUrlConflict?: CoveredUrlConflict;
};

export type EnableCurrentSiteRuleRequest = {
    type: typeof ENABLE_CURRENT_SITE_RULE;
    tabId: number;
    url: string;
    rule: Pick<BlockedEntry, 'name' | 'scope' | 'includeSubdomains'>;
    coveredUrlAction?: CoveredUrlRuleAction;
    coveredUrls?: CoveredUrlRuleInfo[];
};

export type EnableCurrentSiteRuleResponse = CurrentSiteRuleResponse;
