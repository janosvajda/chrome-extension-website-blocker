export function getRandomItem(value: string[]): string | null {
    if (!Array.isArray(value)) {
        return null;
    }

    const randomIndex = Math.floor(Math.random() * value.length);
    return value[randomIndex];
}
