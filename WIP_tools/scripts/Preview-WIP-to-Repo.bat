@echo off
set "WIP=C:\Users\nthomson\Projects\hatpro-schema-temp-WIP"
set "REPO=C:\Users\nthomson\Projects\hatpro-schema-temp"
robocopy "%WIP%" "%REPO%" /E /XO /L /NFL /NDL /NP
pause
