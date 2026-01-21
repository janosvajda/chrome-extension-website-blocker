import {getRandomBlockedMessage} from "./helper/blockMessages";

const { message, randomItem } = getRandomBlockedMessage();

const messageDiv = document.getElementById("message") as HTMLDivElement;
const randomItemDiv = document.getElementById("randomItem") as HTMLDivElement;
const blockedReasonDiv = document.getElementById("blockedReason") as HTMLDivElement | null;
const blockedValueDiv = document.getElementById("blockedValue") as HTMLDivElement | null;
const blockedActionsDiv = document.getElementById("blockedActions") as HTMLDivElement | null;
const allowAiButton = document.getElementById("allowAiButton") as HTMLButtonElement | null;

messageDiv.innerText = "";
randomItemDiv.innerText = "";

messageDiv.innerText = message;

if (randomItem) {
    randomItemDiv.innerText = randomItem;
}

const params = new URLSearchParams(window.location.search);
const reasonParam = params.get("reason");
const blockedValueParam = params.get("blocked");
const originalUrl = params.get("url");

function applyBlockedInfo(reason: string | null, blockedValue: string | null) {
    if (blockedReasonDiv) {
        const reasonLabel = reason === "ai"
            ? "Blocked by AI"
            : reason === "url"
                ? "Blocked by URL rule"
                : reason === "domain"
                    ? "Blocked by domain rule"
                    : "";
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

if (blockedActionsDiv && allowAiButton) {
    if (reasonParam === "ai") {
        blockedActionsDiv.hidden = false;
        chrome.storage.local.get({ lastBlockContext: null }, (data) => {
            const context = data.lastBlockContext;
            const title = context?.title || "";
            const description = context?.description || "";
            const hostname = context?.hostname || "";
            allowAiButton.addEventListener("click", () => {
                if (!hostname || (!title && !description)) {
                    return;
                }
                chrome.runtime.sendMessage({ type: "aiAllow", title, description, hostname }, () => {
                    if (originalUrl) {
                        window.location.href = originalUrl;
                    }
                });
            });
        });
    } else {
        blockedActionsDiv.hidden = true;
    }
}
