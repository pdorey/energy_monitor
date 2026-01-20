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

# Step 2: Check if frontend directory exists
if [ ! -d "frontend" ]; then
    print_error "Frontend directory not found!"
    exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    print_error "npm is not installed. Please install npm first."
    exit 1
fi

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    print_error "docker-compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Step 3: Build frontend
print_status "Step 2: Building frontend..."
cd frontend

# Check if node_modules exists, if not, install dependencies
if [ ! -d "node_modules" ]; then
    print_status "Installing npm dependencies..."
    if ! npm install; then
        print_error "Failed to install npm dependencies"
        exit 1
    fi
fi

# Build the frontend
print_status "Running npm build..."
if npm run build; then
    print_success "Frontend built successfully"
else
    print_error "Frontend build failed"
    exit 1
fi

# Go back to root directory
cd ..

# Step 4: Check if frontend_dist was created
if [ ! -d "frontend_dist" ]; then
    print_error "frontend_dist directory not found after build!"
    exit 1
fi

print_success "Frontend build artifacts ready"

# Step 5: Stop existing containers
print_status "Step 3: Stopping existing containers..."
# Try docker-compose first, fall back to docker compose (newer syntax)
if command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE_CMD="docker-compose"
else
    DOCKER_COMPOSE_CMD="docker compose"
fi

if $DOCKER_COMPOSE_CMD down; then
    print_success "Containers stopped"
else
    print_warning "Some containers may not have been running"
fi

# Step 6: Rebuild and start containers
print_status "Step 4: Rebuilding and starting Docker containers..."
if $DOCKER_COMPOSE_CMD up -d --build; then
    print_success "Containers rebuilt and started successfully"
else
    print_error "Failed to rebuild/start containers"
    exit 1
fi

# Step 7: Wait a moment for containers to start
print_status "Waiting for containers to initialize..."
sleep 5

# Step 8: Check container status
print_status "Step 5: Checking container status..."
if $DOCKER_COMPOSE_CMD ps; then
    print_success "Container status check complete"
else
    print_warning "Could not get container status"
fi

# Step 9: Show recent logs
print_status "Step 6: Recent container logs:"
$DOCKER_COMPOSE_CMD logs --tail=20

# Step 10: Health check
print_status "Step 7: Performing health check..."
sleep 3
if curl -f http://localhost:8000/health > /dev/null 2>&1; then
    print_success "Health check passed! Service is running."
    print_success "Dashboard available at: http://$(hostname -I | awk '{print $1}'):8000"
else
    print_warning "Health check failed. Service may still be starting..."
    print_warning "Check logs with: docker-compose logs -f"
fi

print_success "Deployment complete!"
print_status "To view logs: $DOCKER_COMPOSE_CMD logs -f"
print_status "To stop: $DOCKER_COMPOSE_CMD down"
print_status "To restart: $DOCKER_COMPOSE_CMD restart"
