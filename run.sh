#!/bin/bash
# Launcher for energy-monitor - runs uvicorn with correct env
cd "$(dirname "$0")"
export PYTHONPATH="$PWD/backend"
export ENERGY_MONITOR_DB_PATH="${ENERGY_MONITOR_DB_PATH:-$PWD/data}"
exec ./venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
