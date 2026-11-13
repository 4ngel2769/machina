# Contributing to Macina

This file is the single source of truth for how code is written in this repo.
It applies equally to human contributors and AI coding agents.

If you're an agent: read this whole file before writing any code, and run
the **Definition of Done** checklist before you consider a task complete.

---

## 1. Before you touch code

This repo uses **bun** as its package manager and script runner. Do not use
`npm`, `yarn`, or `pnpm`. If a `bun.lockb` / `bun.lock` exists, it is the
source of truth — never regenerate it with a different tool.

```bash
bun install           # install dependencies
bun run typecheck     # tsc --noEmit
bun run lint          # eslint .
bun run test          # vitest / jest
```

Every command must pass clean before and after your change. If you can't run
them, say so explicitly rather than assuming they pass.

**Do not** upgrade dependencies, reformat unrelated files, or refactor code
outside the scope of your task. Keep diffs minimal and reviewable.

---

## 2. Coding principles

### 2.1 Readability beats cleverness
Prefer the simplest form a reader can follow top-to-bottom. If a shorter
version is harder to read, it's worse code — not better.

### 2.2 Names carry meaning
- `camelCase` — functions, variables, parameters
- `PascalCase` — types, classes, interfaces, enums
- `UPPER_SNAKE_CASE` — true constants only
- Booleans read as predicates: `isReady`, `hasAccess`, `canRetry`
- Functions are verbs: `parseConfig`, `loadUser`, `sendRequest`
- No abbreviations except well-known ones (`id`, `url`, `http`). No `data`,
  `info`, `temp`, `obj`, `thing`, `stuff`.

### 2.3 One function, one job
If you can't describe a function in one sentence without "and", split it.
A function should read top-to-bottom without the reader jumping around.

### 2.4 Shallow nesting
Use early returns and guard clauses. Maximum **3 levels** of nesting inside
any function. Extract a helper rather than add another `if`.

```ts
// Bad — 4 levels deep, hard to follow
function process(items) {
  if (items) {
    for (const item of items) {
      if (item.valid) {
        if (item.ready) {
          handle(item)
        }
      }
    }
  }
}

// Good — flat, obvious
function process(items: Item[]) {
  if (!items?.length) return
  for (const item of items) {
    if (!item.valid || !item.ready) continue
    handle(item)
  }
}
```

### 2.5 Small files and functions
- File: **≤ 300 lines**
- Function: **≤ 40 lines**
- Cyclomatic complexity: **≤ 10**

Enforced by ESLint. Don't disable these rules — split the code instead.

### 2.6 Modularize by cohesion, not by line count
Extract a function into its own file when it:
- forms a cohesive module, **or**
- is used by more than one file.

Keep tightly coupled, single-use helpers next to their caller. Every file
starts with a header comment:

```ts
/**
 * User authentication: token issuance, verification, and refresh.
 */
```

### 2.7 Push side effects to the edges
Pure functions in the core. I/O, state mutation, clocks, and randomness live
at the boundaries so behavior is predictable and testable.

```ts
// Bad — core logic depends on global state and time
export function isExpired(token: Token): boolean {
  return token.expiresAt < Date.now()
}

// Good — pure, callable from anywhere, trivially testable
export function isExpired(token: Token, now: number): boolean {
  return token.expiresAt < now
}
```

### 2.8 Comments explain *what* and *why*, never *how*
If you need a comment to explain how the code works, rewrite the code. Keep
comments for:
- intent, non-obvious constraints, trade-offs
- links to the issue, RFC, or spec that motivated the code
- warnings (`// SAFETY: ...`, `// NOTE: ...`)

Delete commented-out code. Git remembers it.

---

## 3. TypeScript rules

- **No `any`.** Use `unknown` + narrowing, or generics.
- **No type assertions** (`as Foo`) unless you can prove the shape. Prefer
  validation at the boundary (zod, io-ts, a hand-written guard).
- **External input is `unknown`** until narrowed. API responses, `JSON.parse`,
  `process.env`, and `window.*` are not typed just because you say so.
- **Explicit return types** on exported functions.
- **Discriminated unions** over optional fields for state:

```ts
// Prefer this
type Result<T> = { ok: true; value: T } | { ok: false; error: Error }

// Over this
type Result<T> = { value?: T; error?: Error }
```

`tsconfig.json` must keep `strict: true`, `noUncheckedIndexedAccess: true`,
`exactOptionalPropertyTypes: true`. Do not weaken these.

---

## 4. Error handling

One convention, everywhere: **`Result<T>` for expected failures, `throw` for
programmer errors.** Do not mix.

- Expected failures (validation, 4xx responses, missing records) → return
  `Result<T>`.
- Programmer errors (invariant violations, impossible states) → `throw`.

Never swallow errors with an empty `catch`. Always either handle, rethrow, or
convert to `Result`.

```ts
// Bad
try { await save(user) } catch {}

// Good
const result = await save(user)
if (!result.ok) return logAndFail(result.error)
```

**Where this applies in this codebase.** `Result<T>` lives in
`lib/core/result.ts` and is adopted by core validators (`checkSnapshotName`,
`validateCustomSpecSafe`). API route handlers keep a different, deliberate
convention: they `throw` for unexpected failures and return `err(message, status)`
for expected ones, with `friendlyError()` translating raw tool output into
user-safe sentences at the boundary. Do not convert routes to `Result` — the
route surface is already uniform, and `err()` IS the route-level Result.

**Deliberate swallows** use `ignore('reason')` from `lib/core/ignore.ts` instead
of `.catch(() => {})`, so the reason is readable at the call site. An empty
`catch {}` is only acceptable with a comment saying why silence is correct.

---

## 5. Testing

- Every new module gets a `*.test.ts` sibling.
- Every new function with branches gets at least one test per branch.
- Tests are named for the behavior, not the function:
  `it('rejects tokens past their expiry', ...)`.
- No snapshot tests for logic. Snapshots are for serialized output only.
- Tests must not hit the network, disk, or system clock. Inject those.

Run tests with `bun run test`. Bun's native runner is fine for new suites;
existing Vitest/Jest suites stay as they are until migrated deliberately.

---

## 6. Git and PRs

- Branch names: `feat/…`, `fix/…`, `chore/…`, `docs/…`.
- Commit messages: imperative mood, present tense
  (`add token refresh`, not `added` or `adds`). First line ≤ 72 chars.
- One logical change per PR. Do not mix refactors with features.
- PR description says **what** changed and **why**. Link the issue.

---

## 7. Definition of Done

Before opening a PR (or reporting a task complete, if you're an agent), all
of the following must be true:

- [ ] `bun run typecheck` passes with no errors
- [ ] `bun run lint` passes with no warnings
- [ ] `bun run test` passes
- [ ] New behavior has tests
- [ ] No `any`, no `as` casts without justification, no `@ts-ignore`
- [ ] No files over 300 lines, no functions over 40 lines, no nesting over 3
- [ ] No commented-out code, `console.log`, or debug leftovers
- [ ] New files start with a header comment
- [ ] Diff is scoped to the task — no unrelated reformatting
- [ ] Public API changes are documented (README or JSDoc)
- [ ] No `package-lock.json`, `yarn.lock`, or `pnpm-lock.yaml` introduced

If any box can't be checked, say so in the PR description. Do not claim
completion you haven't verified.

---

## 8. For AI agents

- **Read this file first.** It overrides your defaults.
- **Use `bun` for everything.** Never run `npm`, `yarn`, or `pnpm install` —
  doing so will corrupt the lockfile and fail CI.
- **Do not disable lint rules.** Fix the code, don't silence the tool.
- **Do not reformat unrelated files.** If Prettier changes a file you didn't
  touch, revert it.
- **Do not add dependencies** without explicit instruction.
- **Do not invent APIs.** If a function you need doesn't exist, say so.
- **Verify before claiming done.** Run the Definition of Done commands and
  paste their output if asked.
- **When in doubt, ask.** A one-line question beats a 500-line wrong diff.

---

*Last updated: <date>. If a rule here conflicts with a tool's default, this
file wins.*