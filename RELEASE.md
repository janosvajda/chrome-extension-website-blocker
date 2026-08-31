# Tiny Website Blocker 1.0.4

## What’s new

- Pause all blocking from the toolbar popup for 15 minutes, 30 minutes, or one hour.
- See the remaining pause time and the exact local time when blocking will resume automatically.
- Resume blocking immediately with **Resume now**.
- From the fourth pause in one day, see one of three randomly selected funny reminders with a playful bounce animation.
- Both timed pauses and turning blocking off with the main switch count toward the daily reminder total.
- Optionally protect actions that weaken blocking with a password configured in Settings. The password is never stored or recoverable.

The pause counter resets automatically for each new local calendar day. The first pause on a new day starts the count at one, so reminders do not appear again until the fourth pause that day.
Funny reminders are shown only when a qualifying pause is started. Closing the popup dismisses the reminder; reopening it still shows the active pause and countdown without repeating the message.

## Privacy

The pause expiry time and daily pause count stay in local extension storage. Tiny Website Blocker does not transmit them or use an external API, service, analytics system, or network request.

Password protection stores only a locally encrypted verifier with a fresh random salt and IV. It cannot stop someone from clearing the extension’s local data or uninstalling the extension.
