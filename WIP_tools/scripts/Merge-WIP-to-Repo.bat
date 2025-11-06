@echo off
set "WIP=C:\Projects\hatpro-schema-temp-WIP"
set "REPO=C:\Projects\hatpro-schema-temp"
robocopy "%WIP%" "%REPO%" /E /XO /R:2 /W:2 /NFL /NDL /NP
echo Done. Review in GitHub Desktop, then commit.
pause
