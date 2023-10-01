const textarea = document.getElementById("textarea");
const save = document.getElementById("save");
const checkbox = document.getElementById("checkbox");

save.addEventListener("click", () => {
    const blocked = textarea.value.split("\n").map(s => s.trim()).filter(Boolean);
    chrome.storage.local.set({ blocked });
});

window.addEventListener("DOMContentLoaded", () => {
    chrome.storage.local.get(["blocked", "enabled"], function (local) {
        const { blocked } = local;
        if (Array.isArray(blocked)) {
            textarea.value = blocked.join("\n");
        }
    });
});
