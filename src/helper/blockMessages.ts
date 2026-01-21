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

const baseMessages: BlockedMessage[] = [
    {
        message: "Oops! The site you wanted to open is blocked.",
        type: BlockedMessageType.SingleSentence,
    },
    {
        message: "Sorry, access to the requested site is restricted, but I have a quote for you: ",
        type: BlockedMessageType.ScientificQuotes,
    },
    {
        message: "This site is blocked, but here's a joke instead: ",
        type: BlockedMessageType.Joke,
    },
    {
        message: "Blocked! But don't worry, I've got a joke for you. ",
        type: BlockedMessageType.Joke,
    },
    {
        message: "The website is under construction, but our humor isn't: ",
        type: BlockedMessageType.Joke,
    },
];

export const blockedMessages = baseMessages;

export function getRandomBlockedMessage(): BlockedMessage {
    const randomIndex = Math.floor(Math.random() * baseMessages.length);
    const selected = baseMessages[randomIndex];
    if (selected.type === BlockedMessageType.Joke) {
        return {
            ...selected,
            randomItem: getRandomItem(jokes) || "",
        };
    }
    if (selected.type === BlockedMessageType.ScientificQuotes) {
        return {
            ...selected,
            randomItem: getRandomItem(scientificQuotes) || "",
        };
    }
    return selected;
}
