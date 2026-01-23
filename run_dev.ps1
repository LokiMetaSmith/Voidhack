# PowerShell script to run the development server with Mock Redis and disabled random events
# Usage: .\run_dev.ps1

$env:USE_MOCK_REDIS = "true"
$env:ENABLE_RANDOM_EVENTS = "false"

Write-Host "Starting server with Mock Redis (USE_MOCK_REDIS=true) and Random Events Disabled (ENABLE_RANDOM_EVENTS=false)..."
python -m uvicorn main:app --host 0.0.0.0 --port 8000
