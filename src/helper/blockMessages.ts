import {getRandomItem} from "./getRandomItem";
import {scientificQuotes} from "../data/scientificQuotes";
import {jokes} from "../data/jokes";

export const blockedMessages = [
    "Oops! The site you wanted to open is blocked.",
    "Sorry, access to the requested site is restricted, but I have a quote for you: " + getRandomItem(scientificQuotes),
    "This site is blocked, but here's a joke instead: " + getRandomItem(jokes),
    "Blocked! But don't worry, I've got a joke for you. " + getRandomItem(jokes),
    "The website is under construction, but our humor isn't: " + getRandomItem(jokes),
];
