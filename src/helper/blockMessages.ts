import {getRandomItem} from './getRandomItem';
import {scientificQuotes} from '../data/scientificQuotes';
import {jokes} from '../data/jokes';

export enum BlockedMessageType {
    SingleSentence = 'single_sentence',
    Joke = 'joke',
    ScientificQuotes = 'scientific_quotes',
}

export interface BlockedMessage {
    message: string;
    type: BlockedMessageType;
    randomItem?: string;
}

const baseMessages: BlockedMessage[] = [
    {
        message: 'Oops! The site you wanted to open is blocked.',
        type: BlockedMessageType.SingleSentence,
    },
    {
        message: 'Access to this site is blocked.',
        type: BlockedMessageType.ScientificQuotes,
    },
    {
        message: 'This site is blocked.',
        type: BlockedMessageType.Joke,
    },
    {
        message: 'This distraction has been blocked.',
        type: BlockedMessageType.Joke,
    },
    {
        message: 'This site is unavailable because it matches a blocking rule.',
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
            randomItem: getRandomItem(jokes) || '',
        };
    }
    if (selected.type === BlockedMessageType.ScientificQuotes) {
        return {
            ...selected,
            randomItem: getRandomItem(scientificQuotes) || '',
        };
    }
    return selected;
}
