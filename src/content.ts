import {blockedMessages} from "./helper/blockMessages";

// Randomly select a blocked site message
const randomIndex = Math.floor(Math.random() * blockedMessages.length);
const message = blockedMessages[randomIndex];

// Display the message in the center of the screen
const messageDiv = document.getElementById("message");
messageDiv.innerText = message;
