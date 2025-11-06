@echo off
REM === WIP Manager ===
REM Store this file in: C:\Projects\hatpro-schema-temp-WIP\repoCmdFiles

REM Set project paths (UPDATE THESE TWO)
set "REPO=C:\Users\nthomson\Projects\hatpro-schema-temp"
set "WIP=C:\Users\nthomson\Projects\hatpro-schema-temp-WIP"

REM Ensure WIP and _snapshots exist
if not exist "%WIP%" mkdir "%WIP%"
set "SNAPROOT=%WIP%\_snapshots"
if not exist "%SNAPROOT%" mkdir "%SNAPROOT%"

:menu
cls
echo ==============================
echo   WIP Manager
echo ==============================
echo [1] Snapshot REPO -> _snapshots\YYYYMMDD_HHMMSS
echo [2] Preview WIP -> REPO (dry run)
echo [3] Merge WIP -> REPO (copy only newer WIP files; no deletes)
echo [4] Exit
echo.
set /p choice=Choose 1-4: 

if "%choice%"=="1" goto snapshot
if "%choice%"=="2" goto preview
if "%choice%"=="3" goto merge
if "%choice%"=="4" goto end
goto menu

:snapshot
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set TS=%%i
set "DEST=%SNAPROOT%\%TS%"
mkdir "%DEST%" >nul 2>&1
echo Creating snapshot: "%DEST%"
robocopy "%REPO%" "%DEST%" /MIR ^
  /XD ".git" "node_modules" ".idea" ".vscode" "dist" "build" ".cache" ".next" ^
  /R:2 /W:2 /NFL /NDL /NP
echo Snapshot created: "%DEST%"
pause
goto menu

:preview
echo Preview (dry run): newer files that WOULD copy from WIP -> REPO
robocopy "%WIP%" "%REPO%" /E /XO /L /NFL /NDL /NP
echo (Nothing copied; this was a preview.)
pause
goto menu

:merge
echo Copying ONLY newer files from WIP -> REPO (no deletes)...
robocopy "%WIP%" "%REPO%" /E /XO /R:2 /W:2 /NFL /NDL /NP
echo Done. Review diffs in GitHub Desktop, then commit.
pause
goto menu

:end
exit /b 0
