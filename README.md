# Codex Shift

<p align="center">
  <strong>English</strong> | <a href="README.zh-CN.md">简体中文</a>
</p>

Cross-platform account switching and weekly usage-window initialization for OpenAI Codex CLI.

**Switch accounts. Start weekly windows. Keep your workflow.**

> Codex Shift is an unofficial third-party utility and is not affiliated with or endorsed by OpenAI.

Core features include:

- **Switch accounts:** Store multiple Codex login profiles locally, review their account and weekly usage information, and choose which one becomes active.
- **Start weekly usage windows:** Detect saved accounts whose weekly window has not begun and, only after confirmation, send one deliberately minimal Codex request to start it.

Both workflows keep your existing Codex home intact — including configuration, MCP servers, sessions, and history. Account switching only replaces the active `~/.codex/auth.json`; weekly initialization runs in an isolated temporary environment.

## Installation

### Requirements

- Node.js 20 or later
- [OpenAI Codex CLI](https://developers.openai.com/codex/cli) installed and available as `codex`

Install the latest version from npm:

```bash
npm install --global codex-shift
```

After installation, verify that the command is available:

```bash
codex-shift --help
```

## Quick start

`personal` and `work` below are example profile names, not fixed commands or reserved names. Replace them with names that make sense to you.

Save the account Codex is currently using:

```bash
codex-shift save personal
```

Log in to another account and save it as a profile:

```bash
codex-shift login work
```

View account information and switch profiles interactively:

```bash
codex-shift list
```

The list refreshes each profile's account, plan, weekly usage, and reset time. `LIVE`, `CACHED`, and `UNAVAILABLE` identify the source of each row. Use the arrow keys to choose an account, press Enter, and confirm the switch. The `*` marker identifies the account Codex is currently using.

Start weekly usage windows that have not begun yet:

```bash
codex-shift init-week
```

Codex Shift detects eligible accounts and asks for confirmation before sending one minimal request per account. No quota is consumed if you cancel. The request is deliberately kept much smaller than a normal coding task: it asks only for `OK`, uses no project context or persistent history, and selects the lowest-cost available model and reasoning effort. See [Start unused weekly windows](#start-unused-weekly-windows) for details.

You can also switch directly by profile name, then continue using Codex normally:

```bash
codex-shift use personal
codex
```

## Commands

| Command | Description |
| --- | --- |
| `codex-shift login <name>` | Log in to Codex, save the account, and make it current |
| `codex-shift save <name>` | Save the account Codex is currently using |
| `codex-shift use <name>` | Switch to a saved profile |
| `codex-shift list` | Refresh profiles and interactively select an account to switch to |
| `codex-shift init-week` | Select accounts and start unstarted weekly windows with one minimal request each |
| `codex-shift init-week --dry-run` | Show eligible accounts, models, and reasoning efforts without using quota |
| `codex-shift current` | Show the current profile |
| `codex-shift remove <name> [--yes]` | Remove a profile that is not current; `--yes` skips confirmation |
| `codex-shift --help` | Show command help |

Profile names may contain letters, numbers, dots, underscores, and hyphens.

## Account information

`codex-shift list` refreshes the available account and weekly usage information for saved profiles with bounded parallel queries. Each check runs in a temporary `CODEX_HOME`, so refreshing another account does not replace the active `~/.codex/auth.json`.

The account table can show the email, plan, weekly usage remaining, reset time, and data source. `LIVE` means the current refresh succeeded, `CACHED` means the live lookup failed and saved metadata is being shown, and `UNAVAILABLE` means neither live nor cached data is available. Reset times use the local timezone of the machine running Codex Shift. When an unused weekly window returns a reset time that advances with each lookup, Codex Shift displays `Not started` instead of the moving time.

In an interactive terminal, `>` marks the selected profile and `*` marks the current profile. Use the arrow keys to select a profile and press Enter to continue. Choose **Confirm switch** or **Cancel** in the confirmation step; Confirm switch is selected by default. Press `R` to refresh or `Q`/Esc to exit. When output is redirected or piped, `list` prints a non-interactive table and exits.

If every live refresh fails, cached or unavailable rows are still displayed, but `list` exits with status `1` so scripts can detect that no current data was retrieved.

### Start unused weekly windows

Some accounts do not start their weekly usage window until their first Codex request. Run:

```bash
codex-shift init-week
```

Codex Shift checks each profile twice without consuming quota and selects only accounts whose reset time is confirmed by the current check to be moving with lookup time. Cached state is never enough to select an account for initialization. Use the arrow keys and Space to choose accounts individually, then review the frozen model and reasoning-effort plan. The final confirmation defaults to **Cancel**. Immediately before each request, the account is checked again under a process lock; an account that is no longer confirmed as unstarted is skipped without using quota. Failed requests are not retried automatically.

Use `codex-shift init-week --dry-run` to print the same eligibility and model plan without opening the selection UI or sending model requests.

Before confirmation, Codex Shift uses each account's model catalog to select the available model with the lowest cost in its bundled OpenAI rate-card ranking, preferring GPT-5.6 Luna, and uses the lowest reasoning effort that model supports. The displayed choice is frozen and passed unchanged to the actual request. Pricing pages are not queried at runtime. If no available model has a known cost, Codex Shift displays and uses the account's default model; if the model catalog is unavailable, it displays `Codex default` and lets the Codex CLI resolve the model.

Quota usage is intentionally minimized:

- The fixed prompt asks the model to reply with `OK` only.
- The request runs in an empty temporary directory and instructs the model not to inspect files or use tools.
- User configuration and rules are ignored, so project instructions and configured MCP servers do not add context.
- The session is ephemeral and has no conversation history.
- The lowest-cost known available model and its lowest supported reasoning effort are selected.

Only the final confirmed request consumes quota; account checks and model-list lookups do not generate model responses. The exact usage cannot be guaranteed because OpenAI calculates it from the model, context, reasoning, tools, and input/output tokens. This request is designed to be much smaller than a normal Codex task, and the resulting change may be too small to appear in the rounded `WEEK LEFT` percentage. See [OpenAI Codex pricing](https://learn.chatgpt.com/docs/pricing) for how usage is calculated.

The request uses an isolated temporary `CODEX_HOME`, so it does not switch the active account or create a persistent Codex session. Run it in an interactive terminal; redirected or piped input cancels without sending requests.

## Storage and security

Credentials remain on the local machine. Saved profiles are stored under:

```text
~/.codex-accounts/<profile>/auth.json
```

On Windows, Codex Shift uses the equivalent path under the user home directory. Authentication tokens are not intentionally printed. Temporary directories created for account queries and login are removed afterward.

Credential changes use atomic file replacement, an interrupted-switch recovery marker, and a cross-process lock. Before automatically saving refreshed active credentials back to the profile marked current, Codex Shift verifies that both credentials identify the same account. If Codex was logged into another account outside Codex Shift, switching stops instead of overwriting the saved profile; run `codex-shift save <name>` to explicitly save that active login. `codex-shift login` also runs in an isolated temporary `CODEX_HOME`, so an interrupted or failed login leaves the active credential file untouched.

Removing a profile permanently deletes its locally stored credential and metadata. Interactive terminals ask for confirmation and default to cancel; scripts and redirected input must pass `--yes`. The current profile cannot be removed.

## License

MIT
