@echo off
echo Starting EduNexus...

REM Start Backend
echo Starting Backend...
cd backend
start "Backend" python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
cd ..

REM Wait for backend to start
timeout /t 5 /nobreak

REM Start Frontend
echo Starting Frontend...
cd frontend
start "Frontend" npm run dev
cd ..

echo.
echo EduNexus is starting up...
echo Backend: http://localhost:8000
echo Frontend: http://localhost:5173
echo API Docs: http://localhost:8000/docs
echo.
pause
