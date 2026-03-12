# ok-plugins

Custom Claude Code plugins by akurinnoy.

## Plugins

| Plugin | Description |
|--------|-------------|
| [ok-pr-review](./plugins/ok-pr-review) | Two-stage PR review: standard review + deep review |

## Installation

Plugins can be installed via Claude Code's plugin system:

```
/plugin install <plugin-name>@ok-plugins
```

## Adding New Plugins

1. Create a new directory under `plugins/`
2. Add `.claude-plugin/plugin.json` manifest
3. Add skills, commands, or agents
4. Register in `.claude-plugin/marketplace.json`
