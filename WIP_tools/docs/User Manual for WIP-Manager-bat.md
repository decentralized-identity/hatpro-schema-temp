Here’s the plain-English summary for the three actions in WIP-Manager.bat (and the identical single-purpose .bat files). This is exactly what they do and how they protect work-in-progress:

## Snapshot REPO → _snapshots\YYYYMMDD_HHMMSS\
What it does:
Makes a full, read-only copy of your repo into a brand-new timestamped folder under …\hatpro-schema-temp-WIP\_snapshots\.
Why it’s safe:


It never touches your live WIP folder or your repo — it only writes into a new folder.


Uses robocopy /MIR only to mirror repo → that new snapshot location.


Excludes junk like .git, node_modules, etc.



## Preview WIP → REPO (dry run)
What it does:
Shows what would be copied from your WIP into your repo — without copying anything.
Why it’s safe:


It’s a dry run (/L flag). It prints the list but makes no changes.


Lets you confirm exactly which files would be updated before you do anything real.


## Merge WIP → REPO (copy only newer WIP files; no deletes)
What it does:
Copies your edits from WIP into the repo so you can review/commit in GitHub Desktop.
Why it avoids clobbering work:


Uses robocopy /E /XO


/XO = Exclude Older source files → only newer files in WIP can overwrite files in the repo.


If the repo’s copy is newer, it is left alone.




No /MIR here → it never deletes files in the repo. It’s additive/overwriting only when WIP is newer.


You’ll still review diffs in GitHub Desktop before committing, so you have a final gate.



# Quick mental model


Snapshot = copy repo ➜ new archive folder (write-only to a new place).


Preview = “show me what would happen” (no changes).


Merge = copy WIP ➜ repo, but only when WIP files are newer, and never delete repo files.


These steps do not depend on Git staging or commits; they operate on the filesystem, so GitHub Desktop’s staged/unstaged state won’t cause partial copies.
