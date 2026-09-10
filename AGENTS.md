# Working in this repository

These instructions apply to Codex and other coding agents working in this
repository. `CLAUDE.md` remains the detailed architecture and conventions
reference. The user's current request takes precedence if it explicitly asks
for a different workflow.

## Before changing code

1. Read `CLAUDE.md` before touching files.
2. Read `PLAN.md` when the task affects planned work or project status.
3. For buddy-system work, also read `docs/domains/buddy.md`.
4. For translation or i18n work, also read `docs/domains/translate.md`.
5. Trace the relevant code path end to end before choosing an approach.
6. When the user invokes `/graphify`, follow the installed graphify skill before
   doing anything else. For other codebase questions, query an existing
   `graphify-out/graph.json` first when available.

## Making changes

- Make the smallest complete change that solves the request.
- Reuse existing code and prefer platform or standard-library features over new
  dependencies.
- Keep build-time logic framework-free.
- Keep `src/lib/schema.js`, `worker/collections.js`, and content JSON in
  lockstep. Preserve every required `carry` field.
- Follow the CSP, localization, content, image, and motion rules in
  `CLAUDE.md`.
- Preserve unrelated user changes in a dirty worktree.
- Update `PLAN.md`, `PLAN-ARCHIVE.md`, and domain documentation when the task
  changes what those files claim.

## Verification

A code change is complete only after these commands pass:

```bash
npm test
npm run build
npm run check
npm run check:dist
```

For content or rendering changes, also check the relevant built HTML for the
expected output. For layout, CSS, or motion changes, run
`npm run audit:browser` and inspect the screenshots at the affected viewport,
including a long-label locale where relevant.

Run focused checks while iterating, then run the full set once on the final
state. After a rebase or conflict resolution, run the full set again. Report
any failed or skipped check and include the useful part of its output.

Until the user says `ship it`, keep changes local. Do not commit, push, open a
pull request, deploy, or merge unless the user separately asks for one of those
actions.

## `ship it`

`ship it` is standing authorization to perform the full release gesture for the
current changes:

1. Fetch the latest remote state.
2. If on `main`, create a focused feature branch from up-to-date `main`. If
   already on a suitable feature branch, stay on it.
3. Rebase onto current `origin/main` before shipping when the branch is stale.
4. Resolve conflicts by preserving the intent of both changes, then rerun the
   full verification set.
5. Commit in one coherent commit, or a few coherent commits when the work has
   genuinely separate parts. Use conventional-commit messages.
6. Push the feature branch.
7. Open a pull request against `main` with a concise summary and the checks that
   ran. End the description with `🤖 Generated with Codex`.

Do not add a Claude co-author trailer. Do not invent a Codex email address for a
co-author trailer. Git's configured author records the commit, and the pull
request footer records Codex's involvement.

Never merge the pull request as part of `ship it`. Merging stays with the user
unless they explicitly request it.

## After a pull request opens

- If GitHub reports textual conflicts, rebase the branch onto the latest
  `origin/main`, resolve the conflicts by hand, rerun all four required checks,
  and update the branch with `--force-with-lease`.
- If CI fails without a textual conflict, inspect the failing job, fix the
  cause, verify locally, and push the fix to the same branch.
- Guard against clean-looking semantic conflicts when both branches touch
  `src/lib/schema.js`, `worker/collections.js`,
  `src/lib/translate/glossary.js`, `public/_headers`, shared CSS tokens,
  dictionaries, or `PLAN.md`. Recheck those relationships against current
  `main` before handoff.
- Refresh stale pull requests early. A branch that waits while `main` moves
  should be rebased and reverified before merge.
