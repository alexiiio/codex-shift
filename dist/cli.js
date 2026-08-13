#!/usr/bin/env node
import readline from 'node:readline';
import { getCurrentProfile, initializeWeeklyWindow, inspectWeeklyWindows, loginProfile, refreshAllProfiles, removeProfile, saveCurrentAs, switchTo, } from './accounts.js';
const VERSION = '0.2.0';
const ANSI = {
    altScreenOn: '\u001b[?1049h',
    altScreenOff: '\u001b[?1049l',
    clear: '\u001b[2J\u001b[H',
    reset: '\u001b[0m',
    bold: '\u001b[1m',
    dim: '\u001b[2m',
    cyan: '\u001b[36m',
    green: '\u001b[32m',
};
function usage() {
    console.log(`Codex Shift ${VERSION}\n\nSwitch Codex accounts and start weekly usage windows with minimal quota.\n\nCommands:\n  login <name>      Login and save a new Codex account\n  save <name>       Save the currently logged-in Codex account\n  use <name>        Switch the default account\n  list              Refresh and list saved accounts\n  init-week         Start unused weekly windows with one minimal request\n  current           Show the current account\n  remove <name>     Remove a saved account\n  version           Show version\n`);
}
function requireName(args) {
    const name = args[0];
    if (!name)
        throw new Error('Missing profile name.');
    return name;
}
function formatPlan(plan) {
    if (!plan)
        return '-';
    const aliases = {
        free: 'Free',
        plus: 'Plus',
        pro: 'Pro',
        team: 'Team',
        business: 'Business',
        enterprise: 'Enterprise',
        self_serve_business_prolite: 'Business',
        enterprise_cbp_automation: 'Enterprise',
    };
    return aliases[plan] ?? plan;
}
function formatReset(profile) {
    if (profile.meta?.weekStarted === false)
        return 'Not started';
    const timestamp = profile.meta?.weekReset;
    if (!timestamp)
        return '-';
    return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(timestamp * 1000));
}
function createRows(profiles) {
    return profiles.map((profile) => ({
        name: profile.name,
        account: profile.meta?.email ?? '-',
        plan: formatPlan(profile.meta?.plan),
        weekLeft: profile.meta?.weekLeft === undefined ? '-' : `${profile.meta.weekLeft}%`,
        reset: formatReset(profile),
    }));
}
function paint(enabled, style, text) {
    return enabled ? `${style}${text}${ANSI.reset}` : text;
}
function formatHelp(items) {
    return items
        .map(([key, label]) => `${paint(true, `${ANSI.bold}${ANSI.cyan}`, key)} ${paint(true, ANSI.dim, label)}`)
        .join(paint(true, ANSI.dim, '   '));
}
function formatProfileTable(profiles, selectedIndex, color = false) {
    const rows = createRows(profiles);
    const nameWidth = Math.max('NAME'.length, ...rows.map((row) => row.name.length));
    const accountWidth = Math.max('ACCOUNT'.length, ...rows.map((row) => row.account.length));
    const planWidth = Math.max('PLAN'.length, ...rows.map((row) => row.plan.length));
    const weekLeftWidth = Math.max('WEEK LEFT'.length, ...rows.map((row) => row.weekLeft.length));
    const resetWidth = Math.max('RESET TIME'.length, ...rows.map((row) => row.reset.length));
    const header = [
        'NAME'.padEnd(nameWidth),
        'ACCOUNT'.padEnd(accountWidth),
        'PLAN'.padEnd(planWidth),
        'WEEK LEFT'.padEnd(weekLeftWidth),
        'RESET TIME'.padEnd(resetWidth),
    ].join('  ');
    const lines = [`    ${paint(color, ANSI.dim, header)}`];
    rows.forEach((row, index) => {
        const selected = index === selectedIndex;
        const columns = [
            selected ? paint(color, `${ANSI.bold}${ANSI.cyan}`, row.name.padEnd(nameWidth)) : row.name.padEnd(nameWidth),
            row.account.padEnd(accountWidth),
            row.plan.padEnd(planWidth),
            row.weekLeft.padEnd(weekLeftWidth),
            row.reset.padEnd(resetWidth),
        ].join('  ');
        const cursor = selected ? paint(color, `${ANSI.bold}${ANSI.cyan}`, '›') : ' ';
        const current = profiles[index].isCurrent ? paint(color, `${ANSI.bold}${ANSI.green}`, '*') : ' ';
        lines.push(`${cursor} ${current} ${columns}`);
    });
    return lines.join('\n');
}
function printProfiles(profiles) {
    if (profiles.length === 0) {
        console.log('No saved accounts.');
        return;
    }
    console.log(formatProfileTable(profiles));
}
function canUseInteractiveList() {
    return Boolean(process.stdin.isTTY
        && process.stdout.isTTY
        && process.env.TERM !== 'dumb'
        && typeof process.stdin.setRawMode === 'function');
}
async function confirmWeeklyInitialization(profiles) {
    if (!canUseInteractiveList())
        return false;
    const stdin = process.stdin;
    const stdout = process.stdout;
    const wasRaw = stdin.isRaw;
    const useAltScreen = !process.env.CI;
    let selectedIndex = 0;
    let settled = false;
    const render = () => {
        const cancel = selectedIndex === 0 ? paint(true, `${ANSI.bold}${ANSI.cyan}`, '› Cancel') : '  Cancel';
        const confirm = selectedIndex === 1 ? paint(true, `${ANSI.bold}${ANSI.cyan}`, '› Confirm') : '  Confirm';
        const body = [
            paint(true, ANSI.bold, 'Codex Shift'),
            paint(true, ANSI.dim, 'Initialize weekly usage windows'),
            '',
            formatProfileTable(profiles, undefined, true),
            '',
            'One minimal Codex request will be sent for each account.',
            paint(true, ANSI.dim, 'This consumes quota. Failed requests are not retried.'),
            '',
            cancel,
            confirm,
            '',
            formatHelp([['↑/↓', 'Move'], ['Enter', 'Select'], ['Esc', 'Cancel']]),
        ].join('\n');
        stdout.write(`${ANSI.clear}${body}\n`);
    };
    return await new Promise((resolve) => {
        const cleanup = () => {
            if (settled)
                return;
            settled = true;
            stdin.removeListener('keypress', onKeypress);
            process.removeListener('SIGINT', cancel);
            stdout.removeListener('resize', render);
            stdin.setRawMode(wasRaw);
            stdin.pause();
            stdout.write(`${ANSI.reset}${useAltScreen ? ANSI.altScreenOff : ''}`);
        };
        const finish = (confirmed) => {
            cleanup();
            resolve(confirmed);
        };
        const cancel = () => finish(false);
        const onKeypress = (_value, key) => {
            if ((key.ctrl && key.name === 'c') || key.name === 'escape' || key.name === 'q') {
                cancel();
            }
            else if (key.name === 'up' || key.name === 'down') {
                selectedIndex = selectedIndex === 0 ? 1 : 0;
                render();
            }
            else if (key.name === 'return' || key.name === 'enter') {
                finish(selectedIndex === 1);
            }
        };
        readline.emitKeypressEvents(stdin);
        if (useAltScreen)
            stdout.write(ANSI.altScreenOn);
        stdin.setRawMode(true);
        stdin.resume();
        stdin.on('keypress', onKeypress);
        process.on('SIGINT', cancel);
        stdout.on('resize', render);
        render();
    });
}
async function initializeUnusedWeeklyWindows() {
    console.log('Checking weekly usage windows...');
    const inspection = await inspectWeeklyWindows();
    if (inspection.profiles.length === 0) {
        console.log('No saved accounts.');
        return;
    }
    if (inspection.targets.length === 0) {
        console.log('No accounts were confirmed as having an unstarted weekly window.');
        if (inspection.unknown.length > 0) {
            console.log(`${inspection.unknown.length} account(s) could not be determined and were not used.`);
        }
        return;
    }
    if (inspection.unknown.length > 0) {
        console.log(`${inspection.unknown.length} account(s) could not be determined and will be skipped.`);
    }
    if (!(await confirmWeeklyInitialization(inspection.targets))) {
        console.log('Cancelled. No quota was used.');
        return;
    }
    let failed = 0;
    for (const profile of inspection.targets) {
        process.stdout.write(`Starting '${profile.name}'... `);
        try {
            const meta = await initializeWeeklyWindow(profile.name);
            const updated = { ...profile, meta };
            console.log(`✓ ${formatReset(updated)}`);
        }
        catch (error) {
            failed += 1;
            console.log(`failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    if (failed > 0)
        process.exitCode = 1;
}
async function showInteractiveList(initialProfiles) {
    let profiles = initialProfiles;
    let selectedIndex = Math.max(0, profiles.findIndex((profile) => profile.isCurrent));
    let mode = 'browse';
    let confirmIndex = 0;
    let busy = false;
    let notice = '';
    let settled = false;
    const stdin = process.stdin;
    const stdout = process.stdout;
    const wasRaw = stdin.isRaw;
    const useAltScreen = process.env.TERM !== 'dumb' && !process.env.CI;
    const render = () => {
        const selected = profiles[selectedIndex];
        const current = profiles.find((profile) => profile.isCurrent);
        const title = paint(true, ANSI.bold, 'Codex Shift');
        let body = title;
        if (mode === 'confirm' && selected) {
            const confirm = confirmIndex === 0 ? paint(true, `${ANSI.bold}${ANSI.cyan}`, '› Confirm switch') : '  Confirm switch';
            const cancel = confirmIndex === 1 ? paint(true, `${ANSI.bold}${ANSI.cyan}`, '› Cancel') : '  Cancel';
            const targetMeta = createRows([selected])[0];
            const fromName = current?.name ?? 'current account';
            const accountRoute = `${paint(true, ANSI.dim, fromName)}  ${paint(true, ANSI.cyan, '→')}  ${paint(true, `${ANSI.bold}${ANSI.cyan}`, selected.name)}`;
            const targetDetails = paint(true, ANSI.dim, `${targetMeta.account}  ·  ${targetMeta.plan}`);
            body += `\n${paint(true, ANSI.dim, 'Confirm account switch')}\n\n  ${accountRoute}\n  ${targetDetails}`;
            body += `\n\n${paint(true, ANSI.dim, 'Future Codex processes will use the selected account.')}\n\n${confirm}\n${cancel}`;
            body += `\n\n${formatHelp([['↑/↓', 'Move'], ['Enter', 'Confirm'], ['Esc', 'Back']])}`;
        }
        else {
            body += `\n${paint(true, ANSI.dim, `${profiles.length} profiles · Choose an account`)}\n\n${formatProfileTable(profiles, selectedIndex, true)}`;
            if (notice)
                body += `\n\n${paint(true, ANSI.green, notice)}`;
            const help = busy
                ? paint(true, ANSI.dim, 'Refreshing account information…')
                : formatHelp([['↑/↓', 'Move'], ['Enter', 'Select'], ['R', 'Refresh'], ['Q', 'Quit']]);
            body += `\n\n${help}`;
        }
        stdout.write(`${ANSI.clear}${body}\n`);
    };
    return await new Promise((resolve, reject) => {
        const cleanup = () => {
            if (settled)
                return;
            settled = true;
            stdin.removeListener('keypress', onKeypress);
            process.removeListener('SIGINT', onSigint);
            stdout.removeListener('resize', render);
            stdin.setRawMode(wasRaw);
            stdin.pause();
            stdout.write(`${ANSI.reset}${useAltScreen ? ANSI.altScreenOff : ''}`);
        };
        const finish = () => {
            cleanup();
            resolve();
        };
        const fail = (error) => {
            cleanup();
            reject(error);
        };
        const onSigint = () => finish();
        const onKeypress = (_value, key) => {
            if ((key.ctrl && key.name === 'c') || key.name === 'q') {
                finish();
                return;
            }
            if (busy)
                return;
            if (mode === 'confirm') {
                if (key.name === 'escape' || key.name === 'n') {
                    mode = 'browse';
                    notice = '';
                }
                else if (key.name === 'up' || key.name === 'down') {
                    confirmIndex = confirmIndex === 0 ? 1 : 0;
                }
                else if (key.name === 'y') {
                    confirmIndex = 0;
                }
                else if (key.name === 'return' || key.name === 'enter') {
                    if (confirmIndex === 1) {
                        mode = 'browse';
                        notice = '';
                    }
                    else {
                        const selected = profiles[selectedIndex];
                        busy = true;
                        void switchTo(selected.name)
                            .then(() => {
                            profiles = profiles.map((profile, index) => ({ ...profile, isCurrent: index === selectedIndex }));
                            mode = 'browse';
                            notice = `✓ Switched to '${selected.name}'.`;
                        })
                            .catch(fail)
                            .finally(() => {
                            busy = false;
                            if (!settled)
                                render();
                        });
                        return;
                    }
                }
                render();
                return;
            }
            if (key.name === 'escape') {
                finish();
            }
            else if (key.name === 'up') {
                selectedIndex = (selectedIndex - 1 + profiles.length) % profiles.length;
                notice = '';
                render();
            }
            else if (key.name === 'down') {
                selectedIndex = (selectedIndex + 1) % profiles.length;
                notice = '';
                render();
            }
            else if (key.name === 'return' || key.name === 'enter') {
                const selected = profiles[selectedIndex];
                if (selected.isCurrent) {
                    notice = `Already using '${selected.name}'.`;
                }
                else {
                    mode = 'confirm';
                    confirmIndex = 0;
                    notice = '';
                }
                render();
            }
            else if (key.name === 'r') {
                const selectedName = profiles[selectedIndex]?.name;
                busy = true;
                notice = '';
                render();
                void refreshAllProfiles()
                    .then((refreshed) => {
                    profiles = refreshed;
                    selectedIndex = Math.max(0, profiles.findIndex((profile) => profile.name === selectedName));
                    notice = '✓ Account information refreshed.';
                })
                    .catch(fail)
                    .finally(() => {
                    busy = false;
                    if (!settled)
                        render();
                });
            }
        };
        readline.emitKeypressEvents(stdin);
        if (useAltScreen)
            stdout.write(ANSI.altScreenOn);
        stdin.setRawMode(true);
        stdin.resume();
        stdin.on('keypress', onKeypress);
        process.on('SIGINT', onSigint);
        stdout.on('resize', render);
        render();
    });
}
async function main() {
    const [command, ...args] = process.argv.slice(2);
    switch (command) {
        case 'login': {
            const name = requireName(args);
            await loginProfile(name);
            console.log(`✓ Logged in, saved '${name}', and set it as current.`);
            break;
        }
        case 'save': {
            const name = requireName(args);
            await saveCurrentAs(name);
            console.log(`✓ Saved '${name}' and set it as current.`);
            break;
        }
        case 'use':
        case 'switch': {
            const name = requireName(args);
            await switchTo(name);
            console.log(`✓ Switched to '${name}'.`);
            break;
        }
        case 'list':
            console.log('Refreshing account information...');
            {
                const profiles = await refreshAllProfiles();
                if (profiles.length > 1 && canUseInteractiveList())
                    await showInteractiveList(profiles);
                else
                    printProfiles(profiles);
            }
            break;
        case 'init-week':
            await initializeUnusedWeeklyWindows();
            break;
        case 'current':
            console.log((await getCurrentProfile()) ?? 'not set');
            break;
        case 'remove':
        case 'rm': {
            const name = requireName(args);
            await removeProfile(name);
            console.log(`✓ Removed '${name}'.`);
            break;
        }
        case 'version':
        case '--version':
        case '-v':
            console.log(VERSION);
            break;
        case undefined:
        case 'help':
        case '--help':
        case '-h':
            usage();
            break;
        default:
            usage();
            process.exitCode = 1;
    }
}
main().catch((error) => {
    console.error(`Codex Shift: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
});
//# sourceMappingURL=cli.js.map