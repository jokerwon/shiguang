# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`docs/glossary.md`** — this repo's ubiquitous-language doc. It exists today and is authoritative for term semantics; field-level facts still come from `apps/server/prisma/schema.prisma`.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in (this repo keeps them here, not under `src/`).
- **`CONTEXT.md`** at the repo root, or **`CONTEXT-MAP.md`** if it exists: it points at one `CONTEXT.md` per context. Read each one relevant to the topic.

If `CONTEXT.md` / `CONTEXT-MAP.md` don't exist, **proceed silently** — `docs/glossary.md` + `docs/adr/` are the domain sources. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

Single-context repo (this one):

```
/
├── CONTEXT.md                         ← does not exist yet; /domain-modeling creates it lazily
├── docs/
│   ├── glossary.md                    ← ubiquitous language, exists today
│   └── adr/                           ← 0001…0016, decisions only, never edited in place
├── apps/
│   ├── web/
│   └── server/
└── packages/
    └── domain/
```

Multi-context repo (presence of `CONTEXT-MAP.md` at the root):

```
/
├── CONTEXT-MAP.md
├── docs/adr/                          ← system-wide decisions
└── src/
    ├── ordering/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  ← context-specific decisions
    └── billing/
        ├── CONTEXT.md
        └── docs/adr/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `docs/glossary.md` (or `CONTEXT.md` once it exists). Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in `docs/glossary.md`, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0016 (mobile client removed), but worth reopening because…_
