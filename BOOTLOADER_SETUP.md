# Pi Bootloader Setup Guide

This bootloader prevents UART conflicts by allowing you to choose which service to run.

## Step 1: Remove Auto-Start from Both Services

**On your Pi:**

```bash
# Remove both services from PM2 startup
pm2 stop all
pm2 delete all
pm2 save

# Disable any systemd services
sudo systemctl disable osc-buzzer-server 2>/dev/null || true
sudo systemctl stop osc-buzzer-server 2>/dev/null || true
```

## Step 2: Setup Bootloader

```bash
# Copy bootloader files to Pi (you'll need to push to git first)
cd /opt
sudo mkdir bootloader
sudo chown pi:pi bootloader
cd bootloader

# Copy the bootloader files here
# (You'll need to either git clone or scp the bootloader folder)
```

## Step 3: Install Bootloader Dependencies

```bash
cd /opt/bootloader
npm install
```

## Step 4: Setup Bootloader as Auto-Start Service

Create systemd service for bootloader:

```bash
sudo nano /etc/systemd/system/pi-bootloader.service
```

Add this content:
```ini
[Unit]
Description=Pi Service Bootloader
After=network.target

[Service]
Type=simple
User=pi
Group=pi
WorkingDirectory=/opt/bootloader
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Enable and start the bootloader:
```bash
sudo systemctl daemon-reload
sudo systemctl enable pi-bootloader
sudo systemctl start pi-bootloader
sudo systemctl status pi-bootloader
```

## Step 5: Configure PM2 for Manual Services

Create PM2 ecosystem file:
```bash
nano /opt/ecosystem.config.js
```

```javascript
module.exports = {
  apps: [
    {
      name: 'waze-trivia',
      cwd: '/opt/waze-trivia',
      script: 'backend/server.js',
      instances: 1,
      autorestart: false,  // Don't auto-restart
      watch: false
    },
    {
      name: 'osc-buzzer-server',
      cwd: '/opt/osc-buzzer-server',
      script: 'server.js',
      instances: 1,
      autorestart: false,  // Don't auto-restart
      watch: false
    }
  ]
};
```

Update PM2 configuration:
```bash
cd /opt
pm2 start ecosystem.config.js --no-autorestart
pm2 save
```

## Step 6: Test the Bootloader

1. **Access bootloader**: http://pi.local:8080
2. **Choose service**: Click "Start Service" on either Waze Trivia or OSC Buzzer
3. **Verify**: Service should start and show as running
4. **Switch services**: Stop current service, start the other

## Port Layout

- **Bootloader**: http://pi.local:8080 (always running)
- **Waze Trivia**: http://pi.local:3000 (when selected)
- **OSC Buzzer**: http://pi.local:3002 (when selected)

## Usage Workflow

1. **Boot Pi** → Bootloader starts automatically on port 8080
2. **Choose service** → Access bootloader web interface
3. **Start desired service** → Either Waze Trivia or OSC Buzzer (but not both)
4. **Use the service** → Full functionality without UART conflicts
5. **Switch services** → Stop current, start different service

## Troubleshooting

**Check bootloader status:**
```bash
sudo systemctl status pi-bootloader
sudo journalctl -u pi-bootloader -f
```

**Check if services can be controlled:**
```bash
pm2 list
pm2 start waze-trivia
pm2 stop waze-trivia
pm2 start osc-buzzer-server
pm2 stop osc-buzzer-server
```

**Reset everything:**
```bash
pm2 kill
pm2 start ecosystem.config.js --no-autorestart
pm2 save
```

This setup ensures only one service uses the UART at a time while providing an easy web interface to switch between them!