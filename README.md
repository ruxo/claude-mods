# claude-mods

Ruxo's Claude Code mods.

| Mod | What it does |
| --- | --- |
| `token-weather` | 5-hour and weekly usage above the prompt, each with its own weather forecast |
| `thinking-pane` | Shows the model's thinking live in a docked pane, as it streams; past thoughts fold |

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install token-weather --marketplace ruxo/claude-mods
/plugin install thinking-pane --marketplace ruxo/claude-mods
```

Answer `y` to add the marketplace, then pick a scope.

From a shell:

```
claude plugin install token-weather --marketplace ruxo/claude-mods
claude plugin install thinking-pane --marketplace ruxo/claude-mods
```

In the desktop app, where `/plugin` does not run: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `ruxo/claude-mods`, then **Add plugin**.
