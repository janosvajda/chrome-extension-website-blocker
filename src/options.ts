import {saveToLocalStorage} from "./browserAPI/chrome/saveToLocalStorage";
import {removeFromLocalStorage} from "./browserAPI/chrome/removeFromLocalStorage";

const websiteList = document.getElementById("websiteList");
const addButton = document.getElementById("addButton");
const newWebsiteInput = document.getElementById("newWebsite");

// Function to create a new website item with a delete button
function createWebsiteItem(website, enabled) {
    const websiteItem = document.createElement("div");
    websiteItem.className = "websiteItem";

    const websiteName = document.createElement("div");
    websiteName.className = "websiteName";
    websiteName.textContent = website;

    const websiteCheckbox = document.createElement("input");
    websiteCheckbox.type = "checkbox";
    websiteCheckbox.className = "websiteCheckbox";
    websiteCheckbox.checked = enabled;

    // Add an event listener to the checkbox to update local storage when checked or unchecked
    websiteCheckbox.addEventListener("change", () => {
        const websiteItems = document.querySelectorAll(".websiteItem");
        saveToLocalStorage(websiteItems);
    });

    const deleteButton = document.createElement("button");
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => {
        websiteItem.remove(); // Remove the website item from the UI
        removeFromLocalStorage(website); // Remove the website from local storage
    });

    websiteItem.appendChild(websiteName);
    websiteItem.appendChild(websiteCheckbox);
    websiteItem.appendChild(deleteButton);
    websiteList.appendChild(websiteItem);

    return websiteItem;
}

// Function to load data from local storage and populate the list
function loadAndPopulateWebsiteList() {
    chrome.storage.local.get({ blocked: [] }, (data) => {
        const blockedWebsites = data.blocked;
        if (blockedWebsites && blockedWebsites.length > 0) {
            blockedWebsites.forEach((website) => {
                createWebsiteItem(website.name, website.enabled);
            });
        }
    });
}

// Event listener to add a new website when Enter key is pressed
newWebsiteInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        const websiteName = (newWebsiteInput as HTMLInputElement).value.toString().trim();
        if (websiteName) {
            createWebsiteItem(websiteName, true);
            (newWebsiteInput as HTMLInputElement).value = "";
            const websiteItems = document.querySelectorAll(".websiteItem");
            saveToLocalStorage(websiteItems); // Save the updated list to local storage
        }
    }
});

// Load and populate the website list when the page is loaded
window.addEventListener("DOMContentLoaded", () => {
    loadAndPopulateWebsiteList();
});

// Event listener to add a new website
addButton.addEventListener("click", () => {
    const websiteName = (newWebsiteInput as HTMLInputElement).value.toString().trim();
    if (websiteName) {
        createWebsiteItem(websiteName, true);
        (newWebsiteInput as HTMLInputElement).value = "";
        const websiteItems = document.querySelectorAll(".websiteItem");
        saveToLocalStorage(websiteItems); // Save the updated list to local storage
    }
});


