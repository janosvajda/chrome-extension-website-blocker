import {
    applyCoveredUrlRuleAction,
    blockedEntryCovers,
    detectBlockScope,
    domainRuleMatchesHostname,
    findCoveredUrlRules,
    getCoveredUrlRuleInfo,
    isBlockedEntryCovered,
    normalizeBlockedEntry,
    normalizeUrlForMatch,
    requiresBlockScopeChoice,
    sameCoveredUrlRuleInfo,
} from './blockedEntry';

describe('blocked entry validation', () => {
    it.each([
        ['abcd.com', {name: 'abcd.com', scope: 'domain'}],
        ['http://abcd.com', {name: 'abcd.com', scope: 'domain'}],
        ['https://abcd.co.uk', {name: 'abcd.co.uk', scope: 'domain'}],
        ['https://sub.example.com/path', {name: 'sub.example.com', scope: 'domain'}],
        ['https://example.com.', {name: 'example.com', scope: 'domain'}],
        ['127.0.0.1', {name: '127.0.0.1', scope: 'domain'}],
    ])('accepts valid website input %s', (input, expected) => {
        expect(normalizeBlockedEntry(input, 'domain')).toEqual(expected);
    });

    it.each([
        'abcd',
        'ffff abcd',
        'https://-abcd.com',
        'https://abcd_.com',
        'ftp://abcd.com',
        'not a website',
    ])('rejects invalid website input %s', (input) => {
        expect(normalizeBlockedEntry(input, 'domain')).toBeNull();
    });

    it('accepts and normalizes an exact HTTPS URL', () => {
        expect(normalizeUrlForMatch('https://abcd.co.uk/path/')).toBe('https://abcd.co.uk/path');
        expect(detectBlockScope('https://abcd.co.uk/path')).toBe('url');
    });

    it('requires a scope choice only for URLs below the site origin', () => {
        expect(requiresBlockScopeChoice('chrome.google.com')).toBe(false);
        expect(requiresBlockScopeChoice('https://chrome.google.com')).toBe(false);
        expect(requiresBlockScopeChoice('https://chrome.google.com/')).toBe(false);
        expect(requiresBlockScopeChoice('https://chrome.google.com/webstore')).toBe(true);
        expect(requiresBlockScopeChoice('https://chrome.google.com/?page=1')).toBe(true);
    });

    it('rejects non-HTTP URL rules and single-label hosts', () => {
        expect(normalizeUrlForMatch('ftp://abcd.com/file')).toBeNull();
        expect(normalizeUrlForMatch('https://abcd/path')).toBeNull();
    });

    it('treats rule coverage as directional', () => {
        const domain = {name: 'example.com', scope: 'domain' as const};
        const url = {name: 'https://example.com/path', scope: 'url' as const};
        expect(blockedEntryCovers(domain, url)).toBe(true);
        expect(blockedEntryCovers(url, domain)).toBe(false);
        expect(blockedEntryCovers(url, url)).toBe(true);
        expect(blockedEntryCovers(
            {name: 'https://other.example/path', scope: 'url'},
            url,
        )).toBe(false);
        expect(blockedEntryCovers({name: 'invalid', scope: 'domain'}, url)).toBe(false);
        expect(blockedEntryCovers(domain, {name: 'invalid', scope: 'url'})).toBe(false);
        expect(blockedEntryCovers(domain, {
            name: 'https://www.example.com/path?tab=1#section', scope: 'url',
        })).toBe(true);
        expect(blockedEntryCovers(domain, {
            name: 'https://sub.example.com/path', scope: 'url',
        })).toBe(true);
        expect(blockedEntryCovers(
            {name: 'example.com', scope: 'domain'},
            {name: 'old.example.com', scope: 'domain'},
        )).toBe(true);
        expect(blockedEntryCovers(
            {name: 'old.example.com', scope: 'domain'},
            {name: 'example.com', scope: 'domain'},
        )).toBe(false);
        expect(blockedEntryCovers(
            {name: 'example.com', scope: 'domain'},
            {name: 'notexample.com', scope: 'domain'},
        )).toBe(false);
        expect(blockedEntryCovers(
            {name: 'https://example.com/path/', scope: 'url'},
            {name: 'https://example.com/path', scope: 'url'},
        )).toBe(true);
        expect(blockedEntryCovers(
            {name: 'https://example.com/path?tab=1', scope: 'url'},
            {name: 'https://example.com/path?tab=2', scope: 'url'},
        )).toBe(false);
    });

    it('matches a domain-only rule without covering child or parent domains', () => {
        const exact = {name: 'youtube.com', scope: 'domain' as const, includeSubdomains: false};
        expect(normalizeBlockedEntry('youtube.com', 'domain', false)).toEqual(exact);
        expect(domainRuleMatchesHostname(exact, 'youtube.com')).toBe(true);
        expect(domainRuleMatchesHostname(exact, 'www.youtube.com')).toBe(true);
        expect(domainRuleMatchesHostname(exact, 'music.youtube.com')).toBe(false);
        expect(domainRuleMatchesHostname(
            {name: 'music.youtube.com'},
            'youtube.com',
        )).toBe(false);
        expect(blockedEntryCovers(exact, {
            name: 'https://youtube.com/watch', scope: 'url',
        })).toBe(true);
        expect(blockedEntryCovers(exact, {
            name: 'https://music.youtube.com/watch', scope: 'url',
        })).toBe(false);
        expect(blockedEntryCovers(
            {name: 'youtube.com', scope: 'domain'},
            {name: 'youtube.com', scope: 'domain'},
        )).toBe(true);
        expect(blockedEntryCovers(exact, exact)).toBe(true);
        expect(blockedEntryCovers(exact, {
            name: 'youtube.com', scope: 'domain',
        })).toBe(false);
    });

    it('covers scope detection and equivalent rule comparisons', () => {
        expect(normalizeBlockedEntry('')).toBeNull();
        expect(normalizeBlockedEntry('bad value', 'url')).toBeNull();
        expect(detectBlockScope('bad value')).toBe('domain');
        expect(detectBlockScope('https://example.com/?q=1')).toBe('url');
        expect(detectBlockScope('https://example.com/#part')).toBe('url');
    });

    it('finds and resolves full-URL blocks covered by a broader domain', () => {
        const domain = {name: 'example.com', scope: 'domain' as const};
        const rules = [
            {name: 'https://example.com/one', scope: 'url' as const, enabled: true},
            {name: 'https://sub.example.com/two', scope: 'url' as const, enabled: true},
            {name: 'https://other.example/three', scope: 'url' as const, enabled: true},
            {name: 'unrelated.example', scope: 'domain' as const, enabled: true},
        ];

        expect(findCoveredUrlRules(rules, domain).map((entry) => entry.name)).toEqual([
            'https://example.com/one',
            'https://sub.example.com/two',
        ]);
        const coveredInfo = [
            {url: 'https://example.com/one', enabled: true},
            {url: 'https://sub.example.com/two', enabled: true},
        ];
        expect(getCoveredUrlRuleInfo(rules, domain)).toEqual(coveredInfo);
        expect(sameCoveredUrlRuleInfo(coveredInfo, [...coveredInfo].reverse())).toBe(true);
        expect(sameCoveredUrlRuleInfo(coveredInfo, [
            coveredInfo[0],
            {...coveredInfo[1], enabled: false},
        ])).toBe(false);
        expect(applyCoveredUrlRuleAction(rules, domain, 'keep')).toEqual(rules);
        expect(applyCoveredUrlRuleAction(rules, domain, 'disable')).toEqual([
            {...rules[0], enabled: false},
            {...rules[1], enabled: false},
            rules[2],
            rules[3],
        ]);
        expect(applyCoveredUrlRuleAction(rules, domain, 'delete')).toEqual([rules[2], rules[3]]);
        expect(findCoveredUrlRules(rules, {name: 'https://example.com/one', scope: 'url'})).toEqual([]);
        expect(isBlockedEntryCovered(rules, rules[0])).toBe(true);
        expect(isBlockedEntryCovered(rules, domain)).toBe(false);
        expect(isBlockedEntryCovered(
            [{name: 'example.com', enabled: false}],
            {name: 'example.com'},
        )).toBe(true);
        expect(isBlockedEntryCovered(
            [{name: 'example.com', scope: 'domain', enabled: true}],
            {name: 'old.example.com', scope: 'domain'},
        )).toBe(true);
        expect(isBlockedEntryCovered(
            [{name: 'example.com', scope: 'domain', enabled: false}],
            {name: 'old.example.com', scope: 'domain'},
        )).toBe(false);
        expect(findCoveredUrlRules(rules, {
            name: 'example.com', scope: 'domain', includeSubdomains: false,
        }).map((entry) => entry.name)).toEqual(['https://example.com/one']);
    });

    it('validates IP addresses and DNS label boundaries', () => {
        expect(normalizeBlockedEntry('https://[::1]', 'domain')).toEqual({name: '[::1]', scope: 'domain'});
        expect(normalizeBlockedEntry('999.1.1.1', 'domain')).toBeNull();
        expect(normalizeBlockedEntry(`${'a'.repeat(64)}.com`, 'domain')).toBeNull();
        expect(normalizeBlockedEntry(`${'a'.repeat(250)}.com`, 'domain')).toBeNull();
        expect(normalizeUrlForMatch('https://example.com')).toBe('https://example.com/');
    });
});
