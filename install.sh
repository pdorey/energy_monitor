#!/bin/bash

# Energy Monitor - One-time installation for Raspberry Pi (native Linux)
# Creates Python venv, installs dependencies. Run once before first deploy.

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "=========================================="
echo "  Energy Monitor - Installation"
echo "=========================================="
echo ""

# Check Python 3.11+
if ! command -v python3 &> /dev/null; then
    echo "ERROR: python3 not found. Install Python 3.11+ (e.g. sudo apt install python3 python3-venv python3-pip)"
    exit 1
fi

PYTHON_VERSION=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
echo "Python version: $PYTHON_VERSION"

# Check Node.js (for frontend build during deploy)
if ! command -v node &> /dev/null; then
    echo "WARNING: Node.js not found. Install for frontend build: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs"
    echo "You can install later; deploy will fail until Node is available."
fi

# Create venv
if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv venv
    echo "venv created at $SCRIPT_DIR/venv"
else
    echo "venv already exists"
fi

# Activate and install
echo "Installing Python dependencies..."
source venv/bin/activate
pip install --upgrade pip
pip install -r backend/requirements.txt
deactivate

# Ensure data directory
mkdir -p data
echo "Data directory: $SCRIPT_DIR/data"

echo ""
echo "Installation complete. Run ./deploy.sh to deploy and start the service."
