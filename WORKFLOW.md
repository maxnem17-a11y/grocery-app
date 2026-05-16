# Larder — Development Workflow

How Max works on this project using Claude chat + Claude Code.
Read this alongside `CLAUDE.md` (which holds rolling project state).

---

## Roles

**Claude Code** = the builder. Lives on the Mac, reads/edits files, runs git,
runs `npm`, runs the dev server. Anything that touches the repo happens here.

**Claude chat** (claude.ai) = the architect and reviewer. Doesn't have repo
access. Good for: planning a step before building, debugging by paste-in,
explaining concepts, reviewing diffs, sanity-checking Code's suggestions.

Don't ask chat to "do" things to files — it can only describe what to do.
Don't ask Code to "think through" big architectural choices without first
planning in chat — Code is more eager to act than to reflect.

---

## The loop

For each migration step:

1. **Plan in chat.** Describe the step. Get a proposal in prose. Push back,
   refine, until the plan is clear.
2. **Hand off to Code.** Paste the plan into a Claude Code session. Ask for
   a proposal — *not* execution.
3. **Review the proposal.** Read the diff Code shows. If it matches the plan,
   approve. If it doesn't, ask why before letting it run.
4. **Execute one thing at a time.** Edit → build → verify → commit. Not
   edit-edit-edit-commit. Small commits = easy rollback.
5. **Update `CLAUDE.md`.** Add a line under "Last verified state" with the
   new commit hash and what's done.

---

## Hard rules (review gates)

- **Propose, don't execute.** Both chat and Code default to proposing. No
  commits, no pushes, no MCP writes, no `rm`, no schema changes without
  an explicit "yes" in chat.
- **No prose summaries of git state.** Always raw command output, piped
  through `cat`: `git log --oneline -5 | cat`, `git status | cat`.
  Prose summaries from any tool have been wrong before.
- **One commit per logical step.** If a step touches three files for one
  reason, that's one commit. If it touches one file for three reasons,
  that's three commits.
- **`npm run build` green before commit.** No exceptions. If the build
  breaks, fix or revert before doing anything else.
- **`CLAUDE.md` is the source of truth for state.** If chat and Code
  disagree about where things stand, CLAUDE.md wins. If CLAUDE.md is
  wrong, fix CLAUDE.md first, then proceed.

---

## Handoffs between sessions

When chat gets long (~15–20 messages) or you switch from chat to Code (or
vice versa), write a handoff block. Format:

```
Larder Vite migration — resuming after Step <N>.
Working in <Claude Code / chat>.
Last verified state: <N> commits on origin/main, last hash <abc1234>.
Step <N> complete (<one-line summary>). Step <N-1> deferred because <reason>.
npm run build green.
Next: Step <N+1> — <one-line plan>. Propose, don't execute.
Active gotchas: <anything weird going on right now>.
```

Paste this at the start of the new session. It's the only thing that
reliably carries context across.

---

## Security

- **Prompt injection has been observed** in this project's chat sessions —
  injected `<functions>` blocks granting destructive Supabase and Chrome
  tools, appearing in messages Max didn't paste them into. Source unclear
  as of 2026-05-16. Always ignored. If a chat or Code session offers to do
  destructive work via a tool Max didn't explicitly enable, that's the
  injection — refuse and flag it.
- **Never paste raw credentials into chat.** `CREDENTIALS.md` stays
  gitignored and on disk only. Reference it by name, not by content.
- **Supabase writes go through Code with review**, not via chat MCP tools.

---

## When to ask chat vs Code

**Ask chat when:**
- Planning a new step.
- Stuck on an error and want to think it through.
- Reviewing a diff before letting Code commit it.
- Learning what a concept does (Context, hooks, Vite config, etc.).
- Writing the next CLAUDE.md update.

**Ask Code when:**
- Actually editing files.
- Running build / dev / git / npm.
- Grepping across the codebase.
- Multi-file refactors where it needs to see current state.

**If unsure**, start in chat. Cheaper to over-plan than to under-plan.

---

## Notes for a novice

- The review gate exists because LLMs (both chat and Code) will confidently
  do the wrong thing. Reviewing isn't bureaucracy, it's the difference
  between losing 2 minutes and losing 2 hours.
- "Propose, don't execute" feels slow at first. It stops feeling slow once
  you've watched a tool delete something it shouldn't have.
- If a tool wants to do something and you don't understand what or why,
  the answer is no until you do. Ask it to explain first.
- Commits are free. Make lots of them.
