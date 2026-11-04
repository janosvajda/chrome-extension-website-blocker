export function formatAvailableAgain(
    timestamp: unknown,
    now = new Date(),
    locales?: string | string[],
): string | null {
    if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp <= now.getTime()) return null;
    const availableAt = new Date(timestamp);
    if (Number.isNaN(availableAt.getTime())) return null;

    const time = new Intl.DateTimeFormat(locales, {hour: '2-digit', minute: '2-digit'}).format(availableAt);
    if (isSameLocalDate(availableAt, now)) return `Available again today at ${time}`;

    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    if (isSameLocalDate(availableAt, tomorrow)) return `Available again tomorrow at ${time}`;

    const weekday = new Intl.DateTimeFormat(locales, {weekday: 'long'}).format(availableAt);
    return `Available again on ${weekday} at ${time}`;
}

function isSameLocalDate(first: Date, second: Date): boolean {
    return first.getFullYear() === second.getFullYear()
        && first.getMonth() === second.getMonth()
        && first.getDate() === second.getDate();
}
