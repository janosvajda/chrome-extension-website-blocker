import { getPureHostname } from "../../helper/getPureHostname";

// Function to save the enabled/disabled status of websites to local storage
export function saveToLocalStorage(websiteItems: NodeListOf<Element>) {
    const blocked = Array.from(websiteItems).map((item) => {
        const name = item.querySelector(".websiteName").textContent || "";
        return {
            name: getPureHostname(name),
            enabled: (item.querySelector(".websiteCheckbox") as HTMLInputElement).checked,
        };
    });
    // Store the blocked websites in chrome.storage.local
    chrome.storage.local.set({ blocked });
}
