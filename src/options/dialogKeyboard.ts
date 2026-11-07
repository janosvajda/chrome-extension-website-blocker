const DISMISSIBLE_DIALOGS: Array<[dialogId: string, closeButtonId: string]> = [
    ['addWebsiteErrorDialog', 'closeAddWebsiteErrorButton'],
    ['passwordSuccessDialog', 'closePasswordSuccessButton'],
    ['exportSuccessDialog', 'closeExportSuccessButton'],
    ['importResultDialog', 'closeImportResultButton'],
    ['importConfirmationDialog', 'cancelImportButton'],
    ['deleteConfirmationDialog', 'cancelDeleteButton'],
    ['blockScopeDialog', 'cancelBlockScopeButton'],
    ['scheduleCopyDialog', 'cancelCopyScheduleButton'],
    ['scheduleTemplateDialog', 'cancelScheduleTemplateButton'],
    ['scheduleDialog', 'cancelScheduleButton'],
    ['passphraseSettingsDialog', 'closePassphraseSettingsButton'],
    ['transferDialog', 'closeTransferDialogButton'],
    ['ruleHelpDialog', 'closeRuleHelpButton'],
];

export function initializeDialogKeyboard(): void {
    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        const visibleDialog = DISMISSIBLE_DIALOGS.find(([dialogId]) =>
            !(document.getElementById(dialogId) as HTMLElement).hidden
        );
        if (!visibleDialog) return;
        event.preventDefault();
        (document.getElementById(visibleDialog[1]) as HTMLButtonElement).click();
    });
}
