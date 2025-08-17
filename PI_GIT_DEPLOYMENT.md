# Pi Deployment via Git

Simple deployment guide for setting up the OSC Buzzer Server on Raspberry Pi by pulling directly from GitHub.

## Step 1: Setup Repository

First, push the OSC server to GitHub:

```bash
# On your local machine, in the osc-server directory
git remote add origin https://github.com/YOUR_USERNAME/osc-buzzer-server.git
git branch -M main
git push -u origin main
```

## Step 2: Deploy on Pi

SSH to your Pi and run these commands:

```bash
# Connect to Pi
ssh pi@pi.local

# Navigate to opt directory (where your Waze Trivia is located)
cd /opt

# Clone the repository
sudo git clone https://github.com/YOUR_USERNAME/osc-buzzer-server.git
sudo chown -R pi:pi osc-buzzer-server
cd osc-buzzer-server

# Install dependencies
npm install

# Setup environment
cp .env.example .env
nano .env  # Edit if needed
```

## Step 3: Configure Environment

Edit the `.env` file:

```bash
PORT=3002
ESP32_SERIAL_PORT=/dev/ttyUSB0  # or /dev/ttyACM0
ESP32_BAUD_RATE=115200
DB_PATH=./database/osc-buzzer.db
```

## Step 4: Setup as Service

Create systemd service:

```bash
sudo nano /etc/systemd/system/osc-buzzer-server.service
```

Add this content:
```ini
[Unit]
Description=OSC Buzzer Server
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/opt/osc-buzzer-server
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

## Step 5: Start Service

```bash
# Setup permissions for serial port
sudo usermod -a -G dialout pi

# Enable and start service
sudo systemctl daemon-reload
sudo systemctl enable osc-buzzer-server
sudo systemctl start osc-buzzer-server

# Check status
sudo systemctl status osc-buzzer-server
```

## Step 6: Verify Installation

```bash
# Check health endpoint
curl http://localhost:3002/health

# View logs
sudo journalctl -u osc-buzzer-server -f
```

## Access URLs

- **Direct**: `http://pi.local:3002`
- **Health Check**: `http://pi.local:3002/health`

## Updates

To update the server:

```bash
cd /opt/osc-buzzer-server
git pull origin main
npm install
sudo systemctl restart osc-buzzer-server
```

## Troubleshooting

- **Check logs**: `sudo journalctl -u osc-buzzer-server -f`
- **Check serial devices**: `ls -la /dev/ttyUSB* /dev/ttyACM*`
- **Test connection**: `curl http://localhost:3002/health`
- **Check ports**: `sudo netstat -tlnp | grep :3002`