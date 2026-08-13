#!/usr/bin/env node
import { getCurrentProfile, listProfiles, loginProfile, refreshAllProfiles, removeProfile, saveCurrentAs, switchTo, } from './accounts.js';
const VERSION = '0.2.0';
function usage() {
    console.log(`Codex Shift ${VERSION}\n\nCross-platform account switching for OpenAI Codex CLI.\n\nCommands:\n  login <name>      Login and save a new Codex account\n  save <name>       Save the currently logged-in Codex account\n  use <name>        Switch the default account\n  list              List saved accounts using cached metadata\n  status            Refresh and show account plan and weekly rate limits\n  current           Show the current account\n  remove <name>     Remove a saved account\n  version           Show version\n`);
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
function formatReset(timestamp) {
    if (!timestamp)
        return '-';
    return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(timestamp * 1000));
}
function printProfiles(profiles) {
    if (profiles.length === 0) {
        console.log('No saved accounts.');
        return;
    }
    const rows = profiles.map((profile) => ({
        marker: profile.isCurrent ? '*' : ' ',
        name: profile.name,
        account: profile.meta?.email ?? '-',
        plan: formatPlan(profile.meta?.plan),
        weekLeft: profile.meta?.weekLeft === undefined ? '-' : `${profile.meta.weekLeft}%`,
        reset: formatReset(profile.meta?.weekReset),
    }));
    const nameWidth = Math.max('NAME'.length, ...rows.map((row) => row.name.length));
    const accountWidth = Math.max('ACCOUNT'.length, ...rows.map((row) => row.account.length));
    const planWidth = Math.max('PLAN'.length, ...rows.map((row) => row.plan.length));
    const weekLeftWidth = Math.max('WEEK LEFT'.length, ...rows.map((row) => row.weekLeft.length));
    const header = [
        'NAME'.padEnd(nameWidth),
        'ACCOUNT'.padEnd(accountWidth),
        'PLAN'.padEnd(planWidth),
        'WEEK LEFT'.padEnd(weekLeftWidth),
        'RESET',
    ].join('   ');
    console.log(`   ${header}`);
    for (const row of rows) {
        const columns = [
            row.name.padEnd(nameWidth),
            row.account.padEnd(accountWidth),
            row.plan.padEnd(planWidth),
            row.weekLeft.padEnd(weekLeftWidth),
            row.reset,
        ].join('   ');
        console.log(`${row.marker}  ${columns}`);
    }
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
        case 'ls':
            printProfiles(await listProfiles());
            break;
        case 'status':
            console.log('Refreshing account status...');
            printProfiles(await refreshAllProfiles());
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