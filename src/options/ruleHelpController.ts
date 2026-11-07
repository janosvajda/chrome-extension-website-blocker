export function initializeRuleHelpController(): void {
    const openButton = document.getElementById('openRuleHelpButton') as HTMLButtonElement;
    const closeButton = document.getElementById('closeRuleHelpButton') as HTMLButtonElement;
    const dialog = document.getElementById('ruleHelpDialog') as HTMLElement;

    function close(): void {
        dialog.hidden = true;
        openButton.focus();
    }

    openButton.addEventListener('click', () => {
        dialog.hidden = false;
        closeButton.focus();
    });
    closeButton.addEventListener('click', close);
    dialog.addEventListener('click', (event) => {
        if (event.target === dialog) close();
    });
}
