#!/bin/bash

# OSC Buzzer Server - Raspberry Pi Deployment Script
# This script automates the deployment of the OSC Buzzer Server to Raspberry Pi

set -e

# Configuration
PI_HOST="${PI_HOST:-pi.local}"
PI_USER="${PI_USER:-pi}"
PROJECT_DIR="/home/pi/projects/osc-buzzer-server"
SERVICE_NAME="osc-buzzer-server"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# Check if we can connect to Pi
check_pi_connection() {
    print_status "Checking connection to Pi at ${PI_HOST}..."
    if ! ping -c 1 "${PI_HOST}" > /dev/null 2>&1; then
        print_error "Cannot reach Pi at ${PI_HOST}. Please check network connection."
        exit 1
    fi
    
    if ! ssh -o ConnectTimeout=10 "${PI_USER}@${PI_HOST}" "echo 'Connection test successful'" > /dev/null 2>&1; then
        print_error "Cannot SSH to Pi. Please check SSH configuration."
        print_warning "You may need to:"
        echo "  1. Enable SSH on the Pi: sudo systemctl enable ssh"
        echo "  2. Set up SSH keys: ssh-copy-id ${PI_USER}@${PI_HOST}"
        exit 1
    fi
    
    print_success "Pi connection verified"
}

# Create deployment package
create_deployment_package() {
    print_status "Creating deployment package..."
    
    # Create temporary directory for clean package
    TEMP_DIR=$(mktemp -d)
    
    # Copy files excluding development artifacts
    rsync -av \
        --exclude=node_modules \
        --exclude=database \
        --exclude=.git \
        --exclude=*.log \
        --exclude=.env \
        . "${TEMP_DIR}/"
    
    # Create tarball
    cd "${TEMP_DIR}"
    tar -czf osc-buzzer-server.tar.gz .
    mv osc-buzzer-server.tar.gz /tmp/
    
    # Cleanup
    rm -rf "${TEMP_DIR}"
    
    print_success "Deployment package created: /tmp/osc-buzzer-server.tar.gz"
}

# Deploy to Pi
deploy_to_pi() {
    print_status "Deploying to Pi..."
    
    # Copy deployment package
    scp /tmp/osc-buzzer-server.tar.gz "${PI_USER}@${PI_HOST}:/tmp/"
    
    # Execute deployment on Pi
    ssh "${PI_USER}@${PI_HOST}" << 'ENDSSH'
        set -e
        
        echo "[PI] Setting up project directory..."
        mkdir -p /home/pi/projects
        
        # Backup existing installation if it exists
        if [ -d "/home/pi/projects/osc-buzzer-server" ]; then
            echo "[PI] Backing up existing installation..."
            sudo systemctl stop osc-buzzer-server 2>/dev/null || true
            mv /home/pi/projects/osc-buzzer-server /home/pi/projects/osc-buzzer-server-backup-$(date +%Y%m%d-%H%M%S) 2>/dev/null || true
        fi
        
        # Extract new deployment
        echo "[PI] Extracting deployment package..."
        mkdir -p /home/pi/projects/osc-buzzer-server
        cd /home/pi/projects/osc-buzzer-server
        tar -xzf /tmp/osc-buzzer-server.tar.gz
        
        # Install dependencies
        echo "[PI] Installing Node.js dependencies..."
        npm install --production
        
        # Setup environment file if it doesn't exist
        if [ ! -f ".env" ]; then
            echo "[PI] Creating environment configuration..."
            cp .env.example .env
            
            # Detect ESP32 serial port
            ESP32_PORT=""
            if [ -e "/dev/ttyUSB0" ]; then
                ESP32_PORT="/dev/ttyUSB0"
            elif [ -e "/dev/ttyACM0" ]; then
                ESP32_PORT="/dev/ttyACM0"
            else
                ESP32_PORT="/dev/ttyUSB0"  # Default, will be handled by simulation mode
            fi
            
            # Update .env file
            sed -i "s|ESP32_SERIAL_PORT=.*|ESP32_SERIAL_PORT=${ESP32_PORT}|g" .env
            echo "[PI] Configured serial port: ${ESP32_PORT}"
        fi
        
        # Create database directory
        mkdir -p database
        chmod 755 database
        
        # Setup systemd service
        echo "[PI] Setting up systemd service..."
        sudo tee /etc/systemd/system/osc-buzzer-server.service > /dev/null << 'EOF'
[Unit]
Description=OSC Buzzer Server
Documentation=https://github.com/your-repo/osc-buzzer-server
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/projects/osc-buzzer-server
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

# Logging
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=osc-buzzer-server

[Install]
WantedBy=multi-user.target
EOF
        
        # Setup serial port permissions
        echo "[PI] Configuring serial port permissions..."
        sudo usermod -a -G dialout pi
        
        # Reload systemd and enable service
        sudo systemctl daemon-reload
        sudo systemctl enable osc-buzzer-server
        
        echo "[PI] Starting OSC Buzzer Server..."
        sudo systemctl start osc-buzzer-server
        
        # Wait a moment for service to start
        sleep 3
        
        # Check service status
        if sudo systemctl is-active --quiet osc-buzzer-server; then
            echo "[PI] ✅ OSC Buzzer Server is running successfully!"
        else
            echo "[PI] ❌ OSC Buzzer Server failed to start. Check logs with: sudo journalctl -u osc-buzzer-server"
            exit 1
        fi
        
        # Cleanup
        rm -f /tmp/osc-buzzer-server.tar.gz
ENDSSH
    
    print_success "Deployment completed successfully!"
}

# Check service status
check_service_status() {
    print_status "Checking service status..."
    
    ssh "${PI_USER}@${PI_HOST}" << 'ENDSSH'
        echo "=== Service Status ==="
        sudo systemctl status osc-buzzer-server --no-pager -l
        
        echo -e "\n=== Health Check ==="
        curl -s http://localhost:3002/health || echo "Health check failed - service may still be starting"
        
        echo -e "\n=== Listening Ports ==="
        sudo netstat -tlnp | grep :3002 || echo "Port 3002 not listening"
        
        echo -e "\n=== Recent Logs ==="
        sudo journalctl -u osc-buzzer-server --no-pager -n 10
        
        echo -e "\n=== Serial Devices ==="
        ls -la /dev/ttyUSB* /dev/ttyACM* 2>/dev/null || echo "No serial devices found"
ENDSSH
}

# Setup nginx proxy (optional)
setup_nginx_proxy() {
    print_status "Setting up nginx proxy..."
    
    ssh "${PI_USER}@${PI_HOST}" << 'ENDSSH'
        # Check if nginx is installed
        if ! command -v nginx > /dev/null 2>&1; then
            echo "[PI] Nginx not installed. Installing..."
            sudo apt update
            sudo apt install -y nginx
        fi
        
        # Backup existing nginx config
        sudo cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.backup-$(date +%Y%m%d) 2>/dev/null || true
        
        # Create nginx configuration
        sudo tee /etc/nginx/sites-available/osc-buzzer > /dev/null << 'EOF'
# OSC Buzzer Server proxy configuration
location /osc/ {
    proxy_pass http://localhost:3002/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
}

# OSC Buzzer Server WebSocket
location /osc/socket.io/ {
    proxy_pass http://localhost:3002/socket.io/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
EOF
        
        echo "[PI] Nginx proxy configuration created."
        echo "[PI] You may need to manually add this to your main nginx config."
ENDSSH
}

# Print usage information
print_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --pi-host HOST    Pi hostname or IP (default: pi.local)"
    echo "  --pi-user USER    Pi username (default: pi)"
    echo "  --nginx-proxy     Setup nginx reverse proxy"
    echo "  --status-only     Only check service status"
    echo "  --help            Show this help message"
    echo ""
    echo "Environment Variables:"
    echo "  PI_HOST          Override Pi hostname"
    echo "  PI_USER          Override Pi username"
    echo ""
    echo "Examples:"
    echo "  $0                                    # Deploy with defaults"
    echo "  $0 --pi-host 192.168.1.100          # Deploy to specific IP"
    echo "  $0 --status-only                     # Check service status only"
    echo "  $0 --nginx-proxy                     # Deploy with nginx proxy setup"
}

# Parse command line arguments
NGINX_PROXY=false
STATUS_ONLY=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --pi-host)
            PI_HOST="$2"
            shift 2
            ;;
        --pi-user)
            PI_USER="$2"
            shift 2
            ;;
        --nginx-proxy)
            NGINX_PROXY=true
            shift
            ;;
        --status-only)
            STATUS_ONLY=true
            shift
            ;;
        --help)
            print_usage
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            print_usage
            exit 1
            ;;
    esac
done

# Main execution
main() {
    echo "=== OSC Buzzer Server - Raspberry Pi Deployment ==="
    echo "Target: ${PI_USER}@${PI_HOST}"
    echo ""
    
    # Check Pi connection
    check_pi_connection
    
    if [ "$STATUS_ONLY" = true ]; then
        check_service_status
        exit 0
    fi
    
    # Create and deploy
    create_deployment_package
    deploy_to_pi
    
    # Setup nginx proxy if requested
    if [ "$NGINX_PROXY" = true ]; then
        setup_nginx_proxy
    fi
    
    # Check final status
    check_service_status
    
    echo ""
    print_success "Deployment completed successfully!"
    echo ""
    echo "Access URLs:"
    echo "  Direct access: http://${PI_HOST}:3002"
    if [ "$NGINX_PROXY" = true ]; then
        echo "  Via nginx:     http://${PI_HOST}/osc/"
    fi
    echo ""
    echo "Useful commands on Pi:"
    echo "  sudo systemctl status osc-buzzer-server"
    echo "  sudo journalctl -u osc-buzzer-server -f"
    echo "  curl http://localhost:3002/health"
}

# Run main function
main "$@"