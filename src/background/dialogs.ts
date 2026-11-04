export type BlockScopeChoice = 'domain' | 'url' | null;

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

export function showBlockScopeDialog(url: string): Promise<BlockScopeChoice> {
    document.getElementById('tiny-blocker-choice')?.remove();
    return new Promise((resolve) => {
        const host = document.createElement('tiny-website-blocker-dialog');
        host.id = 'tiny-blocker-choice';
        host.style.setProperty('all', 'initial', 'important');
        host.style.setProperty('display', 'block', 'important');
        const shadow = host.attachShadow({mode: 'closed'});
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2147483647;display:flex;align-items:center;justify-content:center';

        const card = document.createElement('div');
        card.style.cssText = 'box-sizing:border-box;width:min(520px,calc(100vw - 40px));padding:22px;border-radius:14px;background:#fff;color:#1f1b16;box-shadow:0 18px 32px rgba(0,0,0,.25);font-family:"Trebuchet MS","Lucida Grande","Lucida Sans Unicode",sans-serif';

        const title = document.createElement('div');
        title.textContent = 'Block this page';
        title.style.cssText = 'margin-bottom:14px;font-size:20px;font-weight:bold';
        const subtitle = document.createElement('div');
        subtitle.textContent = 'Choose how you want to block this page:';
        subtitle.style.cssText = 'margin-bottom:8px;color:#6b5f52;font-size:14px';
        const urlBox = document.createElement('div');
        urlBox.textContent = url;
        urlBox.style.cssText = 'margin-bottom:18px;padding:11px 12px;overflow-wrap:anywhere;border:1px solid #edcdb9;border-radius:10px;background:#fff7f1;color:#493d32;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:1.45';

        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px';
        const cancelButton = document.createElement('button');
        cancelButton.textContent = 'Cancel';
        const domainButton = document.createElement('button');
        domainButton.textContent = 'Block domain';
        const urlButton = document.createElement('button');
        urlButton.textContent = 'Block this full URL';

        [cancelButton, domainButton, urlButton].forEach((button) => {
            button.style.cssText = 'padding:8px 12px;border:0;border-radius:999px;cursor:pointer;font-family:inherit';
        });
        cancelButton.style.background = 'transparent';
        cancelButton.style.border = '1px solid #c45a1f';
        cancelButton.style.color = '#c45a1f';
        domainButton.style.background = '#e0702f';
        domainButton.style.color = '#fff';
        urlButton.style.background = '#1f1b16';
        urlButton.style.color = '#fff';

        const onKeydown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') finish(null);
        };
        const finish = (result: BlockScopeChoice) => {
            window.removeEventListener('keydown', onKeydown);
            host.remove();
            resolve(result);
        };
        cancelButton.addEventListener('click', () => finish(null));
        domainButton.addEventListener('click', () => finish('domain'));
        urlButton.addEventListener('click', () => finish('url'));
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) finish(null);
        });
        window.addEventListener('keydown', onKeydown);

        actions.append(cancelButton, domainButton, urlButton);
        card.append(title, subtitle, urlBox, actions);
        overlay.appendChild(card);
        shadow.appendChild(overlay);
        document.body.appendChild(host);
    });
}
