import {webcrypto} from 'node:crypto';
import {
    createPassphraseProtection,
    normalizePassphraseProtection,
    verifyPassphrase,
} from './passphraseProtection';

describe('passphraseProtection', () => {
    beforeAll(() => Object.defineProperty(globalThis, 'crypto', {value: webcrypto, configurable: true}));

    it('creates a randomized encrypted verifier and verifies only the correct passphrase', async () => {
        const first = await createPassphraseProtection('a strong passphrase');
        const second = await createPassphraseProtection('a strong passphrase');
        expect(first.salt).not.toBe(second.salt);
        expect(first.iv).not.toBe(second.iv);
        expect(first.ciphertext).not.toContain('a strong passphrase');
        await expect(verifyPassphrase('a strong passphrase', first)).resolves.toBe(true);
        await expect(verifyPassphrase('wrong passphrase', first)).resolves.toBe(false);
    });

    it('rejects weak passphrases and malformed records', async () => {
        await expect(createPassphraseProtection('short')).rejects.toThrow('Use at least 6 characters. Longer phrases are safer.');
        expect(normalizePassphraseProtection(null)).toBeNull();
        expect(normalizePassphraseProtection({version: 1, iterations: 1, salt: 'x', iv: 'x', ciphertext: 'x'})).toBeNull();
        expect(normalizePassphraseProtection({version: 2, iterations: 310000, salt: 'AQ==', iv: 'Ag==', ciphertext: 'Aw=='})).toBeNull();
        expect(normalizePassphraseProtection({version: 1, iterations: '310000', salt: 'AQ==', iv: 'Ag==', ciphertext: 'Aw=='})).toBeNull();
        expect(normalizePassphraseProtection({version: 1, iterations: 310000, salt: '', iv: 'Ag==', ciphertext: 'Aw=='})).toBeNull();
        expect(normalizePassphraseProtection({version: 1, iterations: 310000, salt: 'not base64!', iv: 'Ag==', ciphertext: 'Aw=='})).toBeNull();
        expect(normalizePassphraseProtection({version: 1, iterations: 310000, salt: 'AQ==', iv: '', ciphertext: 'Aw=='})).toBeNull();
        expect(normalizePassphraseProtection({version: 1, iterations: 310000, salt: 'AQ==', iv: 'Ag==', ciphertext: ''})).toBeNull();
        await expect(verifyPassphrase('', {})).resolves.toBe(false);
    });
});
