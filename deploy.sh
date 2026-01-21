#!/bin/bash

# Energy Monitor Deployment Script for Raspberry Pi
# This script pulls latest code, rebuilds frontend, and redeploys Docker containers

# Don't use set -e, we want to handle errors gracefully
set +e

# Print header
echo "=========================================="
echo "  Energy Monitor Deployment Script"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Get the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

print_status "Starting deployment process..."
print_status "Working directory: $SCRIPT_DIR"

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    print_error "Not a git repository. Please run this script from the energy_monitor directory."
    exit 1
fi

# Step 1: Pull latest code
print_status "Step 1: Pulling latest code from git..."
GIT_PULL_OUTPUT=$(git pull 2>&1)
GIT_PULL_EXIT=$?

if [ $GIT_PULL_EXIT -eq 0 ]; then
    if echo "$GIT_PULL_OUTPUT" | grep -q "Already up to date"; then
        print_success "Code is already up to date"
    else
        print_success "Code updated successfully"
    fi
else
    print_warning "Git pull had issues, but continuing with deployment..."
    print_warning "Output: $GIT_PULL_OUTPUT"
fi

# Step 2: Verify required directories and files
print_status "Step 2: Verifying project structure..."

if [ ! -d "frontend" ]; then
    print_error "Frontend directory not found!"
    exit 1
fi

if [ ! -d "backend" ]; then
    print_error "Backend directory not found!"
    exit 1
fi

if [ ! -f "Consumption.csv" ]; then
    print_warning "Consumption.csv not found - simulator will use empty data"
fi

if [ ! -f "Paths.csv" ]; then
    print_warning "Paths.csv not found - path definitions may be incomplete"
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js first."
    exit 1
fi

NODE_VERSION=$(node --version)
print_status "Node.js version: $NODE_VERSION"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    print_error "npm is not installed. Please install npm first."
    exit 1
fi

NPM_VERSION=$(npm --version)
print_status "npm version: $NPM_VERSION"

# Check if docker-compose is available
if command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE_CMD="docker-compose"
    DOCKER_COMPOSE_VERSION=$($DOCKER_COMPOSE_CMD --version)
    print_status "docker-compose version: $DOCKER_COMPOSE_VERSION"
elif docker compose version &> /dev/null; then
    DOCKER_COMPOSE_CMD="docker compose"
    DOCKER_COMPOSE_VERSION=$(docker compose version)
    print_status "docker compose version: $DOCKER_COMPOSE_VERSION"
else
    print_error "docker-compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Check if Docker is running
if ! docker info &> /dev/null; then
    print_error "Docker is not running. Please start Docker first."
    exit 1
fi

# Step 3: Build frontend
print_status "Step 3: Building frontend..."
cd frontend

# Check if node_modules exists, if not, install dependencies
if [ ! -d "node_modules" ]; then
    print_status "Installing npm dependencies (this may take a few minutes)..."
    if ! npm install; then
        print_error "Failed to install npm dependencies"
        cd ..
        exit 1
    fi
    print_success "Dependencies installed"
else
    print_status "Checking for npm dependency updates..."
    npm install --prefer-offline --no-audit > /dev/null 2>&1
fi

# Build the frontend
print_status "Building frontend (TypeScript compilation + Vite build)..."
if npm run build; then
    print_success "Frontend built successfully"
else
    print_error "Frontend build failed"
    cd ..
    exit 1
fi

# Go back to root directory
cd ..

# Step 4: Verify frontend build output
print_status "Step 4: Verifying frontend build artifacts..."
if [ ! -d "frontend_dist" ]; then
    print_error "frontend_dist directory not found after build!"
    exit 1
fi

if [ ! -f "frontend_dist/index.html" ]; then
    print_error "frontend_dist/index.html not found after build!"
    exit 1
fi

if [ ! -d "frontend_dist/assets" ]; then
    print_warning "frontend_dist/assets directory not found - this may be normal if no assets"
else
    ASSET_COUNT=$(find frontend_dist/assets -type f 2>/dev/null | wc -l)
    print_status "Found $ASSET_COUNT frontend asset files"
fi

print_success "Frontend build artifacts verified"

# Step 5: Verify backend files
print_status "Step 5: Verifying backend files..."
if [ ! -f "backend/Dockerfile" ]; then
    print_error "backend/Dockerfile not found!"
    exit 1
fi

if [ ! -f "backend/requirements.txt" ]; then
    print_error "backend/requirements.txt not found!"
    exit 1
fi

if [ ! -f "docker-compose.yml" ]; then
    print_error "docker-compose.yml not found!"
    exit 1
fi

print_success "Backend files verified"

# Step 6: Stop existing containers
print_status "Step 6: Stopping existing containers..."
if $DOCKER_COMPOSE_CMD down; then
    print_success "Containers stopped"
else
    print_warning "Some containers may not have been running (this is OK)"
fi

# Step 7: Rebuild and start containers
print_status "Step 7: Rebuilding Docker images (this may take a few minutes)..."
print_status "Building backend image with frontend assets..."

if $DOCKER_COMPOSE_CMD build --no-cache; then
    print_success "Docker images built successfully"
else
    print_error "Failed to build Docker images"
    exit 1
fi

print_status "Starting containers..."
if $DOCKER_COMPOSE_CMD up -d; then
    print_success "Containers started successfully"
else
    print_error "Failed to start containers"
    exit 1
fi

# Step 8: Wait for containers to start
print_status "Step 8: Waiting for containers to initialize..."
sleep 5

# Step 9: Check container status
print_status "Step 9: Checking container status..."
if $DOCKER_COMPOSE_CMD ps; then
    print_success "Container status check complete"
    
    # Check if container is running
    CONTAINER_STATUS=$($DOCKER_COMPOSE_CMD ps --format json 2>/dev/null | grep -o '"State":"[^"]*"' | head -1 | cut -d'"' -f4)
    if [ "$CONTAINER_STATUS" = "running" ]; then
        print_success "Container is running"
    else
        print_warning "Container status: $CONTAINER_STATUS"
    fi
else
    print_warning "Could not get container status"
fi

# Step 10: Show recent logs
print_status "Step 10: Recent container logs:"
$DOCKER_COMPOSE_CMD logs --tail=30

# Step 11: Health check with retries
print_status "Step 11: Performing health check..."
HEALTH_CHECK_PASSED=0
for i in {1..5}; do
    sleep 2
    if curl -f http://localhost:8000/health > /dev/null 2>&1; then
        HEALTH_CHECK_PASSED=1
        break
    fi
    print_status "Health check attempt $i/5 failed, retrying..."
done

if [ $HEALTH_CHECK_PASSED -eq 1 ]; then
    print_success "Health check passed! Service is running."
    
    # Try to get the IP address
    if command -v hostname &> /dev/null; then
        IP_ADDRESS=$(hostname -I 2>/dev/null | awk '{print $1}')
        if [ -n "$IP_ADDRESS" ]; then
            print_success "Dashboard available at: http://$IP_ADDRESS:8000"
        fi
    fi
    print_success "Dashboard available at: http://localhost:8000"
else
    print_warning "Health check failed after 5 attempts. Service may still be starting..."
    print_warning "Check logs with: $DOCKER_COMPOSE_CMD logs -f"
    print_warning "Check container status with: $DOCKER_COMPOSE_CMD ps"
fi

# Step 12: Summary
echo ""
print_success "=========================================="
print_success "  Deployment Complete!"
print_success "=========================================="
echo ""
print_status "Useful commands:"
print_status "  View logs:        $DOCKER_COMPOSE_CMD logs -f"
print_status "  View logs (last): $DOCKER_COMPOSE_CMD logs --tail=50"
print_status "  Stop:             $DOCKER_COMPOSE_CMD down"
print_status "  Restart:          $DOCKER_COMPOSE_CMD restart"
print_status "  Status:           $DOCKER_COMPOSE_CMD ps"
echo ""
