import {blockedEntriesOverlap, detectBlockScope, normalizeBlockedEntry, normalizeUrlForMatch} from './blockedEntry';

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
