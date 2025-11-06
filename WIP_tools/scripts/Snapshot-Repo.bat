@echo off
set "REPO=C:\Users\nthomson\Projects\hatpro-schema-temp"
set "WIP=C:\Users\nthomson\Projects\hatpro-schema-temp-WIP"
set "SNAPROOT=%WIP%\_snapshots"
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set TS=%%i
set "DEST=%SNAPROOT%\%TS%"
mkdir "%DEST%" >nul 2>&1
robocopy "%REPO%" "%DEST%" /MIR /XD ".git" "node_modules" ".idea" ".vscode" "dist" "build" ".cache" ".next" /R:2 /W:2 /NFL /NDL /NP
echo Snapshot: %DEST%
pause
