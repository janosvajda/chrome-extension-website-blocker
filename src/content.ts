import {getRandomBlockedMessage} from './helper/blockMessages';

const { message, randomItem } = getRandomBlockedMessage();

const messageDiv = document.getElementById('message') as HTMLDivElement;
const randomItemDiv = document.getElementById('randomItem') as HTMLDivElement;
const blockedReasonDiv = document.getElementById('blockedReason') as HTMLDivElement | null;
const blockedValueDiv = document.getElementById('blockedValue') as HTMLDivElement | null;

messageDiv.innerText = '';
randomItemDiv.innerText = '';

messageDiv.innerText = message;

if (randomItem) {
    randomItemDiv.innerText = randomItem;
}

const params = new URLSearchParams(window.location.search);
const reasonParam = params.get('reason');
const blockedValueParam = params.get('blocked');

function applyBlockedInfo(reason: string | null, blockedValue: string | null) {
    if (blockedReasonDiv) {
        const reasonLabel = reason === 'url'
            ? 'Blocked by URL rule'
            : reason === 'domain'
                ? 'Blocked by domain rule'
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

applyBlockedInfo(reasonParam, blockedValueParam);
