import {getRandomItem} from "./getRandomItem";

describe('getRandomItem', () => {
    it('returns a random item from the array', () => {
        const jokes = ['joke1', 'joke2', 'joke3'];
        const result = getRandomItem(jokes);
        expect(result).not.toBeUndefined()
    });

    it('returns null for an empty array', () => {
        const jokes: string[] = [];
        const result = getRandomItem(jokes);
        expect(result).toBeUndefined();
    });

    it('returns the only item for an array with a single item', () => {
        const jokes = ['joke1'];
        const result = getRandomItem(jokes);
        expect(result).toBe('joke1');
    });

    it('returns an item from the array when called multiple times with the same array', () => {
        const jokes = ['joke1', 'joke2', 'joke3'];
        const result1 = getRandomItem(jokes);
        const result2 = getRandomItem(jokes);
        expect(jokes).toContain(result1);
        expect(jokes).toContain(result2);
    });

    it('returns an item from the array with duplicates', () => {
        const jokes = ['joke1', 'joke1', 'joke2', 'joke3'];
        const result = getRandomItem(jokes);
        expect(jokes).toContain(result);
    });

    it('returns null for non-array input', () => {
        const result = getRandomItem('not an array' as any);
        expect(result).toBeNull();
    });

    it('returns null for undefined input', () => {
        const result = getRandomItem(undefined as any);
        expect(result).toBeNull();
    });

    it('returns null for null input', () => {
        const result = getRandomItem(null as any);
        expect(result).toBeNull();
    });
});
