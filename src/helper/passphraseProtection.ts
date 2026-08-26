export type PassphraseProtection = {
    version: 1;
    iterations: number;
    salt: string;
    iv: string;
    ciphertext: string;
};

const ITERATIONS = 600_000;
const VERIFIER_TEXT = 'tiny-website-blocker-passphrase-verifier-v1';

function toBase64(bytes: Uint8Array): string {
    let binary = '';
    bytes.forEach((byte) => binary += String.fromCharCode(byte));
    return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function isBase64(value: unknown): value is string {
    if (typeof value !== 'string' || !value) return false;
    try {
        return toBase64(fromBase64(value)) === value;
    } catch {
        return false;
    }
}

export function normalizePassphraseProtection(value: unknown): PassphraseProtection | null {
    if (!value || typeof value !== 'object') return null;
    const record = value as Partial<PassphraseProtection>;
    return record.version === 1
        && Number.isSafeInteger(record.iterations)
        && Number(record.iterations) >= 100_000
        && isBase64(record.salt)
        && isBase64(record.iv)
        && isBase64(record.ciphertext)
        ? record as PassphraseProtection
        : null;
}

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
    const material = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(passphrase),
        'PBKDF2',
        false,
        ['deriveKey']
    );
    return crypto.subtle.deriveKey(
        {name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations},
        material,
        {name: 'AES-GCM', length: 256},
        false,
        ['encrypt', 'decrypt']
    );
}

export async function createPassphraseProtection(passphrase: string): Promise<PassphraseProtection> {
    if (passphrase.length < 6) throw new Error('Use at least 6 characters. Longer phrases are safer.');
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(passphrase, salt, ITERATIONS);
    const ciphertext = await crypto.subtle.encrypt({name: 'AES-GCM', iv}, key, new TextEncoder().encode(VERIFIER_TEXT));
    return {
        version: 1,
        iterations: ITERATIONS,
        salt: toBase64(salt),
        iv: toBase64(iv),
        ciphertext: toBase64(new Uint8Array(ciphertext)),
    };
}

export async function verifyPassphrase(passphrase: string, value: unknown): Promise<boolean> {
    const record = normalizePassphraseProtection(value);
    if (!record || !passphrase) return false;
    try {
        const salt = fromBase64(record.salt);
        const iv = fromBase64(record.iv);
        const key = await deriveKey(passphrase, salt, record.iterations);
        const plaintext = await crypto.subtle.decrypt(
            {name: 'AES-GCM', iv: iv as BufferSource},
            key,
            fromBase64(record.ciphertext) as BufferSource
        );
        const bytes = new Uint8Array(plaintext);
        const verifier = new TextEncoder().encode(VERIFIER_TEXT);
        return bytes.length === verifier.length && bytes.every((byte, index) => byte === verifier[index]);
    } catch {
        return false;
    }
}
