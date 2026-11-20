---
name: push
description: Commit all local changes and push them to the remote. Use when the user says /push, or asks to commit and push.
---

Commit the working tree and push the current branch.

1. Run `git status --short`, `git diff HEAD --stat` and `git log -5 --oneline` (in parallel) to see
   what changed and the recent message style. If there is nothing to commit, say so; if the branch
   is ahead of its remote, just push.
2. Skip files that shouldn't be committed and tell the user which: secrets (`.env*`, credentials),
   scratch/temp files (e.g. `_fp.mjs`, `scratch-*`), and gitignored fixtures. Stage the rest by
   explicit path (not `git add -A`).
3. Write a conventional commit message from the actual diff: `<type>: <description>` (feat, fix,
   refactor, docs, test, chore, perf, ci), lowercase, no trailing period, plus a short body only if
   the why isn't obvious. Match the style of recent commits. End with the attribution line from
   the session's system reminder, if one is given.
4. Commit (use a heredoc for the message). If a hook fails, fix the cause and make a new commit;
   never `--no-verify`.
5. `git push` (use `git push -u origin <branch>` if there is no upstream). Never force-push. If
   the push is rejected, `git pull --rebase`, resolve, and retry; stop and ask if conflicts are
   non-trivial.
6. Report the commit hash, message, and branch pushed. Pushes to `main` trigger the Railway deploy
   workflow, so mention that when the branch is `main`.
