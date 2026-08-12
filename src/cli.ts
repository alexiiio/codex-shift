#!/usr/bin/env node
import { getCurrentProfile, listProfiles, removeProfile, saveCurrentAs, switchTo } from './accounts.js';

const VERSION = '0.1.0';

function usage(): void {
  console.log(`Codex Shift ${VERSION}\n\nCross-platform account switching for OpenAI Codex CLI.\n\nCommands:\n  save <name>       Save the currently logged-in Codex account\n  use <name>        Switch the default account\n  list              List saved accounts\n  current           Show the current account\n  remove <name>     Remove a saved account\n  status            Show account plan and rate limits (coming next)\n  login <name>      Login and save a new account (coming next)\n  version           Show version\n`);
}

function requireName(args: string[]): string {
  const name = args[0];
  if (!name) throw new Error('Missing profile name.');
  return name;
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  switch (command) {
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
    case 'ls': {
      const profiles = await listProfiles();
      if (profiles.length === 0) {
        console.log('No saved accounts.');
        break;
      }
      console.table(profiles.map((p) => ({ current: p.isCurrent ? '*' : '', name: p.name, account: p.meta?.email ?? '-', plan: p.meta?.plan ?? '-' })));
      break;
    }
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
    case 'status':
      throw new Error('status is scaffolded but not implemented yet.');
    case 'login':
      throw new Error('login is scaffolded but not implemented yet.');
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
