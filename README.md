# Codex Shift

<p align="center">
  <strong>English</strong> | <a href="README.zh-CN.md">简体中文</a>
</p>

Cross-platform account switching for OpenAI Codex CLI.

**Switch accounts. Keep your workflow.**

> Codex Shift is an unofficial third-party utility and is not affiliated with or endorsed by OpenAI.

## What it does

Codex Shift keeps your existing Codex home intact — configuration, MCP servers, sessions, history, and normal Codex commands stay unchanged — while letting you save multiple local login profiles and choose which one becomes the default `~/.codex/auth.json`.

## Usage

```bash
# Save the account Codex is already using
codex-shift save personal

# Login another account and save it
codex-shift login work

# Fast local list (cached account metadata)
codex-shift list

# Refresh plan + weekly quota for every saved account
codex-shift status

# Change the default account
codex-shift use work

# See the default profile
codex-shift current

# Remove a non-current profile
codex-shift remove personal
```

After switching, use Codex normally:

```bash
codex
codex resume
codex exec "..."
```

## Why not claim `codex account` by default?

Codex Shift intentionally uses the standalone `codex-shift` command as its stable public interface. A future OpenAI Codex release may add its own `codex account` command, and other local wrappers can also intercept the `codex` executable.

For that reason, Codex Shift does **not** overwrite or replace the native `codex` command by default. An optional compatibility integration may be offered later only when it can verify that no native command is being shadowed.

This keeps commands such as `codex resume` fully native and avoids collisions with current or future Codex functionality.

## Account status

`codex-shift status` uses Codex's structured `app-server` account APIs rather than scraping the interactive `/status` screen. Each saved profile is queried using a temporary `CODEX_HOME`, so checking another account does not replace the user's active `~/.codex/auth.json`.

The status table can show:

- ChatGPT account email
- plan type (for example Plus or Pro)
- weekly quota remaining
- weekly reset time

If live lookup fails, previously cached profile metadata remains available through `codex-shift list`.

## Development

Requirements:

- Node.js 20+
- OpenAI Codex CLI installed and available as `codex`

```bash
npm install
npm run check
npm run build
node dist/cli.js --help
```

## Platform support

The core CLI is written in TypeScript/Node.js and targets:

- macOS
- Windows
- Linux

CI runs against Node.js 20 and 22 on all three operating systems.

## Security

Credentials stay on the local machine. Codex Shift stores profile copies under `~/.codex-accounts/<profile>/auth.json` (or the equivalent user-home path on Windows) and never intentionally prints authentication tokens.

Live status checks copy a profile credential into a temporary Codex home for the duration of the query and remove that directory afterwards.

## Project status

Current MVP foundation:

- profile `save`
- profile `login`
- profile `use`
- local `list`
- live `status`
- `current`
- `remove`
- structured Codex app-server account/rate-limit reads
- macOS / Windows / Linux CI

Still planned before the first stable release:

- filesystem locking for simultaneous account mutations
- automated tests
- polished npm installation and release workflow
- optional conflict-safe `codex account ...` compatibility layer

## License

MIT
