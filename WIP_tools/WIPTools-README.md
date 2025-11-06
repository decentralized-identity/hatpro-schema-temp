# WIP Tools — Deployment & Workflow (Windows)

**NOTE**: this README assumes the repo project name is **hatpro-schema-temp**. If the repo is different project, then change the information in this file according

Authoritative copies of the **repo command files** live in this repo under `WIPTools/`.
You **run** them from your WIP area:

```
C:\Users\nthomson\Projects\hatpro-schema-temp-WIP\repoCmdFiles\
```

## 1) First-time install (copy from repo → WIP)

> Replace `<REPO>` with your local repo path if different.

```bat
robocopy "<REPO>\WIPTools\scripts" "C:\Users\nthomson\Projects\hatpro-schema-temp-WIP\repoCmdFiles" *.bat /E /R:2 /W:2
robocopy "<REPO>\WIPTools\docs"    "C:\Users\nthomson\Projects\hatpro-schema-temp-WIP\repoCmdFiles\docs" *.*  /E /R:2 /W:2
```

**Preview only (no writes):**
```bat
robocopy "<REPO>\WIPTools\scripts" "C:\Users\nthomson\Projects\hatpro-schema-temp-WIP\repoCmdFiles" *.bat /E /L /R:1 /W:1
robocopy "<REPO>\WIPTools\docs"    "C:\Users\nthomson\Projects\hatpro-schema-temp-WIP\repoCmdFiles\docs" *.*  /E /L /R:1 /W:1
```
- `/E` = include subfolders
- `/L` = list only (dry run)
- `/R:2 /W:2` = retry/wait limits (faster)

---

## 2) Daily WIP workflow (your canonical flow)

1. **Work in WIP**  
   Edit files under `...\hatpro-schema-temp-WIP\repoCmdFiles\` (and `docs\`).

2. **(Optional) Merge from repo copy**  
   If needed, manually merge changes from `WIPTools/source/...` into your WIP copy.

3. **Overwrite the repo copy with your WIP result**  
   When your WIP change is ready to publish back to the repo:

   ```bat
   robocopy "C:\Users\nthomson\Projects\hatpro-schema-temp-WIP\repoCmdFiles" "<REPO>\WIPTools\source\scripts" *.bat /E
   robocopy "C:\Users\nthomson\Projects\hatpro-schema-temp-WIP\repoCmdFiles\docs" "<REPO>\WIPTools\source\docs" *.* /E
   ```

   *Tip:* use `/XO` if you want to **skip** overwriting newer files in the destination, or `/L` first to preview.

4. **Commit & PR (from repo)**  
   - In GitHub Desktop: stage changed files under `WIPTools/source/...`
   - Commit with a clear message (e.g., `chore(WIPTools): update Merge-WIP-to-Repo.bat and docs`)
   - Push → Open Pull Request

---

## 3) Updating WIP from repo later

When the repo’s authoritative files change and you want them in WIP:

```bat
robocopy "<REPO>\WIPTools\scripts" "C:\Users\nthomson\Projects\hatpro-schema-temp-WIP\repoCmdFiles" *.bat /E
robocopy "<REPO>\WIPTools\docs" "C:\Users\nthomson\Projects\hatpro-schema-temp-WIP\repoCmdFiles\docs" *.*  /E
```

**Preview first:**
```bat
robocopy "<REPO>\WIPTools\scripts" "C:\Users\nthomson\Projects\hatpro-schema-temp-WIP\repoCmdFiles" *.bat /E /L
robocopy "<REPO>\WIPTools\docs" "C:\Users\nthomson\Projects\hatpro-schema-temp-WIP\repoCmdFiles\docs" *.*  /E /L
```

---

## 4) Safety tips

- Use **`/L`** to preview before copying (dry run).
- Keep batch files CRLF in Git: add to `.gitattributes`:
  ```
  WIPTools/**/*.bat text eol=crlf
  ```
- Consider adding a quick **snapshot** command you run from WIP before risky ops (optional).

---

## 5) Paths used in examples

- Repo (local):  
  `C:\Users\nthomson\Projects\hatpro-schema-temp`
- WIP runtime:  
  `C:\Users\nthomson\Projects\hatpro-schema-temp-WIP\repoCmdFiles\`
- Authoritative repo copies:  
  - Scripts: `WIPTools\source\scripts\`
  - Docs: `WIPTools\source\docs\`

> If your local paths differ, replace them in the commands above.
