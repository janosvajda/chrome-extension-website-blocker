export function getPureHostname(url: string): string {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
        return '';
    }
    const normalizedUrl = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmedUrl)
        ? trimmedUrl
        : `https://${trimmedUrl}`;
    try {
        const urlParts = new URL(normalizedUrl);
        return normalizeHostname(urlParts.hostname);
    } catch {
        return '';
    }
}

export function normalizeHostname(hostname: string, removeWww = true): string {
    const normalized = hostname.toLowerCase().replace(/\.+$/, '');
    return removeWww ? normalized.replace(/^www\./, '') : normalized;
}
