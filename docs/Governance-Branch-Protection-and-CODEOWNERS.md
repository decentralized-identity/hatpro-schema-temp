# Branch Protections & CODEOWNERS (Project Governance)

This repo starts **solo** (fast, no PR overhead) and will later switch to **team** mode (PRs, reviews). Use the presets below when you’re ready.

---

## TL;DR

- **Solo-safe (default now):** push straight to `main`, but prevent accidents (no force-push, no delete).
- **Team-ready (when ≥2 contributors):** all changes via PRs, 1+ review, optional CI checks.

---

## Quick glossary

- **Commit**: save a change locally.
- **Push**: send your commits to GitHub.
- **Pull**: bring GitHub commits down to your local clone.
- **Pull Request (PR)**: a *server-side* request to merge **your branch** into a **target branch** on GitHub.
- **Branch protection rules**: guard rails applied to a branch (e.g., require PRs, approvals).
- **`CODEOWNERS`**: a file that maps **paths → owners** (users or org teams). GitHub auto-requests those owners on PRs and (optionally) requires their approval.

---

## What is the purpose of CODEOWNERS
This identify project personel who are key GitHub contributors by GitHub handle (e.g., neiljthomson) or a team (there are DIF teams defined  - see: https://github.com/orgs/decentralized-identity/teams, for this DIF project it's ht-wg) who must participate in a pull-request review. This will be done for each collection (segment) of the HATPro classes (e.g., Communication Channels or Food/Diet/Cuisines) which will correspond to the branches of the HATPRo github folder organization (which is graph/tree like). This does not exclude other project members from participating in pull request review, it just identifies the key people who must review before the pull request is approvedl  

## File locations (very important)

Place the CODEOWNERS file at **one** of:
- `.github/CODEOWNERS`  ← **recommended**
- `CODEOWNERS` (repo root)
- `docs/CODEOWNERS`

> The filename is **exactly** `CODEOWNERS` (no extension).  
> The folder `.github` is a **regular folder** tracked in the repo.

---

## Our folder layout (segment-oriented ownership)

Ownership is by **segment** (top class + its fan-out), not by file type. Organize code accordingly:

```
model/
  puml/
    segments/
      core/
      identity/
      preferences/
      ...
    views/
  schema/
    segments/
      core/
      identity/
      preferences/
      ...
    examples/
```
This lets CODEOWNERS assign a whole **segment** with a single path rule.

---

## CODEOWNERS (how to write it)

- Use **GitHub identities**:
  - Person: `@neiljthomson` (globally unique handle — last part of your profile URL)
  - Team in org: `@decentralized-identity/<team-slug>` (team **slug** is the last part of the team URL, e.g., `ht-wg`)
- One rule per line: `<path-glob> <one or more owners>`
- Globs allowed: `*`, `?`, `**`
- **No negation** (`!`)—instead, rely on **order**: **last match wins**

### CODEOWNERS starter for this repo

Create `.github/CODEOWNERS`:

```
# Fallback owner for everything
*                                                     @neiljthomson

# Segment owners (PUML)
model/puml/segments/core/**                           @decentralized-identity/ht-wg @neiljthomson
model/puml/segments/identity/**                       @decentralized-identity/ht-wg
model/puml/segments/preferences/**                    @decentralized-identity/ht-wg

# Segment owners (JSON Schema)
model/schema/segments/core/**                         @decentralized-identity/ht-wg @neiljthomson
model/schema/segments/identity/**                     @decentralized-identity/ht-wg
model/schema/segments/preferences/**                  @decentralized-identity/ht-wg

# Views and examples (override; last match wins)
model/puml/views/**                                   @neiljthomson
model/schema/examples/**                              @neiljthomson
```

> Adjust segments as you add more (payments, itinerary, loyalty, health, etc.).  
> You can list multiple owners separated by spaces.

### How GitHub uses it

- On a PR, GitHub finds the **last matching rule** for each changed file and **auto-requests** those owners as reviewers.
- If branch protection enables **“Require review from Code Owners”**, at least **one owner per owned path** must approve the PR.
- If an owner is a **team**, **any team member** with repo access can approve to satisfy the rule.

> Make sure the team (e.g., `@decentralized-identity/ht-wg`) has access to this repo  
> (**Org → Teams → ht-wg → Repositories → Add repository**).

---

## Branch protection rules

### Solo-safe (use now while you’re the only contributor)

**GitHub → Repo → Settings → Branches → Branch protection rules → Add rule**  
**Branch name pattern:** `main`

Turn **ON**
- ✅ Protect matching branches
- ✅ Do not allow force pushes
- ✅ Do not allow deletions
- ✅ Require linear history *(optional but recommended)*

Leave **OFF** (for now)
- ❌ Require a pull request before merging
- ❌ Require approvals / Require review from Code Owners
- ❌ Require status checks

This lets you commit/push to `main` quickly while guarding against accidents.

### Team-ready (enable when another contributor joins)

Edit the same rule for `main`:

Turn **ON**
- ✅ Protect matching branches
- ✅ Require a pull request before merging
  - ✅ Require approvals: **1**
  - ✅ Require review from **Code Owners**
  - ✅ Dismiss stale approvals when new commits are pushed
- ✅ Require linear history
- ✅ Do not allow force pushes
- ✅ Do not allow deletions
- ✅ (Optional) Require status checks to pass
  - ✅ (Optional) Require branches to be up to date before merging

**PR merge policy (recommended):**  
Repo **Settings → General → Pull Requests**
- Allow **Squash merge** only (keeps history tidy)
- Disable “Merge commits”
- (Optional) Allow “Rebase and merge” if preferred

---

## Day-to-day workflows

### While solo
```
Edit → Commit to main → Push origin
```
(Occasionally) Pull origin.  
Tip (one-time, if you use CLI): `git config --global pull.rebase true`

### With a team
```
Branch → New Branch (feat/xyz)
Edit → Commit on the branch → Publish branch
Create Pull Request → Review (Code Owners) → Squash & Merge
Switch to main → Pull origin
```

---

## FAQ

**Are handles emails?**  
No. Use `@username` or `@org/team-slug`. Your handle is the last part of your profile URL, e.g., `@neiljthomson`.

**What’s a team slug?**  
The URL-friendly team name (e.g., `https://github.com/orgs/decentralized-identity/teams/ht-wg` → slug `ht-wg`). In CODEOWNERS, reference as `@decentralized-identity/ht-wg`.

**Can non-owners approve a PR?**  
They can review, but if “Require review from Code Owners” is on, **at least one matched owner** must approve for each owned path.

**We want ownership by class, not file type.**  
CODEOWNERS is **path-based**. Put each segment (top class + fan-out) in its own folder and assign owners by those paths.
