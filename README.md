# Memor

**Instant codebase understanding for any TS/JS project.**

Memor analyzes your repository and generates an interactive architectural briefing — structure, runtime flows, and change impact — all in your browser, in seconds.

No cloud. No AI API calls. Everything runs locally on your machine.

## Quick Start

```bash
npx memor
```

That's it. Memor analyzes your codebase and opens an interactive app at `http://localhost:4173`.

## Install (optional)

```bash
npm install -g memor-cli
```

Then run `memor` from any TS/JS project directory.

### Options

```
memor                    # Analyze current directory
memor /path/to/project   # Analyze a specific project
memor --port 3000        # Use a custom port
memor --open             # Auto-open browser after analysis
```

## What You Get

### Overview
A snapshot of what the project is — identity, tech stack, architecture zones, entry point, and a flow preview. One card, instant context.

### Structure
An interactive radial map of the codebase architecture. Navigate zones, drill into systems, see connections and relationships. Progressive disclosure — zones first, then systems inside each zone.

### Flow
Animated storytelling of how the system actually works at runtime. Detects architectural patterns (request pipelines, data flows, dev loops) and presents them as step-by-step timelines with system context, file paths, and fused impact intelligence.

### Impact
"If I change THIS, what breaks?" Select any system and see a directional ripple graph showing direct and indirect downstream impact, risk levels, blast radius, and affected areas.

## How It Works

Memor scans your project structure and source files to detect:

- **Systems** — logical modules, packages, or architectural boundaries
- **Zones** — groups of related systems (e.g., "Core Runtime", "API Layer", "Testing")
- **Connections** — import relationships, extensions, and coupling between systems
- **Flows** — runtime behavior patterns based on detected archetypes
- **Impact** — change propagation paths using the connection graph

Everything is deterministic. Same codebase, same result.

## MCP Integration

Memor can run as an [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server, letting your AI assistant query the architecture directly from your editor.

### Setup

Add to your Cursor/VS Code MCP config:

```json
{
  "memor": {
    "command": "memor-mcp",
    "args": ["/path/to/your/project"]
  }
}
```

### Available Tools

| Tool | Description |
|------|-------------|
| `get_architecture` | High-level architecture overview — repo mode, zones, couplings |
| `list_systems` | All detected systems with type, tier, and description |
| `get_system_detail` | Deep dive into a specific system — connections, blocks, internal structure |
| `get_impact` | Change impact analysis — blast radius, risk levels, affected systems |
| `get_flows` | Runtime flows — how the system actually works step by step |
| `get_zones` | Architectural zones and their member systems |
| `search_systems` | Keyword search across system names, types, tech stacks |
| `get_reading_order` | Recommended order for reading the codebase |
| `get_couplings` | System coupling relationships ranked by strength |

### Available Prompts

| Prompt | Description |
|--------|-------------|
| `understand-codebase` | Architecture-aware understanding prompt |
| `plan-change` | Impact-aware change planning for a specific system |

## Requirements

- Node.js >= 18
- Works on any TS/JS codebase (monorepos, frameworks, libraries, web apps, APIs)

## Contributing

Contributions are welcome! Please open an issue first to discuss what you'd like to change.

## License

[MIT](LICENSE)
