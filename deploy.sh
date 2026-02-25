#!/bin/bash

# Energy Monitor Deployment Script for Raspberry Pi
# Native Linux deployment: builds frontend on Pi, runs via systemd

set +e

echo "=========================================="
echo "  Energy Monitor Deployment Script"
echo "=========================================="
echo ""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

print_status "Starting deployment process..."
print_status "Working directory: $SCRIPT_DIR"

if [ ! -d ".git" ]; then
    print_error "Not a git repository. Please run this script from the energy_monitor directory."
    exit 1
fi

# Step 1: Pull latest code
print_status "Step 1: Pulling latest code from git..."
GIT_PULL_OUTPUT=$(git pull 2>&1)
GIT_PULL_EXIT=$?
if [ $GIT_PULL_EXIT -eq 0 ]; then
    echo "$GIT_PULL_OUTPUT" | grep -q "Already up to date" && print_success "Code is already up to date" || print_success "Code updated successfully"
else
    print_warning "Git pull had issues, but continuing..."
fi

# Step 2: Verify project structure
print_status "Step 2: Verifying project structure..."
if [ ! -d "frontend" ] || [ ! -d "backend" ]; then
    print_error "frontend/ or backend/ directory not found!"
    exit 1
fi
[ ! -f "Consumption.csv" ] && print_warning "Consumption.csv not found - simulator will use empty data"
[ ! -f "Paths.csv" ] && print_warning "Paths.csv not found - path definitions may be incomplete"

# Step 3: Check Node.js (for frontend build)
if ! command -v node &> /dev/null; then
    print_error "Node.js not installed. Install: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs"
    exit 1
fi
print_status "Node.js: $(node --version), npm: $(npm --version)"

# Step 4: Check venv
if [ ! -d "venv" ]; then
    print_error "venv not found. Run ./install.sh first."
    exit 1
fi

# Step 5: Build frontend on Pi
print_status "Step 5: Building frontend (this may take 1-2 minutes on Pi)..."
cd frontend
if [ ! -d "node_modules" ]; then
    print_status "Installing npm dependencies..."
    npm install || { print_error "npm install failed"; cd ..; exit 1; }
else
    npm install --prefer-offline --no-audit > /dev/null 2>&1
fi
if ! npm run build; then
    print_error "Frontend build failed"
    cd ..
    exit 1
fi
cd ..
print_success "Frontend built successfully"

# Step 6: Verify frontend build
print_status "Step 6: Verifying frontend build..."
if [ ! -d "frontend_dist" ] || [ ! -f "frontend_dist/index.html" ]; then
    print_error "frontend_dist not found or incomplete"
    exit 1
fi

# Step 7: Ensure data directory
print_status "Step 7: Ensuring data directory exists..."
mkdir -p data

# Step 8: Install/update Python dependencies
print_status "Step 8: Installing Python dependencies..."
source venv/bin/activate
pip install -q -r backend/requirements.txt
deactivate
print_success "Dependencies installed"

# Step 9: Install/update systemd service
print_status "Step 9: Installing systemd service..."
SERVICE_FILE="energy-monitor.service"
SED_SAFE_DIR=$(echo "$SCRIPT_DIR" | sed 's/[\/&]/\\&/g')
sed "s|REPLACE_INSTALL_DIR|$SCRIPT_DIR|g" "$SERVICE_FILE" > /tmp/energy-monitor.service
if sudo cp /tmp/energy-monitor.service /etc/systemd/system/energy-monitor.service; then
    sudo systemctl daemon-reload
    print_success "systemd service updated"
else
    print_warning "Could not install systemd service (need sudo). You can start manually: source venv/bin/activate && cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000"
fi

# Step 10: Restart service
print_status "Step 10: Restarting energy-monitor service..."
if sudo systemctl restart energy-monitor 2>/dev/null; then
    print_success "Service restarted"
else
    print_warning "Could not restart service. Start manually: sudo systemctl start energy-monitor"
fi

# Step 11: Health check
print_status "Step 11: Performing health check..."
HEALTH_OK=0
for i in 1 2 3 4 5; do
    sleep 2
    if curl -sf http://localhost:8000/health > /dev/null; then
        HEALTH_OK=1
        break
    fi
    print_status "Health check attempt $i/5..."
done

echo ""
if [ $HEALTH_OK -eq 1 ]; then
    print_success "=========================================="
    print_success "  Deployment Complete!"
    print_success "=========================================="
    IP=$(hostname -I 2>/dev/null | awk '{print $1}')
    [ -n "$IP" ] && print_success "Dashboard: http://$IP:8000"
    print_success "Dashboard: http://localhost:8000"
else
    print_warning "Health check failed. Check: sudo journalctl -u energy-monitor -f"
fi

echo ""
print_status "Useful commands:"
print_status "  Logs:    sudo journalctl -u energy-monitor -f"
print_status "  Restart: sudo systemctl restart energy-monitor"
print_status "  Status:  sudo systemctl status energy-monitor"
print_status "  Stop:    sudo systemctl stop energy-monitor"
echo ""
