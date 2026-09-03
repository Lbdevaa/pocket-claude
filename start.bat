@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist logs mkdir logs

rem Запуск бота для Планировщика заданий Windows.
rem
rem Две вещи, ради которых нужна обёртка:
rem   1. После перезагрузки Планировщик стартует раньше VPN. Ждём сеть,
rem      сколько понадобится — включат VPN через час, бот поднимется через час.
rem   2. Если процесс упал, перезапускаем его сами, а не ждём следующей загрузки.

:wait
node scripts\check-net.js >>logs\bot.log 2>&1
if errorlevel 1 (
  echo [%date% %time%] сети нет, жду VPN >>logs\bot.log
  timeout /t 10 /nobreak >nul
  goto wait
)

echo [%date% %time%] сеть есть, запускаю бота >>logs\bot.log
call npm start >>logs\bot.log 2>&1

echo [%date% %time%] процесс завершился, перезапуск через 10 секунд >>logs\bot.log
timeout /t 10 /nobreak >nul
goto wait
