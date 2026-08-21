export type BlockScope = 'domain' | 'url';

export type BlockedEntry = {
    name: string;
    enabled: boolean;
    scope?: BlockScope;
    title?: string;
    description?: string;
};

export type NormalizedBlockedEntry = {
    name: string;
    scope: BlockScope;
};

export function normalizeBlockedEntry(input: string, scope?: BlockScope): NormalizedBlockedEntry | null {
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
    const hostname = url?.hostname.replace(/^www\./, '') || '';
    if (!isValidHostname(hostname)) {
        return null;
    }
    return { name: hostname, scope: 'domain' };
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

export function normalizeUrlForMatch(input: string): string | null {
    const url = toUrl(input);
    if (!url || !isValidHostname(url.hostname)) {
        return null;
    }
    let pathname = url.pathname || '/';
    if (pathname.length > 1 && pathname.endsWith('/')) {
        pathname = pathname.slice(0, -1);
    }
    return `${url.origin}${pathname}${url.search}${url.hash}`;
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
