export function getRandomItem(jokes: string[] ) {
    const randomIndex = Math.floor(Math.random() * jokes.length);
    return jokes[randomIndex];
}
