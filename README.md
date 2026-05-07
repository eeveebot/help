# help

> Manages help docs and provides the `!help` and `!bots` commands for the eevee system.

## Overview

The help module is the central documentation hub for eevee. It collects help registrations from other modules at runtime, stores them in an in-memory registry, and serves them to users via the `!help` and `!bots` chat commands.

When the module starts, it broadcasts a `help.updateRequest` message over NATS. Every other module that has help documentation responds by publishing a `help.update` message, which the help module ingests into its registry. This means help content is always current without any static configuration — modules self-register on startup.

The module fits into the eevee ecosystem as a **consumer on the NATS message bus**. It listens on `help.update` and `help.updateRequest.*` subjects, and registers its commands (`help`, `bots`) with the router via `command.register`. When a user types `!help` or `!bots` in any connected channel, the router dispatches the command here.

## Features

- **Self-registering help system** — modules publish their help docs over NATS; no manual config needed
- **`!help` command** — lists all registered modules, or shows detailed help for a specific module
- **`!bots` command** — responds with bot maintainer, URL, and help instructions (standard IRC bot metadata)
- **Per-module help with parameters** — registered help items can include command descriptions and parameter docs (required/optional)
- **Prometheus metrics** — tracks command executions, registry operations, processing time, and errors
- **Health checks** — HTTP endpoint for metrics and liveness probes
- **Graceful shutdown** — cleans up NATS connections and flushes the registry on SIGTERM

## Install

This module is part of the eevee ecosystem and is not published independently. Install from source:

```bash
cd help
npm install
```

### Docker

Build and run via the included Dockerfile (multi-stage build, Node 24 Alpine):

```bash
docker build --secret id=GITHUB_TOKEN,src=<token-file> -t eevee-help .
docker run eevee-help
```

## Configuration

The module loads its config via `loadModuleConfig` from `@eeveebot/libeevee`. No help-specific configuration keys are required at this time.

| Key | Default | Description |
|-----|---------|-------------|
| `ratelimit.mode` | `drop` | Rate limit mode (`drop` or `queue`) |
| `ratelimit.level` | `user` | Rate limit granularity (`user` or `channel`) |
| `ratelimit.limit` | `5` | Max commands per interval |
| `ratelimit.interval` | `1m` | Rate limit window |

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HTTP_API_PORT` | `9000` | Port for the metrics/health HTTP server |
| `NATS_URL` | _(libeevee default)_ | NATS server URL |

See [`config/example.yaml`](config/example.yaml) for a sample configuration file.

## Usage / Commands

### `!help`

Lists all modules that have registered help documentation.

```
<user> !help
<eevee> Available modules with help:
        - calculator
        - dice
        - tell
        - weather

        Use `help <module>` to get help for a specific module.
```

### `!help <module>`

Shows detailed help for a specific module, including commands and parameters.

```
<user> !help tell
<eevee> Help for `tell`:
        - `tell`: Leave a message for another user
          Parameters:
            - username (required): The user to leave a message for
            - message (required): The message content
        - `rmtell`: Remove a pending message you sent
          Parameters:
            - message-id (required): The ID of the message to remove
```

### `!bots` / `.bots`

Standard IRC-style bot metadata response. Matches both `!bots` / `.bots` (raw, no platform prefix) and the platform-prefixed form (e.g., `eevee: bots`).

```
<user> .bots
<eevee> maintainer: goos | url: https://eevee.bot | help: "eevee: help"
```

## Architecture

```
┌─────────────┐    help.updateRequest     ┌──────────────────┐
│             │ ─────────────────────────▶ │                  │
│  help       │                            │  other modules   │
│  module     │ ◀───────────────────────── │  (tell, dice,   │
│             │    help.update (×N)        │   weather, ...)  │
└──────┬──────┘                            └──────────────────┘
       │
       │  command.register
       ▼
┌──────────────┐   command.execute.{uuid}   ┌──────────────┐
│              │ ◀───────────────────────── │              │
│  help module │                            │    router     │
│              │ ─────────────────────────▶ │              │
└──────────────┘    sendChatMessage         └──────────────┘
```

### Key Components

- **`HelpRegistry`** (`src/lib/help-registry.mts`) — In-memory `Map<string, RegisteredHelp>` keyed by module name. Provides `registerHelp()`, `unregisterHelp()`, `getHelp()`, and `getActiveHelp()` methods.
- **`main.mts`** — Entry point. Sets up NATS, registers commands with the router, subscribes to `help.update` and `help.updateRequest` subjects, and handles command execution.
- **`metrics.mts`** (`src/lib/metrics.mts`) — Prometheus counters and histograms for observability.

### NATS Subjects

| Subject | Direction | Purpose |
|---------|-----------|---------|
| `help.update` | Inbound | Modules publish their `HelpRegistration` payloads here |
| `help.updateRequest` | Outbound / Inbound | Help module requests all modules re-send their docs; modules may also request a full refresh |
| `help.updateRequest.*` | Inbound | Module-specific update request (e.g., `help.updateRequest.tell`) |
| `command.execute.{uuid}` | Inbound | Router dispatches matched `!help` / `!bots` commands here |
| `command.register` | Outbound | Registers command definitions with the router |
| `sendChatMessage` | Outbound | Sends help/bots responses back to the chat connector |

### Help Registration Format

Modules publish a JSON payload to `help.update` with this structure:

```typescript
interface HelpRegistration {
  from: string;        // Module name, e.g. "tell"
  help: HelpItem[];
}

interface HelpItem {
  command: string;       // Command name, e.g. "tell"
  descr: string;         // Description, e.g. "Leave a message for another user"
  params?: HelpItemParam[];
}

interface HelpItemParam {
  param: string;      // Parameter name, e.g. "username"
  required: boolean;  // Whether the parameter is required
  descr: string;      // Parameter description
}
```

Example payload published by a module at startup:

```json
{
  "from": "tell",
  "help": [
    {
      "command": "tell",
      "descr": "Leave a message for another user",
      "params": [
        { "param": "username", "required": true, "descr": "The user to leave a message for" },
        { "param": "message", "required": true, "descr": "The message content" }
      ]
    },
    {
      "command": "rmtell",
      "descr": "Remove a pending message you sent",
      "params": [
        { "param": "message-id", "required": true, "descr": "The ID of the message to remove" }
      ]
    }
  ]
}
```

## Development

```bash
# Clone the repo and navigate to the help module
cd help

# Install dependencies
npm install

# Lint (the primary test mechanism)
npm test

# Build (lints first, then compiles TypeScript)
npm run build

# Development mode (watch + run)
npm run dev
```

### Adding a New Command

1. Define the command UUID and display name as constants in `main.mts`.
2. Call `registerCommand()` with the command regex and rate limit config.
3. Subscribe to `command.execute.{uuid}` and handle the message.
4. Add any relevant Prometheus metrics in `metrics.mts`.

## Contributing

This module is part of the [eevee](https://github.com/so-rich/eevee) project. See the contributing guidelines for details.

## License

[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) — see [LICENSE](./LICENSE) for the full text.
