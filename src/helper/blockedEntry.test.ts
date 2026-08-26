import {
    blockedEntriesOverlap,
    blockedEntryCovers,
    detectBlockScope,
    normalizeBlockedEntry,
    normalizeUrlForMatch,
    requiresBlockScopeChoice,
} from './blockedEntry';

describe('blocked entry validation', () => {
    it.each([
        ['abcd.com', {name: 'abcd.com', scope: 'domain'}],
        ['http://abcd.com', {name: 'abcd.com', scope: 'domain'}],
        ['https://abcd.co.uk', {name: 'abcd.co.uk', scope: 'domain'}],
        ['https://sub.example.com/path', {name: 'sub.example.com', scope: 'domain'}],
        ['127.0.0.1', {name: '127.0.0.1', scope: 'domain'}],
    ])('accepts valid website input %s', (input, expected) => {
        expect(normalizeBlockedEntry(input, 'domain')).toEqual(expected);
    });

    it.each([
        'abcd',
        'ffff abcd',
        'https://abcd.',
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

    it('detects overlap between an always-blocked domain and a scheduled URL', () => {
        expect(blockedEntriesOverlap(
            {name: 'linkedin.com', scope: 'domain'},
            {name: 'https://linkedin.com/feed', scope: 'url'},
        )).toBe(true);
        expect(blockedEntriesOverlap(
            {name: 'linkedin.com', scope: 'domain'},
            {name: 'https://example.com/feed', scope: 'url'},
        )).toBe(false);
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
        })).toBe(false);
        expect(blockedEntryCovers(
            {name: 'https://example.com/path/', scope: 'url'},
            {name: 'https://example.com/path', scope: 'url'},
        )).toBe(true);
        expect(blockedEntryCovers(
            {name: 'https://example.com/path?tab=1', scope: 'url'},
            {name: 'https://example.com/path?tab=2', scope: 'url'},
        )).toBe(false);
    });

    it('covers scope detection and equivalent rule comparisons', () => {
        expect(normalizeBlockedEntry('')).toBeNull();
        expect(normalizeBlockedEntry('bad value', 'url')).toBeNull();
        expect(detectBlockScope('bad value')).toBe('domain');
        expect(detectBlockScope('https://example.com/?q=1')).toBe('url');
        expect(detectBlockScope('https://example.com/#part')).toBe('url');
        expect(blockedEntriesOverlap(
            {name: 'example.com', scope: 'domain'},
            {name: 'example.com', scope: 'domain'},
        )).toBe(true);
        expect(blockedEntriesOverlap(
            {name: 'example.com', scope: 'domain'},
            {name: 'other.example', scope: 'domain'},
        )).toBe(false);
        expect(blockedEntriesOverlap(
            {name: 'invalid', scope: 'domain'},
            {name: 'example.com', scope: 'domain'},
        )).toBe(false);
        expect(blockedEntriesOverlap(
            {name: 'https://example.com/path', scope: 'url'},
            {name: 'example.com', scope: 'domain'},
        )).toBe(true);
    });

    it('validates IP addresses and DNS label boundaries', () => {
        expect(normalizeBlockedEntry('https://[::1]', 'domain')).toEqual({name: '[::1]', scope: 'domain'});
        expect(normalizeBlockedEntry('999.1.1.1', 'domain')).toBeNull();
        expect(normalizeBlockedEntry(`${'a'.repeat(64)}.com`, 'domain')).toBeNull();
        expect(normalizeBlockedEntry(`${'a'.repeat(250)}.com`, 'domain')).toBeNull();
        expect(normalizeUrlForMatch('https://example.com')).toBe('https://example.com/');
    });
});
