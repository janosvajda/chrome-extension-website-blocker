jest.mock('./getRandomItem', () => ({getRandomItem: jest.fn()}));

import {getRandomItem} from './getRandomItem';
import {BlockedMessageType, getRandomBlockedMessage} from './blockMessages';

const mockedRandomItem = getRandomItem as jest.MockedFunction<typeof getRandomItem>;

describe('getRandomBlockedMessage', () => {
    afterEach(() => jest.restoreAllMocks());

    it('returns a plain message without an attached item', () => {
        jest.spyOn(Math, 'random').mockReturnValue(0);
        expect(getRandomBlockedMessage()).toEqual(expect.objectContaining({
            type: BlockedMessageType.SingleSentence,
        }));
        expect(mockedRandomItem).not.toHaveBeenCalled();
    });

    it('attaches a scientific quote', () => {
        jest.spyOn(Math, 'random').mockReturnValue(0.21);
        mockedRandomItem.mockReturnValueOnce('A quote');
        expect(getRandomBlockedMessage().randomItem).toBe('A quote');
    });

    it('attaches a joke and handles an unavailable item', () => {
        jest.spyOn(Math, 'random').mockReturnValue(0.5);
        mockedRandomItem.mockReturnValueOnce(undefined);
        expect(getRandomBlockedMessage()).toEqual(expect.objectContaining({
            type: BlockedMessageType.Joke,
            randomItem: '',
        }));
    });

    it('handles an unavailable scientific quote', () => {
        jest.spyOn(Math, 'random').mockReturnValue(0.21);
        mockedRandomItem.mockReturnValueOnce(undefined);
        expect(getRandomBlockedMessage().randomItem).toBe('');
    });
});
