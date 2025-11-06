# When and Why to Run a Snapshot REPO

## The Rule of Thumb

Do **Snapshot REPO** **before** any action that could change or delete files in your local repo working tree **without your explicit per-file control**.

---

## When to Snapshot (YES)

- **Before `pull` (merge or rebase) when you have local edits**  
  *Why:* an incoming change could conflict and force resolutions or overwrites.

- **Before switching branches with uncommitted work**  
  *Why:* checkout may refuse or you may discard to proceed.

- **Before running “clean”/generator tasks** (`npm run clean`, codegen that rewrites files)  
  *Why:* these can delete or regenerate folders.

- **Before “Discard changes” in GitHub Desktop**  
  *Why:* discard deletes local edits to tracked files.

- **Before a large refactor/rename sweep**  
  *Why:* many paths will change; easy to misplace something.

- **Before resolving messy merge conflicts**  
  *Why:* you may experiment and want an easy revert.

---

## When a Snapshot Is Optional / Usually Not Needed (NO)

- **After `fetch`** — only updates remote refs, does not touch files.  
  → **No snapshot needed**.

- **After a simple `push`** — uploads your commits.  
  → **No snapshot needed**.

- **`pull` into a clean tree with no local edits** (fast-forward).  
  → **No snapshot needed**.

---

## Simple Decision Tree

| Question | Action |
|-----------|---------|
| Do I have uncommitted or untracked local changes? | **Yes → Snapshot before pull / branch switch / clean / discard** |
| | **No → Safe to pull or switch without snapshot** |

---

## Why Do It Before Pull (Not After)?

- A snapshot taken **before** the pull preserves the exact pre-pull state, so if the pull introduces conflicts or regenerations, you can restore or diff easily.  
- A snapshot taken **after** a pull won’t help you revert to the pre-pull state if something went wrong during the pull.

---

## Quick Scenarios

| Situation | Recommended Action |
|------------|--------------------|
| Edited schemas or examples; want to pull team updates | Run **Snapshot REPO** first, then pull |
| About to run `npm run clean` | Run **Snapshot REPO** first |
| Switching from `chore/local-sync-2025-10-30` to `main` with local changes | Run **Snapshot REPO** first, then switch (or commit/stash) |

---

**Summary:**  
Snapshot **before** risky, file-changing operations; skip it for **fetch/push** and most **pulls on a clean tree**.
