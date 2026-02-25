#!/usr/bin/env python3
"""
Quick import check - run from project root to catch startup errors.
Usage: PYTHONPATH=backend python check_imports.py
"""
import sys
import os

# Set default env before imports
os.environ.setdefault("ENERGY_MONITOR_DB_PATH", os.path.join(os.path.dirname(__file__), "data"))

def main():
    try:
        print("Checking app.main import...")
        from app.main import app
        print("OK: app imported successfully")
        return 0
    except Exception as e:
        print(f"FAILED: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        return 1

if __name__ == "__main__":
    sys.exit(main())
