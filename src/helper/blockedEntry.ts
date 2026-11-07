import {normalizeHostname} from './getPureHostname';

export type BlockScope = 'domain' | 'url';
export type CoveredUrlRuleAction = 'keep' | 'disable' | 'delete';
export type CoveredUrlRuleInfo = {url: string; enabled: boolean};

export type ScheduledDay =
    | {day: number; mode: 'all-day'}
    | {day: number; mode: 'period'; start: string; end: string};

export type RuleSchedule = {daily: ScheduledDay[]};

export type BlockedEntry = {
    name: string;
    enabled: boolean;
    scope?: BlockScope;
    includeSubdomains?: boolean;
    title?: string;
    description?: string;
    schedule?: RuleSchedule;
};

export type NormalizedBlockedEntry = {
    name: string;
    scope: BlockScope;
    includeSubdomains?: boolean;
};

export function normalizeBlockedEntry(
    input: string,
    scope?: BlockScope,
    includeSubdomains?: boolean,
): NormalizedBlockedEntry | null {
    const trimmed = input.trim();
    if (!trimmed) {
        return null;
    }

    const resolvedScope = scope || detectBlockScope(trimmed);
    if (resolvedScope === 'url') {
        const normalizedUrl = normalizeUrlForMatch(trimmed);
        if (!normalizedUrl) {
            return null;
        }
        return { name: normalizedUrl, scope: 'url' };
    }

    const url = toUrl(trimmed);
    const hostname = normalizeHostname(url?.hostname || '');
    if (!isValidHostname(hostname)) {
        return null;
    }
    return {
        name: hostname,
        scope: 'domain',
        ...(includeSubdomains === false ? {includeSubdomains: false} : {}),
    };
}
export function detectBlockScope(input: string): BlockScope {
    const url = toUrl(input);
    if (!url) {
        return 'domain';
    }
    if (url.pathname && url.pathname !== '/') {
        return 'url';
    }
    if (url.search || url.hash) {
        return 'url';
    }
    return 'domain';
}

export function requiresBlockScopeChoice(input: string): boolean {
    return detectBlockScope(input) === 'url';
}

export function normalizeUrlForMatch(input: string): string | null {
    const url = toUrl(input);
    const hostname = normalizeHostname(url?.hostname || '', false);
    if (!url || !isValidHostname(hostname)) {
        return null;
    }
    url.hostname = hostname;
    let pathname = url.pathname || '/';
    if (pathname.length > 1 && pathname.endsWith('/')) {
        pathname = pathname.slice(0, -1);
    }
    return `${url.origin}${pathname}${url.search}${url.hash}`;
}

export function blockedEntryCovers(
    existing: Pick<BlockedEntry, 'name' | 'scope' | 'includeSubdomains'>,
    candidate: Pick<BlockedEntry, 'name' | 'scope' | 'includeSubdomains'>,
): boolean {
    const normalizedExisting = normalizeBlockedEntry(
        existing.name,
        existing.scope,
        existing.includeSubdomains,
    );
    const normalizedCandidate = normalizeBlockedEntry(
        candidate.name,
        candidate.scope,
        candidate.includeSubdomains,
    );
    if (!normalizedExisting || !normalizedCandidate) return false;
    if (normalizedExisting.scope === normalizedCandidate.scope) {
        if (normalizedExisting.scope === 'url') {
            return normalizedExisting.name === normalizedCandidate.name;
        }
        if (!domainRuleMatchesHostname(normalizedExisting, normalizedCandidate.name)) return false;
        return normalizedExisting.name !== normalizedCandidate.name
            || normalizedExisting.includeSubdomains !== false
            || normalizedCandidate.includeSubdomains === false;
    }
    return normalizedExisting.scope === 'domain'
        && domainRuleMatchesHostname(
            normalizedExisting,
            toUrl(normalizedCandidate.name)?.hostname || '',
        );
}

export function isBlockedEntryCovered(
    rules: Array<Pick<BlockedEntry, 'name' | 'scope' | 'enabled' | 'includeSubdomains'>>,
    candidate: Pick<BlockedEntry, 'name' | 'scope' | 'includeSubdomains'>,
): boolean {
    return rules.some((entry) => {
        const sameRule = (entry.scope || 'domain') === (candidate.scope || 'domain')
            && entry.name === candidate.name;
        return sameRule || (entry.enabled && blockedEntryCovers(entry, candidate));
    });
}

export function findCoveredUrlRules<T extends BlockedEntry>(
    rules: T[],
    domain: Pick<BlockedEntry, 'name' | 'scope' | 'includeSubdomains'>,
): T[] {
    if ((domain.scope || 'domain') !== 'domain') return [];
    return rules.filter((entry) =>
        (entry.scope || 'domain') === 'url' && blockedEntryCovers(domain, entry)
    );
}

export function getCoveredUrlRuleInfo(
    rules: BlockedEntry[],
    domain: Pick<BlockedEntry, 'name' | 'scope' | 'includeSubdomains'>,
): CoveredUrlRuleInfo[] {
    return findCoveredUrlRules(rules, domain).map((entry) => ({
        url: entry.name,
        enabled: entry.enabled,
    }));
}

export function sameCoveredUrlRuleInfo(
    first: CoveredUrlRuleInfo[],
    second: CoveredUrlRuleInfo[],
): boolean {
    return first.length === second.length && first.every((entry) =>
        second.some((candidate) => candidate.url === entry.url && candidate.enabled === entry.enabled)
    );
}

export function applyCoveredUrlRuleAction<T extends BlockedEntry>(
    rules: T[],
    domain: Pick<BlockedEntry, 'name' | 'scope' | 'includeSubdomains'>,
    action: CoveredUrlRuleAction,
): T[] {
    if (action === 'keep') return [...rules];
    const coveredKeys = new Set(findCoveredUrlRules(rules, domain).map((entry) => entry.name));
    if (action === 'delete') {
        return rules.filter((entry) =>
            (entry.scope || 'domain') !== 'url' || !coveredKeys.has(entry.name)
        );
    }
    return rules.map((entry) =>
        (entry.scope || 'domain') === 'url' && coveredKeys.has(entry.name)
            ? {...entry, enabled: false} as T
            : entry
    );
}

export function hostnameMatchesDomain(hostname: string, domain: string): boolean {
    const normalizedHostname = normalizeHostname(hostname);
    const normalizedDomain = normalizeHostname(domain);
    return normalizedHostname === normalizedDomain
        || normalizedHostname.endsWith(`.${normalizedDomain}`);
}

export function domainRuleMatchesHostname(
    rule: Pick<BlockedEntry, 'name' | 'includeSubdomains'>,
    hostname: string,
): boolean {
    const normalizedHostname = normalizeHostname(hostname);
    const normalizedDomain = normalizeHostname(rule.name);
    return rule.includeSubdomains === false
        ? normalizedHostname === normalizedDomain
        : hostnameMatchesDomain(normalizedHostname, normalizedDomain);
}

function toUrl(input: string): URL | null {
    try {
        const url = new URL(input);
        return isHttpProtocol(url) ? url : null;
    } catch {
        try {
            const url = new URL(`https://${input}`);
            return isHttpProtocol(url) ? url : null;
        } catch {
            return null;
        }
    }
}

function isHttpProtocol(url: URL): boolean {
    return url.protocol === 'http:' || url.protocol === 'https:';
}

function isValidHostname(hostname: string): boolean {
    if (!hostname || hostname.length > 253) {
        return false;
    }

    // URL.hostname keeps IPv6 addresses wrapped in brackets.
    if (hostname.startsWith('[') && hostname.endsWith(']')) {
        return true;
    }

    // The URL parser normalizes valid IPv4 addresses to dotted decimal form.
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) {
        return hostname.split('.').every((part) => Number(part) <= 255);
    }

    // Public website hostnames must contain a suffix; single labels such as
    // "abcd" are intentionally rejected.
    if (!hostname.includes('.') || hostname.endsWith('.')) {
        return false;
    }

    return hostname.split('.').every((label) =>
        label.length > 0 &&
        label.length <= 63 &&
        /^[a-z\d](?:[a-z\d-]*[a-z\d])?$/i.test(label)
    );
}
