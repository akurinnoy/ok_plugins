# ok-plugins

Custom Claude Code plugin marketplace by akurinnoy.

## Plugins

| Plugin | Description |
|--------|-------------|
| [ok-pr-review](./plugins/ok-pr-review) | PR review suite: summary, standard review, deep review, impact review, domain profiling, comment posting |
| [ok-prerelease-verification](./plugins/ok-prerelease-verification) | DWO prerelease verification checklist generator |
| [ok-obsidian-logger](./plugins/ok-obsidian-logger) | Obsidian daily note logger |

## Installation

### 1. Register the marketplace (one-time)

In Claude Code, run:

```
/plugin marketplace add
```

Select "GitHub repository" and enter `akurinnoy/ok_plugins`.

### 2. Install plugins

```
/plugin install ok-pr-review@ok-plugins
/plugin install ok-prerelease-verification@ok-plugins
/plugin install ok-obsidian-logger@ok-plugins
```

## Adding New Plugins

1. Create a new directory under `plugins/`
2. Add `.claude-plugin/plugin.json` manifest
3. Add skills, commands, or agents
4. Register in `.claude-plugin/marketplace.json`
