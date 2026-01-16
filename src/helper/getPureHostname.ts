export function getPureHostname(url: string): string {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
        return "";
    }
    const normalizedUrl = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmedUrl)
        ? trimmedUrl
        : `https://${trimmedUrl}`;
    try {
        const urlParts = new URL(normalizedUrl);
        return urlParts.hostname.replace(/^www\./, '');
    } catch (error) {
        return "";
    }
}
