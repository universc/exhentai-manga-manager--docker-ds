# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Layout: single-context

This repo is **single-context**: one repo-wide domain document at the root, shared by every part of the codebase, with architecture decisions in `docs/adr/`. There is no `GLOSSARY-MAP.md` / `CONTEXT-MAP.md` and no per-subproject domain docs.

The skills' convention name for that root document is `GLOSSARY.md` (this is what `/domain-modeling`, `/grill-with-docs` and `/improve-codebase-architecture` write to). This repo refers to the same file as the root domain document / `CONTEXT.md`; create whichever name you settle on once, and treat `GLOSSARY.md` as the file the skills read.

## Before exploring, read these

- **`GLOSSARY.md`** at the repo root (single-context layout).
- **`docs/adr/`**: read ADRs that touch the area you're about to work in.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

**Status at setup time:** neither `GLOSSARY.md` nor `docs/adr/` exists yet. Both are deferred until the first term or first ADR is actually written — do not create empty placeholders.

## File structure

Single-context repo (this repo):

```
/
├── GLOSSARY.md          ← created lazily, first term resolved
├── docs/
│   ├── adr/             ← created lazily, first ADR needed
│   │   └── 0001-....md
│   └── agents/          ← this skill-set's config
└── src/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `GLOSSARY.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_
