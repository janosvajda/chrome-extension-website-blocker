import {detectBlockScope, normalizeBlockedEntry, normalizeUrlForMatch} from './blockedEntry';

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
});
