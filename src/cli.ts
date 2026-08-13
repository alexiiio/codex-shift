#!/usr/bin/env node
import readline from 'node:readline';
import {
  getCurrentProfile,
  initializeWeeklyWindow,
  inspectWeeklyWindows,
  loginProfile,
  mapWithConcurrency,
  planWeeklyInitialization,
  refreshAllProfiles,
  recoverAccountState,
  removeProfile,
  saveCurrentAs,
  switchTo,
} from './accounts.js';
import type { AccountProfile, WeeklyInitPlan } from './types.js';

const VERSION = '0.2.1';

const ANSI = {
  altScreenOn: '\u001b[?1049h',
  altScreenOff: '\u001b[?1049l',
  clear: '\u001b[2J\u001b[H',
  reset: '\u001b[0m',
  bold: '\u001b[1m',
  dim: '\u001b[2m',
  cyan: '\u001b[36m',
  green: '\u001b[32m',
  yellow: '\u001b[33m',
};

interface ProfileRow {
  name: string;
  account: string;
  plan: string;
  weekLeft: string;
  reset: string;
  source: string;
}

function usage(): void {
  console.log(`Codex Shift ${VERSION}\n\nSwitch Codex accounts and start weekly usage windows with minimal quota.\n\nCommands:\n  login <name>          Login and save a new Codex account\n  save <name>           Save the currently logged-in Codex account\n  use <name>            Switch the default account\n  list                  Refresh and list saved accounts\n  init-week [--dry-run] Review or start unused weekly windows\n  current               Show the current account\n  remove <name>         Remove a saved account\n  version               Show version\n`);
}

function requireName(args: string[]): string {
  const name = args[0];
  if (!name) throw new Error('Missing profile name.');
  return name;
}

function formatPlan(plan?: string): string {
  if (!plan) return '-';
  const aliases: Record<string, string> = {
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

function formatReset(profile: AccountProfile): string {
  if (profile.meta?.weekStarted === false) return 'Not started';
  const timestamp = profile.meta?.weekReset;
  if (!timestamp) return '-';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp * 1000));
}

function createRows(profiles: AccountProfile[]): ProfileRow[] {
  return profiles.map((profile) => ({
    name: profile.name,
    account: profile.meta?.email ?? '-',
    plan: formatPlan(profile.meta?.plan),
    weekLeft: profile.meta?.weekLeft === undefined ? '-' : `${profile.meta.weekLeft}%`,
    reset: formatReset(profile),
    source: profile.dataSource === 'live'
      ? 'LIVE'
      : profile.dataSource === 'cached'
        ? 'CACHED'
        : 'UNAVAILABLE',
  }));
}

function paint(enabled: boolean, style: string, text: string): string {
  return enabled ? `${style}${text}${ANSI.reset}` : text;
}

function formatHelp(items: Array<[key: string, label: string]>): string {
  return items
    .map(([key, label]) => `${paint(true, `${ANSI.bold}${ANSI.cyan}`, key)} ${paint(true, ANSI.dim, label)}`)
    .join(paint(true, ANSI.dim, '   '));
}

function formatProfileTable(profiles: AccountProfile[], selectedIndex?: number, color = false): string {
  const rows = createRows(profiles);

  const nameWidth = Math.max('NAME'.length, ...rows.map((row) => row.name.length));
  const accountWidth = Math.max('ACCOUNT'.length, ...rows.map((row) => row.account.length));
  const planWidth = Math.max('PLAN'.length, ...rows.map((row) => row.plan.length));
  const weekLeftWidth = Math.max('WEEK LEFT'.length, ...rows.map((row) => row.weekLeft.length));
  const resetWidth = Math.max('RESET TIME'.length, ...rows.map((row) => row.reset.length));
  const sourceWidth = Math.max('SOURCE'.length, ...rows.map((row) => row.source.length));

  const header = [
    'NAME'.padEnd(nameWidth),
    'ACCOUNT'.padEnd(accountWidth),
    'PLAN'.padEnd(planWidth),
    'WEEK LEFT'.padEnd(weekLeftWidth),
    'RESET TIME'.padEnd(resetWidth),
    'SOURCE'.padEnd(sourceWidth),
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
      profileSource(profiles[index], row.source.padEnd(sourceWidth), color),
    ].join('  ');

    const cursor = selected ? paint(color, `${ANSI.bold}${ANSI.cyan}`, '›') : ' ';
    const current = profiles[index].isCurrent ? paint(color, `${ANSI.bold}${ANSI.green}`, '*') : ' ';
    lines.push(`${cursor} ${current} ${columns}`);
  });

  return lines.join('\n');
}

function profileSource(profile: AccountProfile, text: string, color: boolean): string {
  if (profile.dataSource === 'live') return paint(color, ANSI.green, text);
  if (profile.dataSource === 'cached') return paint(color, ANSI.yellow, text);
  return paint(color, ANSI.dim, text);
}

function printProfiles(profiles: AccountProfile[]): void {
  if (profiles.length === 0) {
    console.log('No saved accounts.');
    return;
  }

  console.log(formatProfileTable(profiles));
}

function canUseInteractiveList(): boolean {
  return Boolean(
    process.stdin.isTTY
    && process.stdout.isTTY
    && process.env.TERM !== 'dumb'
    && typeof process.stdin.setRawMode === 'function',
  );
}

function formatModel(plan: WeeklyInitPlan): string {
  return plan.model ?? 'Codex default';
}

function accountCount(count: number): string {
  return `${count} ${count === 1 ? 'account' : 'accounts'}`;
}

function formatWeeklyPlanTable(
  plans: WeeklyInitPlan[],
  checked?: Set<string>,
  selectedIndex?: number,
  color = false,
): string {
  const nameWidth = Math.max('NAME'.length, ...plans.map((plan) => plan.name.length));
  const accountWidth = Math.max('ACCOUNT'.length, ...plans.map((plan) => (plan.account ?? '-').length));
  const modelWidth = Math.max('MODEL'.length, ...plans.map((plan) => formatModel(plan).length));
  const reasoningWidth = Math.max('REASONING'.length, ...plans.map((plan) => plan.reasoningEffort.length));
  const header = `     ${'NAME'.padEnd(nameWidth)}  ${'ACCOUNT'.padEnd(accountWidth)}  ${'MODEL'.padEnd(modelWidth)}  ${'REASONING'.padEnd(reasoningWidth)}`;
  const lines = [paint(color, ANSI.dim, header)];
  plans.forEach((plan, index) => {
    const selected = selectedIndex === index;
    const cursor = selected ? paint(color, `${ANSI.bold}${ANSI.cyan}`, '›') : ' ';
    const mark = checked ? (checked.has(plan.name) ? '[✓]' : '[ ]') : '   ';
    const row = `${mark}  ${plan.name.padEnd(nameWidth)}  ${(plan.account ?? '-').padEnd(accountWidth)}  ${formatModel(plan).padEnd(modelWidth)}  ${plan.reasoningEffort.padEnd(reasoningWidth)}`;
    lines.push(`${cursor} ${selected ? paint(color, `${ANSI.bold}${ANSI.cyan}`, row) : row}`);
  });
  return lines.join('\n');
}

function printWeeklyPlans(plans: WeeklyInitPlan[]): void {
  console.log(formatWeeklyPlanTable(plans));
  console.log('\nDry run only. No model requests were sent and no quota was used.');
}

async function selectWeeklyInitializations(plans: WeeklyInitPlan[]): Promise<WeeklyInitPlan[] | null> {
  if (!canUseInteractiveList()) return null;

  const stdin = process.stdin;
  const stdout = process.stdout;
  const wasRaw = stdin.isRaw;
  const useAltScreen = !process.env.CI;
  let selectedIndex = 0;
  let confirmIndex = 0;
  let mode: 'select' | 'confirm' = 'select';
  const checked = new Set(plans.map((plan) => plan.name));
  let settled = false;

  const render = (): void => {
    const selectedPlans = plans.filter((plan) => checked.has(plan.name));
    const body = [
      paint(true, ANSI.bold, 'Codex Shift'),
      paint(true, ANSI.dim, mode === 'select' ? 'Select weekly windows to initialize' : 'Confirm weekly initialization'),
      '',
      formatWeeklyPlanTable(mode === 'select' ? plans : selectedPlans, mode === 'select' ? checked : undefined, mode === 'select' ? selectedIndex : undefined, true),
    ];
    if (mode === 'select') {
      body.push(
        '',
        paint(true, ANSI.dim, `${selectedPlans.length} of ${plans.length} accounts selected · Model choices are frozen for this run.`),
        '',
        formatHelp([['↑/↓', 'Move'], ['Space', 'Toggle'], ['A', 'All/none'], ['Enter', 'Continue'], ['Q', 'Quit']]),
      );
    } else {
      const cancel = confirmIndex === 0 ? paint(true, `${ANSI.bold}${ANSI.cyan}`, '› Cancel') : '  Cancel';
      const confirm = confirmIndex === 1 ? paint(true, `${ANSI.bold}${ANSI.cyan}`, '› Confirm and use quota') : '  Confirm and use quota';
      body.push(
        '',
        'One minimal Codex request will be sent for each selected account.',
        paint(true, ANSI.dim, 'This consumes quota. Each account is re-checked before execution.'),
        '',
        cancel,
        confirm,
        '',
        formatHelp([['↑/↓', 'Move'], ['Enter', 'Select'], ['Esc', 'Back']]),
      );
    }
    stdout.write(`${ANSI.clear}${body}\n`);
  };

  return await new Promise<WeeklyInitPlan[] | null>((resolve) => {
    const cleanup = (): void => {
      if (settled) return;
      settled = true;
      stdin.removeListener('keypress', onKeypress);
      process.removeListener('SIGINT', cancel);
      stdout.removeListener('resize', render);
      stdin.setRawMode(wasRaw);
      stdin.pause();
      stdout.write(`${ANSI.reset}${useAltScreen ? ANSI.altScreenOff : ''}`);
    };

    const finish = (selection: WeeklyInitPlan[] | null): void => {
      cleanup();
      resolve(selection);
    };
    const cancel = (): void => finish(null);
    const onKeypress = (_value: string, key: readline.Key): void => {
      if ((key.ctrl && key.name === 'c') || key.name === 'q') {
        cancel();
        return;
      }
      if (mode === 'confirm') {
        if (key.name === 'escape' || key.name === 'n') {
          mode = 'select';
        } else if (key.name === 'up' || key.name === 'down') {
          confirmIndex = confirmIndex === 0 ? 1 : 0;
        } else if (key.name === 'y') {
          confirmIndex = 1;
        } else if (key.name === 'return' || key.name === 'enter') {
          finish(confirmIndex === 1 ? plans.filter((plan) => checked.has(plan.name)) : null);
          return;
        }
        render();
        return;
      }
      if (key.name === 'escape') {
        cancel();
      } else if (key.name === 'up') {
        selectedIndex = (selectedIndex - 1 + plans.length) % plans.length;
      } else if (key.name === 'down') {
        selectedIndex = (selectedIndex + 1) % plans.length;
      } else if (key.name === 'space') {
        const name = plans[selectedIndex].name;
        if (checked.has(name)) checked.delete(name);
        else checked.add(name);
      } else if (key.name === 'a') {
        if (checked.size === plans.length) checked.clear();
        else plans.forEach((plan) => checked.add(plan.name));
      } else if ((key.name === 'return' || key.name === 'enter') && checked.size > 0) {
        mode = 'confirm';
        confirmIndex = 0;
      }
      render();
    };

    readline.emitKeypressEvents(stdin);
    if (useAltScreen) stdout.write(ANSI.altScreenOn);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('keypress', onKeypress);
    process.on('SIGINT', cancel);
    stdout.on('resize', render);
    render();
  });
}

async function initializeUnusedWeeklyWindows(args: string[]): Promise<void> {
  const dryRun = args.length === 1 && args[0] === '--dry-run';
  if (args.length > (dryRun ? 1 : 0)) throw new Error('Usage: codex-shift init-week [--dry-run]');
  console.log('Checking weekly usage windows (no quota is used during this check)...');
  const inspection = await inspectWeeklyWindows();

  if (inspection.profiles.length === 0) {
    console.log('No saved accounts.');
    return;
  }
  if (inspection.targets.length === 0) {
    const color = canUseInteractiveList();
    if (inspection.unknown.length === 0) {
      console.log(paint(color, `${ANSI.bold}${ANSI.green}`, '✓ All weekly usage windows are active.'));
      console.log(paint(
        color,
        ANSI.dim,
        `  Checked ${accountCount(inspection.profiles.length)} · Everything is ready. No action needed.`,
      ));
    } else {
      const activeCount = inspection.profiles.length - inspection.unknown.length;
      console.log(paint(
        color,
        `${ANSI.bold}${ANSI.yellow}`,
        '⚠ No unstarted weekly usage windows were found.',
      ));
      console.log(paint(
        color,
        ANSI.dim,
        `  ${accountCount(activeCount)} ${activeCount === 1 ? 'is' : 'are'} active · `
          + `${accountCount(inspection.unknown.length)} could not be checked · No requests were sent.`,
      ));
    }
    return;
  }

  if (inspection.unknown.length > 0) {
    console.log(`${inspection.unknown.length} account(s) could not be determined and will be skipped.`);
  }

  if (!dryRun && !canUseInteractiveList()) {
    console.log('An interactive terminal is required. Cancelled; no quota was used.');
    return;
  }

  console.log('Resolving the model and reasoning effort for each eligible account...');
  const plans = await mapWithConcurrency(inspection.targets, 4, planWeeklyInitialization);
  if (dryRun) {
    printWeeklyPlans(plans);
    return;
  }

  const selectedPlans = await selectWeeklyInitializations(plans);
  if (!selectedPlans) {
    console.log('Cancelled. No quota was used.');
    return;
  }

  let failed = 0;
  for (const plan of selectedPlans) {
    process.stdout.write(`Starting '${plan.name}' (${formatModel(plan)}, ${plan.reasoningEffort})... `);
    try {
      const meta = await initializeWeeklyWindow(plan);
      const updated = { name: plan.name, isCurrent: false, meta };
      console.log(`✓ ${formatReset(updated)}`);
    } catch (error) {
      failed += 1;
      console.log(`failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (failed > 0) process.exitCode = 1;
}

async function showInteractiveList(initialProfiles: AccountProfile[]): Promise<void> {
  let profiles = initialProfiles;
  let selectedIndex = Math.max(0, profiles.findIndex((profile) => profile.isCurrent));
  let mode: 'browse' | 'confirm' = 'browse';
  let confirmIndex = 0;
  let busy = false;
  let notice = '';
  let settled = false;

  const stdin = process.stdin;
  const stdout = process.stdout;
  const wasRaw = stdin.isRaw;
  const useAltScreen = process.env.TERM !== 'dumb' && !process.env.CI;

  const render = (): void => {
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
    } else {
      body += `\n${paint(true, ANSI.dim, `${profiles.length} profiles · Choose an account`)}\n\n${formatProfileTable(profiles, selectedIndex, true)}`;
      if (notice) body += `\n\n${paint(true, ANSI.green, notice)}`;
      const help = busy
        ? paint(true, ANSI.dim, 'Refreshing account information…')
        : formatHelp([['↑/↓', 'Move'], ['Enter', 'Select'], ['R', 'Refresh'], ['Q', 'Quit']]);
      body += `\n\n${help}`;
    }

    stdout.write(`${ANSI.clear}${body}\n`);
  };

  return await new Promise<void>((resolve, reject) => {
    const cleanup = (): void => {
      if (settled) return;
      settled = true;
      stdin.removeListener('keypress', onKeypress);
      process.removeListener('SIGINT', onSigint);
      stdout.removeListener('resize', render);
      stdin.setRawMode(wasRaw);
      stdin.pause();
      stdout.write(`${ANSI.reset}${useAltScreen ? ANSI.altScreenOff : ''}`);
    };

    const finish = (): void => {
      cleanup();
      resolve();
    };

    const fail = (error: unknown): void => {
      cleanup();
      reject(error);
    };

    const onSigint = (): void => finish();

    const onKeypress = (_value: string, key: readline.Key): void => {
      if ((key.ctrl && key.name === 'c') || key.name === 'q') {
        finish();
        return;
      }
      if (busy) return;

      if (mode === 'confirm') {
        if (key.name === 'escape' || key.name === 'n') {
          mode = 'browse';
          notice = '';
        } else if (key.name === 'up' || key.name === 'down') {
          confirmIndex = confirmIndex === 0 ? 1 : 0;
        } else if (key.name === 'y') {
          confirmIndex = 0;
        } else if (key.name === 'return' || key.name === 'enter') {
          if (confirmIndex === 1) {
            mode = 'browse';
            notice = '';
          } else {
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
                if (!settled) render();
              });
            return;
          }
        }
        render();
        return;
      }

      if (key.name === 'escape') {
        finish();
      } else if (key.name === 'up') {
        selectedIndex = (selectedIndex - 1 + profiles.length) % profiles.length;
        notice = '';
        render();
      } else if (key.name === 'down') {
        selectedIndex = (selectedIndex + 1) % profiles.length;
        notice = '';
        render();
      } else if (key.name === 'return' || key.name === 'enter') {
        const selected = profiles[selectedIndex];
        if (selected.isCurrent) {
          notice = `Already using '${selected.name}'.`;
        } else {
          mode = 'confirm';
          confirmIndex = 0;
          notice = '';
        }
        render();
      } else if (key.name === 'r') {
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
            if (!settled) render();
          });
      }
    };

    readline.emitKeypressEvents(stdin);
    if (useAltScreen) stdout.write(ANSI.altScreenOn);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('keypress', onKeypress);
    process.on('SIGINT', onSigint);
    stdout.on('resize', render);
    render();
  });
}

async function main(): Promise<void> {
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
      await recoverAccountState();
      console.log('Refreshing account information...');
      {
        const profiles = await refreshAllProfiles();
        if (profiles.length > 1 && canUseInteractiveList()) await showInteractiveList(profiles);
        else printProfiles(profiles);
      }
      break;
    case 'init-week':
      await initializeUnusedWeeklyWindows(args);
      break;
    case 'current':
      await recoverAccountState();
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

main().catch((error: unknown) => {
  console.error(`Codex Shift: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
