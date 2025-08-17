# Raspberry Pi Deployment Guide - OSC Buzzer Server

This guide will help you deploy the OSC Buzzer Server alongside the existing Waze Trivia server on your Raspberry Pi.

## Prerequisites

- Raspberry Pi with existing Waze Trivia server running
- SSH access to the Pi
- Node.js and npm installed
- ESP32 coordinator connected via USB/UART

## Deployment Steps

### 1. Connect to Your Pi

```bash
ssh pi@pi.local
# or use your Pi's IP address
ssh pi@192.168.x.x
```

### 2. Navigate to Projects Directory

```bash
cd /home/pi/projects
# Create projects directory if it doesn't exist
mkdir -p /home/pi/projects
cd /home/pi/projects
```

### 3. Clone/Copy OSC Server Files

If you're copying from your local machine:

```bash
# On your local machine, create a deployment package
cd "/Users/ronpeer/Code Projects local/Waze Trivia Game/osc-server"
tar -czf osc-buzzer-server.tar.gz --exclude=node_modules --exclude=database --exclude=.git .

# Copy to Pi (replace with your Pi's IP)
scp osc-buzzer-server.tar.gz pi@pi.local:/home/pi/projects/

# On Pi, extract the package
cd /home/pi/projects
tar -xzf osc-buzzer-server.tar.gz
mkdir -p osc-buzzer-server
cd osc-buzzer-server
tar -xzf ../osc-buzzer-server.tar.gz
```

### 4. Install Dependencies

```bash
cd /home/pi/projects/osc-buzzer-server
npm install
```

### 5. Configure Environment

```bash
# Copy example environment file
cp .env.example .env

# Edit environment configuration
nano .env
```

Configure these settings in `.env`:
```bash
PORT=3002
ESP32_SERIAL_PORT=/dev/ttyUSB0  # or /dev/ttyACM0 depending on your connection
ESP32_BAUD_RATE=115200
DB_PATH=./database/osc-buzzer.db
```

### 6. Create Systemd Service

Create a systemd service file:

```bash
sudo nano /etc/systemd/system/osc-buzzer-server.service
```

Add this content:
```ini
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
```

### 7. Setup Serial Port Permissions

Make sure the pi user can access the serial port:

```bash
# Add pi user to dialout group (for serial port access)
sudo usermod -a -G dialout pi

# Check if ESP32 is connected and detected
ls -la /dev/ttyUSB* /dev/ttyACM*

# Test serial connection (optional)
sudo dmesg | grep -i usb
```

### 8. Start and Enable Services

```bash
# Reload systemd configuration
sudo systemctl daemon-reload

# Enable service to start on boot
sudo systemctl enable osc-buzzer-server

# Start the service
sudo systemctl start osc-buzzer-server

# Check service status
sudo systemctl status osc-buzzer-server
```

### 9. Configure Nginx (Optional)

If you want to serve both servers through nginx, add a location block:

```bash
sudo nano /etc/nginx/sites-available/default
```

Add this location block:
```nginx
# OSC Buzzer Server
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
```

Restart nginx:
```bash
sudo systemctl restart nginx
```

### 10. Verify Installation

Check both servers are running:

```bash
# Check Waze Trivia server (usually port 3000)
curl http://localhost:3000/health

# Check OSC Buzzer server
curl http://localhost:3002/health

# Check running processes
ps aux | grep node

# Check listening ports
sudo netstat -tlnp | grep :300
```

## Access URLs

After deployment:

- **Waze Trivia Admin**: `http://pi.local:3000`
- **OSC Buzzer Admin**: `http://pi.local:3002`

If using nginx:
- **Waze Trivia Admin**: `http://pi.local/`
- **OSC Buzzer Admin**: `http://pi.local/osc/`

## Troubleshooting

### Check Service Logs
```bash
# OSC Buzzer Server logs
sudo journalctl -u osc-buzzer-server -f

# System logs
sudo journalctl -f

# Application specific logs
tail -f /home/pi/projects/osc-buzzer-server/logs/app.log
```

### Common Issues

1. **Serial Port Permission Denied**
   ```bash
   sudo chmod 666 /dev/ttyUSB0
   # or permanently add user to dialout group
   sudo usermod -a -G dialout pi
   # Then logout and login again
   ```

2. **Port Already in Use**
   ```bash
   # Check what's using port 3002
   sudo lsof -i :3002
   # Kill process if needed
   sudo kill -9 <PID>
   ```

3. **Database Permissions**
   ```bash
   # Ensure database directory has proper permissions
   mkdir -p /home/pi/projects/osc-buzzer-server/database
   chmod 755 /home/pi/projects/osc-buzzer-server/database
   ```

4. **ESP32 Connection Issues**
   ```bash
   # Check USB devices
   lsusb
   
   # Check serial devices
   dmesg | grep tty
   
   # Test serial connection
   sudo minicom -D /dev/ttyUSB0 -b 115200
   ```

### Service Management Commands

```bash
# Start service
sudo systemctl start osc-buzzer-server

# Stop service
sudo systemctl stop osc-buzzer-server

# Restart service
sudo systemctl restart osc-buzzer-server

# Check status
sudo systemctl status osc-buzzer-server

# View logs
sudo journalctl -u osc-buzzer-server

# Follow logs in real-time
sudo journalctl -u osc-buzzer-server -f
```

## Updating the Server

To update the OSC server:

```bash
# Stop the service
sudo systemctl stop osc-buzzer-server

# Backup current installation
cp -r /home/pi/projects/osc-buzzer-server /home/pi/projects/osc-buzzer-server-backup

# Copy new files (preserve database and .env)
# ... copy new files ...

# Install new dependencies
cd /home/pi/projects/osc-buzzer-server
npm install

# Start the service
sudo systemctl start osc-buzzer-server
```

## Security Notes

- Both servers run on different ports (3000 and 3002)
- Use firewall rules to restrict access if needed
- Consider SSL/HTTPS for production use
- Keep both Node.js applications updated

## Monitoring Both Services

Create a simple monitoring script:

```bash
nano /home/pi/scripts/check-servers.sh
```

```bash
#!/bin/bash
echo "=== Server Status Check ==="
echo "Waze Trivia Server (port 3000):"
curl -s http://localhost:3000/health | head -1 || echo "OFFLINE"

echo "OSC Buzzer Server (port 3002):"
curl -s http://localhost:3002/health | head -1 || echo "OFFLINE"

echo "=== System Resources ==="
free -h
df -h /
```

Make it executable and run:
```bash
chmod +x /home/pi/scripts/check-servers.sh
/home/pi/scripts/check-servers.sh
```