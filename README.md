# Kiipu CLI

Create Kiipu notes from your terminal.

`@kiipu/cli` is the official command line interface for Kiipu. It is the best place to start if you want to authenticate locally and note directly from the command line.

Use it to:

- sign in on the current device
- ask questions over your saved notes
- create notes from the command line
- delete, restore, or permanently remove notes by id
- verify local authentication and API access with `kiipu doctor`

If you want Claude Code integration on top of the CLI, use `@kiipu/claude-plugin`.

## Install

```bash
npm install -g @kiipu/cli
```

## Quick Start

1. Sign in:

```bash
kiipu auth login
```

2. Create a note:

```bash
kiipu note create "Hello Kiipu"
```

3. Confirm local setup:

```bash
kiipu doctor
```

4. Ask over your saved notes:

```bash
kiipu ask "What did I save about the roadmap?"
```

## Example Workflow

```bash
kiipu auth login
kiipu ask "What should I follow up on?"
kiipu note create "Ship the beta today"
kiipu auth status
```

## Authentication

By default, `kiipu auth login` opens your browser and connects the current device to your Kiipu account.

```bash
kiipu auth login
```

Useful authentication commands:

```bash
kiipu auth login --device-name "MacBook Pro"
kiipu auth login --no-browser
kiipu auth login --api-key <cpk_...>
kiipu auth status
kiipu auth logout
```

## Noteing

Create a note:

```bash
kiipu note create "Ship the beta today"
kiipu note create --content "Ship the beta today"
```

Delete, restore, or permanently remove a note by id:

```bash
kiipu note delete --id note_123
kiipu note restore --id note_123
kiipu note purge --id note_123
```

## Ask

Ask a new question and stream the answer:

```bash
kiipu ask "What did I save about the roadmap?"
kiipu ask --question "What should I follow up on?"
```

Continue a conversation or inspect Ask history:

```bash
kiipu ask --conversation-id conv_123 "What should I do next?"
kiipu ask history --limit 10
kiipu ask show --id conv_123
```

## Core Commands

```bash
kiipu auth login
kiipu auth status
kiipu auth logout

kiipu ask "What did I save about the roadmap?"
kiipu ask history --limit 10
kiipu ask show --id conv_123

kiipu note create "Hello Kiipu"
kiipu note delete --id note_123
kiipu note restore --id note_123
kiipu note purge --id note_123

kiipu doctor
kiipu --help
```

## Troubleshooting

If browser login does not finish:

- Complete sign-in in the browser tab opened by `kiipu auth login`.
- If the browser does not open automatically, run `kiipu auth login --no-browser` and open the printed URL yourself.

If a command fails with an authentication error:

- Run `kiipu auth status` to confirm the current device is still signed in.
- Re-run `kiipu auth login` if you need to refresh local credentials.

If `kiipu doctor` reports a problem:

- Re-run `kiipu auth login`.
- Confirm you can reach Kiipu from the same machine in your browser.

## Help

See the full command reference in the terminal:

```bash
kiipu --help
kiipu auth --help
kiipu ask --help
kiipu note --help
```
