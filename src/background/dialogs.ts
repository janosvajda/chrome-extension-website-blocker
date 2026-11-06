import type {CoveredUrlRuleInfo} from '../helper/blockedEntry';

export type BlockScopeChoice = 'domain' | 'url' | null;
export type CoveredUrlRuleChoice = 'keep' | 'disable' | 'delete' | null;
export type RuleChoiceDialogConfig =
    | {kind: 'scope'; url: string}
    | {kind: 'coveredUrls'; domain: string; urls: CoveredUrlRuleInfo[]};
export type RuleChoiceDialogResult = Exclude<BlockScopeChoice, null> | Exclude<CoveredUrlRuleChoice, null> | null;

export function showScheduledDomainOverrideDialog(
    blockedDomain: string,
    scheduleDescription: string
): Promise<boolean> {
    return new Promise((resolve) => {
        document.getElementById('tiny-blocker-schedule-choice')?.remove();
        const host = document.createElement('tiny-website-blocker-dialog');
        host.id = 'tiny-blocker-schedule-choice';
        host.style.setProperty('all', 'initial', 'important');
        host.style.setProperty('display', 'block', 'important');
        const shadow = host.attachShadow({mode: 'closed'});
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2147483647;display:flex;align-items:center;justify-content:center';

        const card = document.createElement('div');
        card.style.cssText = 'box-sizing:border-box;width:min(520px,calc(100vw - 40px));padding:22px;border-radius:14px;background:#fff;color:#1f1b16;box-shadow:0 18px 32px rgba(0,0,0,.25);font-family:"Trebuchet MS","Lucida Grande",sans-serif';

        const title = document.createElement('div');
        title.textContent = `${blockedDomain} already has scheduled blocking`;
        title.style.cssText = 'margin-bottom:12px;font-size:20px;font-weight:bold';

        const explanation = document.createElement('div');
        explanation.textContent = 'This website is blocked only during the schedule below. The schedule is not active right now.';
        explanation.style.cssText = 'margin-bottom:14px;color:#6b5f52;font-size:14px;line-height:1.45';

        const scheduleLabel = document.createElement('div');
        scheduleLabel.textContent = 'Current blocking schedule';
        scheduleLabel.style.cssText = 'margin-bottom:6px;font-size:13px;font-weight:bold';

        const scheduleBox = document.createElement('div');
        scheduleBox.textContent = scheduleDescription;
        scheduleBox.style.cssText = 'margin-bottom:18px;padding:11px 12px;border:1px solid #edcdb9;border-radius:10px;background:#fff7f1;color:#493d32;font-size:14px;line-height:1.45';

        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px';
        const keepButton = document.createElement('button');
        keepButton.textContent = 'Keep schedule';
        keepButton.style.cssText = 'padding:8px 12px;border:1px solid #c45a1f;border-radius:999px;background:transparent;color:#c45a1f;cursor:pointer;font-family:inherit';
        const replaceButton = document.createElement('button');
        replaceButton.textContent = 'Remove schedule and block domain';
        replaceButton.style.cssText = 'padding:8px 12px;border:0;border-radius:999px;background:#e0702f;color:#fff;cursor:pointer;font-family:inherit';

        const onKeydown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') finish(false);
        };
        const finish = (replaceSchedule: boolean) => {
            window.removeEventListener('keydown', onKeydown);
            host.remove();
            resolve(replaceSchedule);
        };
        keepButton.addEventListener('click', () => finish(false));
        replaceButton.addEventListener('click', () => finish(true));
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) finish(false);
        });
        window.addEventListener('keydown', onKeydown);

        actions.append(keepButton, replaceButton);
        card.append(title, explanation, scheduleLabel, scheduleBox, actions);
        overlay.appendChild(card);
        shadow.appendChild(overlay);
        document.body.appendChild(host);
        keepButton.focus();
    });
}

export function showRuleChoiceDialog(config: RuleChoiceDialogConfig): Promise<RuleChoiceDialogResult> {
    document.getElementById('tiny-blocker-choice')?.remove();
    return new Promise((resolve) => {
        const host = document.createElement('tiny-website-blocker-dialog');
        host.id = 'tiny-blocker-choice';
        host.style.setProperty('all', 'initial', 'important');
        host.style.setProperty('display', 'block', 'important');
        const shadow = host.attachShadow({mode: 'closed'});
        const style = document.createElement('style');
        style.textContent = `
            * {
                box-sizing: border-box;
            }

            .overlay {
                position: fixed;
                inset: 0;
                z-index: 2147483647;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
                background: rgba(0, 0, 0, .55);
            }

            .card {
                width: min(520px, 100%);
                padding: 22px;
                border-radius: 14px;
                background: #fff;
                color: #1f1b16;
                box-shadow: 0 18px 32px rgba(0, 0, 0, .25);
                font-family: "Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", sans-serif;
            }

            .title {
                margin-bottom: 14px;
                font-size: 20px;
                font-weight: bold;
            }

            .subtitle {
                margin-bottom: 8px;
                color: #6b5f52;
                font-size: 14px;
            }

            .url {
                max-height: 150px;
                margin-bottom: 18px;
                padding: 11px 12px;
                overflow: auto;
                overflow-wrap: anywhere;
                border: 1px solid #edcdb9;
                border-radius: 10px;
                background: #fff7f1;
                color: #493d32;
                font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
                font-size: 12px;
                line-height: 1.45;
            }

            .entry + .entry {
                margin-top: 7px;
                padding-top: 7px;
                border-top: 1px solid #edcdb9;
            }

            .entry {
                display: grid;
                grid-template-columns: minmax(0, 1fr) auto;
                align-items: start;
                gap: 8px;
            }

            .entry-url {
                min-width: 0;
                overflow-wrap: anywhere;
            }

            .entry-status {
                padding: 2px 6px;
                border-radius: 999px;
                background: #eee8e0;
                color: #6b5f52;
                font-family: "Trebuchet MS", "Lucida Grande", sans-serif;
                font-size: 10px;
                font-weight: bold;
                text-transform: uppercase;
            }

            .entry-status.enabled {
                background: #fce8dc;
                color: #a65322;
            }

            .actions {
                display: flex;
                flex-wrap: wrap;
                justify-content: flex-end;
                gap: 8px;
            }

            button {
                padding: 8px 12px;
                border: 0;
                border-radius: 999px;
                cursor: pointer;
                font: inherit;
                white-space: nowrap;
            }

            button:focus-visible {
                outline: 3px solid rgba(196, 90, 31, .28);
                outline-offset: 2px;
            }

            .cancel {
                border: 1px solid #c45a1f;
                background: transparent;
                color: #c45a1f;
            }

            .domain {
                background: #e0702f;
                color: #fff;
            }

            .full-url {
                background: #1f1b16;
                color: #fff;
            }

            .keep {
                border: 1px solid #6b5f52;
                background: transparent;
                color: #493d32;
            }

            .disable {
                background: #e0702f;
                color: #fff;
            }

            .delete {
                background: #a33226;
                color: #fff;
            }

            @media (max-width: 440px) {
                .overlay {
                    padding: 12px;
                }

                .card {
                    width: 100%;
                    max-height: calc(100vh - 24px);
                    padding: 16px;
                    overflow: auto;
                    border-radius: 12px;
                }

                .title {
                    margin-bottom: 10px;
                    font-size: 18px;
                }

                .subtitle {
                    margin-bottom: 7px;
                    font-size: 13px;
                    line-height: 1.35;
                }

                .url {
                    max-height: 88px;
                    margin-bottom: 14px;
                    padding: 9px 10px;
                    font-size: 11px;
                }

                .actions.scope {
                    display: grid;
                    grid-template-columns: auto auto auto;
                    gap: 6px;
                }

                .actions.coveredUrls {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 6px;
                }

                button {
                    min-width: 0;
                    padding: 8px 9px;
                    font-size: 12px;
                }
            }
        `;
        const overlay = document.createElement('div');
        overlay.className = 'overlay';

        const card = document.createElement('div');
        card.className = 'card';

        const title = document.createElement('div');
        title.className = 'title';
        const subtitle = document.createElement('div');
        subtitle.className = 'subtitle';
        const urlBox = document.createElement('div');
        urlBox.className = 'url';

        const actions = document.createElement('div');
        actions.className = `actions ${config.kind}`;

        const choices: Array<{label: string; result: RuleChoiceDialogResult; className: string}> = config.kind === 'scope'
            ? [
                {label: 'Cancel', result: null, className: 'cancel'},
                {label: 'Block domain', result: 'domain', className: 'domain'},
                {label: 'Block this full URL', result: 'url', className: 'full-url'},
            ]
            : [
                {label: 'Cancel', result: null, className: 'cancel'},
                {label: 'Keep URL blocks', result: 'keep', className: 'keep'},
                ...(config.urls.some((entry) => entry.enabled)
                    ? [{label: 'Disable URL blocks', result: 'disable' as const, className: 'disable'}]
                    : []),
                {label: 'Delete URL blocks', result: 'delete', className: 'delete'},
            ];

        if (config.kind === 'scope') {
            title.textContent = 'Block this page';
            subtitle.textContent = 'Choose how you want to block this page:';
            urlBox.textContent = config.url;
        } else {
            title.textContent = `${config.domain} already has URL blocks`;
            const hasEnabledUrl = config.urls.some((entry) => entry.enabled);
            subtitle.textContent = hasEnabledUrl
                ? 'The full URLs below already have blocking rules. What should happen to them when you block the whole domain?'
                : 'The full-URL blocks below are already disabled. Keep them for later or delete them.';
            config.urls.forEach(({url, enabled}) => {
                const entry = document.createElement('div');
                entry.className = 'entry';
                const entryUrl = document.createElement('span');
                entryUrl.className = 'entry-url';
                entryUrl.textContent = url;
                const status = document.createElement('span');
                status.className = `entry-status ${enabled ? 'enabled' : 'disabled'}`;
                status.textContent = enabled ? 'Enabled' : 'Disabled';
                entry.append(entryUrl, status);
                urlBox.appendChild(entry);
            });
        }

        const onKeydown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') finish(null);
        };
        const finish = (result: RuleChoiceDialogResult) => {
            window.removeEventListener('keydown', onKeydown);
            host.remove();
            resolve(result);
        };
        choices.forEach((choice) => {
            const button = document.createElement('button');
            button.textContent = choice.label;
            button.className = choice.className;
            button.addEventListener('click', () => finish(choice.result as RuleChoiceDialogResult));
            actions.appendChild(button);
        });
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) finish(null);
        });
        window.addEventListener('keydown', onKeydown);

        card.append(title, subtitle, urlBox, actions);
        overlay.appendChild(card);
        shadow.append(overlay, style);
        document.body.appendChild(host);
        (actions.querySelector('button') as HTMLButtonElement | null)?.focus();
    });
}

export function showBlockScopeDialog(url: string): Promise<BlockScopeChoice> {
    return showRuleChoiceDialog({kind: 'scope', url}) as Promise<BlockScopeChoice>;
}

export function showCoveredUrlRulesDialog(
    domain: string,
    urls: CoveredUrlRuleInfo[],
): Promise<CoveredUrlRuleChoice> {
    return showRuleChoiceDialog({kind: 'coveredUrls', domain, urls}) as Promise<CoveredUrlRuleChoice>;
}
