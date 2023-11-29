// Function to save the enabled/disabled status of websites to local storage
export function saveToLocalStorage(websiteItems:  NodeListOf<Element>) {
    const blocked = Array.from(websiteItems).map(item => ({
        name: item.querySelector(".websiteName").textContent,
        enabled: (item.querySelector(".websiteCheckbox") as HTMLInputElement).checked
    }));
    // Store the blocked websites in chrome.storage.local
    chrome.storage.local.set({ blocked });
}
