#!/bin/bash
# Energy Monitor - Service troubleshooting script
# Run this when energy-monitor.service fails to get the actual error

echo "=========================================="
echo "  Energy Monitor - Troubleshooting"
echo "=========================================="
echo ""

echo "1. Service status:"
sudo systemctl status energy-monitor --no-pager 2>/dev/null || echo "   (service not found or not running)"
echo ""

echo "2. Last 30 lines of service logs (most recent first):"
sudo journalctl -u energy-monitor -n 30 --no-pager 2>/dev/null || echo "   (no logs)"
echo ""

echo "3. Checking paths..."
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
echo "   Install dir: $SCRIPT_DIR"
echo "   venv exists: $([ -d "$SCRIPT_DIR/venv" ] && echo YES || echo NO)"
echo "   uvicorn exists: $([ -f "$SCRIPT_DIR/venv/bin/uvicorn" ] && echo YES || echo NO)"
echo "   backend exists: $([ -d "$SCRIPT_DIR/backend" ] && echo YES || echo NO)"
echo "   frontend_dist exists: $([ -d "$SCRIPT_DIR/frontend_dist" ] && echo YES || echo NO)"
echo "   data dir exists: $([ -d "$SCRIPT_DIR/data" ] && echo YES || echo NO)"
echo ""

echo "4. To test manual start (from project root):"
echo "   cd $SCRIPT_DIR"
echo "   source venv/bin/activate"
echo "   PYTHONPATH=$SCRIPT_DIR/backend uvicorn app.main:app --host 0.0.0.0 --port 8000"
echo ""
