import {BlockedMessageType, getRandomBlockedMessage} from './helper/blockMessages';
import {formatAvailableAgain} from './helper/availability';

const {message, randomItem, type} = getRandomBlockedMessage();

const messageDiv = document.getElementById('message') as HTMLDivElement;
const randomItemDiv = document.getElementById('randomItem') as HTMLDivElement;
const blockedReasonDiv = document.getElementById('blockedReason') as HTMLDivElement | null;
const blockedValueDiv = document.getElementById('blockedValue') as HTMLDivElement | null;
const availableAgainDiv = document.getElementById('availableAgain') as HTMLDivElement | null;
const randomSectionDiv = document.getElementById('randomSection') as HTMLDivElement | null;
const randomItemLabelDiv = document.getElementById('randomItemLabel') as HTMLDivElement | null;

messageDiv.innerText = '';
randomItemDiv.innerText = '';

messageDiv.innerText = message;

if (randomItem) {
    randomItemDiv.innerText = randomItem;
    if (randomItemLabelDiv) {
        randomItemLabelDiv.innerText = type === BlockedMessageType.ScientificQuotes
            ? 'A quote for you'
            : 'A joke for you';
    }
    if (randomSectionDiv) {
        randomSectionDiv.classList.toggle('quote', type === BlockedMessageType.ScientificQuotes);
        randomSectionDiv.hidden = false;
    }
}

const params = new URLSearchParams(window.location.search);
const reasonParam = params.get('reason');
const blockedValueParam = params.get('blocked');
const availableAtParam = params.get('availableAt');
const availabilityMessage = formatAvailableAgain(Number(availableAtParam));

function applyBlockedInfo(reason: string | null, blockedValue: string | null, scheduled: boolean) {
    if (blockedReasonDiv) {
        const scheduleLabel = scheduled ? 'scheduled ' : '';
        const reasonLabel = reason === 'url'
            ? `Blocked by ${scheduleLabel}URL rule`
            : reason === 'domain'
                ? `Blocked by ${scheduleLabel}domain rule`
                : '';
        if (reasonLabel) {
            blockedReasonDiv.textContent = reasonLabel;
            blockedReasonDiv.hidden = false;
        }
    }

    if (blockedValueDiv && blockedValue) {
        blockedValueDiv.textContent = `Blocked: ${blockedValue}`;
        blockedValueDiv.hidden = false;
    }
}

applyBlockedInfo(reasonParam, blockedValueParam, Boolean(availabilityMessage));

if (availableAgainDiv && availabilityMessage) {
    availableAgainDiv.textContent = availabilityMessage;
    availableAgainDiv.hidden = false;
}
