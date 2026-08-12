# Codex Shift

Cross-platform account switching for OpenAI Codex CLI.

**Switch accounts. Keep your workflow.**

> Codex Shift is an unofficial third-party utility and is not affiliated with or endorsed by OpenAI.

## Goals

- Save multiple Codex CLI login profiles locally.
- Switch the default Codex account without changing normal Codex commands.
- Keep the existing Codex configuration, MCP setup, sessions and history untouched.
- Support macOS and Windows first, with Linux naturally covered by the Node.js implementation.
- Show account plan and rate-limit information when supported by the installed Codex CLI.

## Planned UX

```bash
codex account login personal
codex account login work
codex account list
codex account status
codex account use work
codex account current

# Native Codex usage remains unchanged
codex
codex resume
codex exec "..."
```

The internal executable is `codex-shift`; a transparent Codex integration layer will be added before the first release.

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

## Current scaffold

Implemented foundation:

- TypeScript + Node.js 20+
- Cross-platform profile paths
- Local profile save/switch/list/current/remove primitives
- macOS, Windows and Linux CI matrix
- npm package metadata

Next implementation work:

- `login <name>` with safe rollback
- structured `codex app-server` account metadata and weekly rate-limit reads
- transparent `codex account ...` integration
- locking/concurrency protection
- tests and first release packaging

## Security

Credentials stay on the local machine. Codex Shift stores profile copies under `~/.codex-accounts/<profile>/auth.json` (or the equivalent user-home path on Windows) and never intentionally prints authentication tokens.

## License

MIT
