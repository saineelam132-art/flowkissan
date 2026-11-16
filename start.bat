@echo off
rem KoolKisaan Flowers - open the website on this laptop (no internet needed).
cd /d "%~dp0"
start "" http://localhost:8000
py -3 -m http.server 8000 --directory static_site || python -m http.server 8000 --directory static_site
