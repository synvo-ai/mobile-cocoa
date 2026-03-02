# Configuration Files

> **Path:** [`config/`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/config/)

## Function

External JSON configuration files that control AI providers, models, Pi CLI behavior, and skills — no code changes required to modify.

---

## [`models.json`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/config/models.json)

Defines available AI providers, their models, and default selections.

### Structure

```json
{
  "providers": {
    "<provider>": {
      "label": "Display Name",
      "piProvider": "pi-cli-provider-id",
      "defaultModel": "model-value",
      "models": [
        { "value": "model-id", "label": "Display Label" }
      ]
    }
  },
  "modelAliases": {
    "shortName": "pi-cli-model-id"
  }
}
```

### Current Providers

| Provider | Pi Provider | Default Model | Available Models |
|----------|-------------|---------------|------------------|
| `claude` | `anthropic` | `sonnet4.5` | Sonnet 4.5, Opus 4.5, Haiku 4.5 |
| `gemini` | `google-gemini-cli` | `gemini-3.1-pro-preview` | 2.5 Flash, 3 Flash Preview, 3 Pro Preview, 3.1 Pro Preview |
| `codex` | `openai-codex` | `gpt-5.1-codex-mini` | GPT-5.1 Codex Mini, GPT-5.2 Codex, GPT-5.3 Codex |

### Workflow

- Server reads on every `/api/models` request (hot-reloadable)
- Mobile app fetches via `fetchModelsConfig()` and caches in memory
- Model aliases map short names to Pi CLI IDs (e.g., `sonnet4.5` → `claude-sonnet-4-5`)

### How to Add a Model

1. Add entry to the provider's `models` array
2. If using a short name, add to `modelAliases`
3. No server restart needed — changes take effect on next API call

---

## [`pi.json`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/config/pi.json)

Configures Pi CLI behavior: path, permissions, provider mapping, routing rules, and system prompts.

### Key Fields

| Field | Description |
|-------|-------------|
| `cliPath` | Path to Pi binary (default: `"pi"` on PATH) |
| `autoApproveToolConfirm` | Auto-approve tool execution confirms (yolo mode when `true`) |
| `providerMapping` | Direct provider → Pi provider mapping (`claude→anthropic`, `codex→openai-codex`) |
| `providerRouting.rules` | Regex-based model → provider routing (evaluated in order, first match wins) |
| `providerRouting.fallback` | Fallback provider per client provider |
| `defaultModels` | Default models per Pi provider |
| `systemPrompts.terminalRules` | Terminal command rules injected into system prompt |

### Provider Routing Rules

| Pattern | Routes To |
|---------|-----------|
| `^gemini-` | `google-gemini-cli` |
| `codex` | `openai-codex` |
| `^gpt-\|^codex-` | `openai` |
| `^claude-\|^sonnet\|^opus` | `anthropic` |

---

## [`skills.json`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/config/skills.json)

Configures skill discovery and categorization.

**Related work log**: [Add Skill (Discover, Install, Create) UI + API (March 3)](./march3/skill-discovery-install-create-ui.md)

### Key Fields

| Field | Description |
|-------|-------------|
| `skillsLibraryDir` | Directory containing skills (`server/skills/library`) |
| `skillsEnabledFile` | Enabled skills record (`server/skills/enabled.json`) |
| `skillsEnabledDir` | Symlinked enabled skills dir (`server/skills/enabled`) |
| `skillFileName` | Skill file name pattern (`SKILL.md`) |
| `defaultCategory` | Category for uncategorized skills (`Development`) |
| `categories` | Skill ID → category mapping |

### Categories

| Category | Skills |
|----------|--------|
| Development | fullstack-software-engineer, react-native-animations, refactor, test-driven-development, terminal-runner |
| UI/UX | ui-ux-pro-max, enhance-prompt |
| DevOps | git-advanced-workflows, using-git-worktrees, finishing-a-development-branch |
| Debug | systematic-debugging, receiving-code-review, requesting-code-review, verification-before-completion |
| Prompt | brainstorming, dispatching-parallel-agents, executing-plans, subagent-driven-development, using-superpowers, writing-plans, writing-skills |

## How to Use

Edit any JSON file directly. Changes to `models.json` are hot-reloaded on next API request. Changes to `pi.json` and `skills.json` take effect on next session creation (Pi process spawn).

## [`skills-lock.json`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/skills-lock.json)

Tracks installed skill metadata for remote installs and locally created skills.

### Structure

```json
{
  "version": 1,
  "lockVersion": 2,
  "entries": [
    {
      "id": "refactor",
      "name": "Refactor",
      "path": "server/skills/library/refactor",
      "source": "find-skills",
      "sourceType": "find-skills",
      "sourceUrl": "https://github.com/openai/skills/tree/main/skills/.curated/refactor",
      "repoUrl": "https://github.com/openai/skills",
      "sourceRef": "main",
      "version": "latest",
      "installedAt": "2026-03-03T00:00:00.000Z",
      "createdAt": "2026-03-03T00:00:00.000Z",
      "category": "Development"
    }
  ]
}
```

### Semantics

- `lockVersion` is updated by the skill management endpoints when writing lock metadata.
- `source` and `sourceType` describe origin (`find-skills`, `github`, `skill-creator`, `local`).
- `sourceRef`/`version` hold catalog ref or commit metadata when present.
- `path` is the resolved folder in `skillsLibraryDir`.
- `installedAt` and `createdAt` are used for UI display and audit history.

Legacy formats with only a `skills` object map are still parsed for compatibility.

## How to Test

```bash
# Verify models config loads correctly
curl http://localhost:3456/api/models | python3 -m json.tool

# Verify skills config
curl http://localhost:3456/api/skills | python3 -m json.tool
```
