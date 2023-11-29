export function getPureHostname(url) {
    const urlParts = new URL(url);
    return urlParts.hostname.replace(/^www\./, '');
}
