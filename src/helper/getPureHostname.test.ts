import { getPureHostname } from './getPureHostname';

describe('getPureHostname', () => {
    it('removes www. prefix from hostname', () => {
        const inputUrl = 'https://www.example.com';
        const expectedHostname = 'example.com';
        const result = getPureHostname(inputUrl);
        expect(result).toBe(expectedHostname);
    });

    it('handles URLs without www. prefix', () => {
        const inputUrl = 'https://example.com';
        const expectedHostname = 'example.com';
        const result = getPureHostname(inputUrl);
        expect(result).toBe(expectedHostname);
    });

    it('handles URLs with subdomains', () => {
        const inputUrl = 'https://subdomain.example.com';
        const expectedHostname = 'subdomain.example.com';

        const result = getPureHostname(inputUrl);

        expect(result).toBe(expectedHostname);
    });
});
