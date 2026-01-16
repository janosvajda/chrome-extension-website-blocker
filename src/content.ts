import {blockedMessages} from "./helper/blockMessages";

const randomIndex = Math.floor(Math.random() * blockedMessages.length);
const { message, type, randomItem } = blockedMessages[randomIndex];

const messageDiv = document.getElementById("message") as HTMLDivElement;
const randomItemDiv = document.getElementById("randomItem") as HTMLDivElement;

messageDiv.innerText = '';
randomItemDiv.innerText = '';

messageDiv.innerText = message;

if (randomItem) {
    randomItemDiv.innerText = randomItem;
}
