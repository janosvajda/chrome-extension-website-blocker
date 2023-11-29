import {getRandomItem} from "./getRandomItem";
import {scientificQuotes} from "../data/scientificQuotes";
import {jokes} from "../data/jokes";

export enum BlockedMessageType {
    SingleSentence = "single_sentence",
    Joke = "joke",
    ScientificQuotes = "scientific_quotes",
}

export interface BlockedMessage {
    message: string;
    type: BlockedMessageType;
    randomItem?: string;
}

export const blockedMessages: BlockedMessage[] = [
    {
        message: "Oops! The site you wanted to open is blocked.",
        type: BlockedMessageType.SingleSentence,
    },
    {
        message: "Sorry, access to the requested site is restricted, but I have a quote for you: ",
        type: BlockedMessageType.ScientificQuotes,
        randomItem: getRandomItem(scientificQuotes),
    },
    {
        message: "This site is blocked, but here's a joke instead: ",
        type: BlockedMessageType.Joke,
        randomItem: getRandomItem(jokes),
    },
    {
        message: "Blocked! But don't worry, I've got a joke for you. ",
        type: BlockedMessageType.Joke,
        randomItem: getRandomItem(jokes),
    },
    {
        message: "The website is under construction, but our humor isn't: ",
        type: BlockedMessageType.Joke,
        randomItem: getRandomItem(jokes),
    },
];
