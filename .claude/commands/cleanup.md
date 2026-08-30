---
description: Review merged worktrees/branches (and agent tmux/bg processes) and remove them one by one on confirmation
---

Clean up leftover worktrees and branches for this repo. **Never delete anything without my explicit per-item confirmation.**

## 1. Gather

- `git remote show origin | sed -n 's/.*HEAD branch: //p'` — the default branch (fall back to `main`).
- `git fetch --prune origin` — drop stale remote-tracking refs.
- `git worktree list` — all worktrees.
- `git branch --merged <default>` and `git branch -r --merged origin/<default>` — merged branches.
- `git branch --no-merged <default>` — for the "still active" list.
- For each non-merged branch that looks done, also test `git cherry -v <default> <branch>` / compare `git diff <default>...<branch>` — a squash-merged branch shows as un-merged but has an empty diff. Treat "empty diff vs default" as merged.

## 2. Classify

Build a table of every worktree and every local branch (plus merged remote branches):

| item | type | merged into <default>? | notes |

- **Safe to remove:** merged, or empty diff vs default; not the current branch; not the default branch; worktree has no uncommitted changes (`git -C <path> status --porcelain`).
- **Keep:** unmerged with real diff, currently checked out, the default branch, or a worktree with uncommitted/untracked changes (say which).

## 3. Agent processes (list only)

- `tmux ls 2>/dev/null` — sessions whose names reference this repo or its agents.
- `git worktree list` paths under a temp/agent dir (e.g. `vibe-kanban/worktrees`) and any `ps`-visible `claude`/agent processes with `cwd` in this repo.
- List these with PID / session name. **Do not kill anything yet.**

## 4. Confirm, then act per item

Present the summary. Ask me to pick which items to remove — by number, not all-or-nothing. Then for each confirmed item only:

- Worktree: `git worktree remove <path>` (add `--force` only if I say so), then `git worktree prune`.
- Branch: `git branch -d <name>` (never `-D` unless I explicitly ask), then `git push origin --delete <name>` only if I asked to remove the remote branch too.
- tmux/process: `tmux kill-session -t <name>` / `kill <pid>` — only for items I named explicitly.

Report what was removed and what was left.
