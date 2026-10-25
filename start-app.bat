@echo off
title Angel's PG Management
echo ============================================================
echo   ANGEL'S PG MANAGEMENT
echo   Starting local server...
echo ============================================================
start "" http://localhost:3001
node server.js
pause
