# Codex Shift

<p align="center">
  <strong>English</strong> | <a href="README.zh-CN.md">简体中文</a>
</p>

Cross-platform account switching for OpenAI Codex CLI.

**Switch accounts. Keep your workflow.**

> Codex Shift is an unofficial third-party utility and is not affiliated with or endorsed by OpenAI.

Codex Shift keeps your existing Codex home intact — including configuration, MCP servers, sessions, and history. It stores multiple login profiles locally and lets you choose which one becomes the active `~/.codex/auth.json`.

## Installation

### Requirements

- Node.js 20 or later
- [OpenAI Codex CLI](https://developers.openai.com/codex/cli) installed and available as `codex`

### Install from source

macOS and Linux:

```bash
git clone https://github.com/alexiiio/codex-shift.git
cd codex-shift
./scripts/install.sh
```

Windows PowerShell:

```powershell
git clone https://github.com/alexiiio/codex-shift.git
cd codex-shift
powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1
```

The installer downloads the project dependencies, checks and builds the source, and installs the `codex-shift` command globally with npm.

To update a source installation, pull the latest changes and run the installer again.

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

Switch profiles, then continue using Codex normally:

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
| `codex-shift list` | List profiles using cached account metadata |
| `codex-shift status` | Refresh and show plan and weekly usage information |
| `codex-shift current` | Show the current profile |
| `codex-shift remove <name>` | Remove a profile that is not current |
| `codex-shift --help` | Show command help |

Profile names may contain letters, numbers, dots, underscores, and hyphens.

## Account status

`codex-shift status` refreshes the available account and weekly usage information for each saved profile. It performs each check in a temporary `CODEX_HOME`, so refreshing another account does not replace the active `~/.codex/auth.json`.

The status table can show the account email, plan, weekly usage remaining, and reset time. If a live lookup fails, previously cached metadata remains available through `codex-shift list`.

## Storage and security

Credentials remain on the local machine. Saved profiles are stored under:

```text
~/.codex-accounts/<profile>/auth.json
```

On Windows, Codex Shift uses the equivalent path under the user home directory. Authentication tokens are not intentionally printed. Temporary directories created for status queries are removed after each query.

## Development

```bash
npm install
npm run check
npm run build
node dist/cli.js --help
```

The GitHub Actions workflow checks Node.js 20 and 22 on macOS, Windows, and Linux.

## License

MIT
