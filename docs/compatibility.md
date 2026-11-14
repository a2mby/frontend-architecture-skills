# Agent compatibility

Status vocabulary: **VERIFIED** = observed in a real run of that agent, **PARTIAL** = some behavior observed, the rest taken from official docs, **UNTESTED** = official docs read (or not) but nothing run, **UNSUPPORTED** = documented as not working. Dated 2026-11-14. One run is an observation, not a guarantee.

The portable core is `name` + `description` + body of each `SKILL.md`, plus `references/`, `assets/`, `scripts/`. Everything else is an adapter:

| Adapter | Purpose | Who honors it |
| ------- | ------- | ------------- |
| `disable-model-invocation: true` in frontmatter | Keep the 7 workflow skills user-invoked | Claude Code (docs), Cursor (docs), OpenCode (docs, observed). Not documented for Codex, Copilot, Gemini CLI |
| `agents/openai.yaml` with `policy.allow_implicit_invocation: false` | Same, for Codex | Codex (docs). Ignored elsewhere |
| `$ARGUMENTS` in the body | Argument substitution | Claude Code only (docs). Elsewhere it appears as literal text, so each skill says "the user's argument" and asks if it is empty |
| `.claude-plugin/` manifests | Plugin install and update | Claude Code only |

| Agent | Where skills go | Status | Evidence and caveats |
| ----- | --------------- | ------ | -------------------- |
| Claude Code 2.1.323, manual install | `~/.claude/skills`, `<project>/.claude/skills` | **VERIFIED** | `evals/run-agent-evals.mjs` drives `claude -p` against project-local installs; the stream shows the named skill loading (`skill-used` checks). See [evals/RESULTS.md](../evals/RESULTS.md) |
| Claude Code, plugin (`fe-arch`) | `claude plugin marketplace add`, `claude plugin install fe-arch@fe-architecture-skills` | **PARTIAL** | `claude plugin validate . --strict` passes. Add and install from a local path worked in an isolated config directory and listed version 0.2.0. Install from GitHub is untested until the branch is pushed. Skills are namespaced `/fe-arch:<skill>` |
| Codex | `<project>/.agents/skills`, `~/.agents/skills` | **UNTESTED** | Docs (learn.chatgpt.com/docs/build-skills) confirm those paths, the `$skill` mention syntax, and `agents/openai.yaml` with `policy.allow_implicit_invocation`. `codex-cli 0.166.0` is installed here, but every model tried (default, `gpt-5-codex`, `gpt-5`) was rejected for this ChatGPT account, so no skill was loaded. Docs do not mention `.claude/skills` |
| Cursor | `.agents/skills`, `.cursor/skills`, also reads `.claude/skills` | **PARTIAL** | Docs list those paths and a `disable-model-invocation` field. `cursor-agent 2026.05.01` run once (`--mode ask`) in a project with an `.agents/skills` install: it listed all 8 skills, including the 7 user-invoked ones, so suppression of implicit use was **not** observed. Explicit `/skill-name` invocation not run |
| OpenCode 2.3.0 | `.agents/skills`, `.opencode/skills`, `.claude/skills`; global equivalents | **PARTIAL** | One `opencode run` (model `big-pickle`) in a project with an `.agents/skills` install listed only `fe-architecture`: discovery works and `disable-model-invocation` hid the workflow skills, as documented. Explicit `@skill-id` loading not run |
| GitHub Copilot (cloud agent, CLI, VS Code agent mode) | `.github/skills`, `.claude/skills`, `.agents/skills`; `~/.copilot/skills`, `~/.agents/skills` | **UNTESTED** | Docs: the model decides when to use a skill from its description; no user-only flag or argument syntax is documented. Expect the workflow skills to be eligible for implicit activation |
| Gemini CLI | `.gemini/skills` or `.agents/skills`; `~/.gemini/skills` or `~/.agents/skills` | **UNTESTED** | Docs only; not installed here. Activation goes through `activate_skill` with a consent prompt; `/skills disable <name>` is the documented control |

## Practical guidance

- **Claude Code:** type the slash form (`/fe-review main`, or `/fe-arch:fe-review main` from the plugin). Naming a workflow skill in prose does not work: the Skill tool refuses model-initiated loading of a `disable-model-invocation` skill (observed: the agent replied that the user must type the slash command). `fe-architecture` is model-invoked and loads automatically.
- **Codex:** mention the skill as `$fe-review`; the 7 workflow skills are explicit-only through `agents/openai.yaml` (documented, not run).
- **Everywhere else:** say "use the fe-check-structure skill on src" (OpenCode: `@fe-check-structure`). Workflow skills may also be offered to the model implicitly in agents that ignore `disable-model-invocation`; that costs a little context and nothing else.
- Skills never depend on argument substitution: they ask the user when the argument is empty.

## Re-verifying

```bash
node scripts/install.mjs --scope project --target agents    # run inside a scratch project
```

then ask the agent to list skills starting with `fe-`, and to run one workflow. Record the version and date here.
