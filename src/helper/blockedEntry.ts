import {getPureHostname} from "./getPureHostname";

export type BlockScope = "domain" | "url";

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
    if (resolvedScope === "url") {
        const normalizedUrl = normalizeUrlForMatch(trimmed);
        if (!normalizedUrl) {
            return null;
        }
        return { name: normalizedUrl, scope: "url" };
    }

    const hostname = getPureHostname(trimmed);
    if (!hostname) {
        return null;
    }
    return { name: hostname, scope: "domain" };
}

export function detectBlockScope(input: string): BlockScope {
    const url = toUrl(input);
    if (!url) {
        return "domain";
    }
    if (url.pathname && url.pathname !== "/") {
        return "url";
    }
    if (url.search || url.hash) {
        return "url";
    }
    return "domain";
}

export function normalizeUrlForMatch(input: string): string | null {
    const url = toUrl(input);
    if (!url) {
        return null;
    }
    let pathname = url.pathname || "/";
    if (pathname.length > 1 && pathname.endsWith("/")) {
        pathname = pathname.slice(0, -1);
    }
    return `${url.origin}${pathname}${url.search}${url.hash}`;
}

function toUrl(input: string): URL | null {
    try {
        return new URL(input);
    } catch {
        try {
            return new URL(`https://${input}`);
        } catch {
            return null;
        }
    }
}
