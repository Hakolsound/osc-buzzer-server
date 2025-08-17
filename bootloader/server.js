const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { spawn, exec } = require('child_process');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = 8080; // Bootloader runs on port 8080

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Service configurations
const SERVICES = {
  'waze-trivia': {
    name: 'Waze Trivia Game',
    description: 'Interactive trivia game with ESP32 buzzers',
    port: 3000,
    pm2Name: 'waze-trivia',
    path: '/opt/waze-trivia',
    url: 'http://pi.local:3000',
    icon: '🏆'
  },
  'osc-buzzer': {
    name: 'OSC Buzzer Server',
    description: 'ESP32 buzzer to OSC message translator',
    port: 3002,
    pm2Name: 'osc-buzzer-server',
    path: '/opt/osc-buzzer-server',
    url: 'http://pi.local:3002',
    icon: '🎛️'
  }
};

let currentService = null;

// Get current PM2 status
function getPM2Status() {
  return new Promise((resolve) => {
    exec('pm2 jlist', (error, stdout) => {
      if (error) {
        resolve([]);
        return;
      }
      
      try {
        const processes = JSON.parse(stdout);
        const serviceStatus = {};
        
        Object.keys(SERVICES).forEach(key => {
          const service = SERVICES[key];
          const process = processes.find(p => p.name === service.pm2Name);
          serviceStatus[key] = {
            ...service,
            status: process ? process.pm2_env.status : 'stopped',
            pid: process ? process.pid : null,
            uptime: process ? process.pm2_env.pm_uptime : null,
            restarts: process ? process.pm2_env.restart_time : 0
          };
        });
        
        resolve(serviceStatus);
      } catch (e) {
        resolve({});
      }
    });
  });
}

// Start a service (with strict single-service enforcement)
async function startService(serviceKey, forceKill = false) {
  return new Promise(async (resolve) => {
    const service = SERVICES[serviceKey];
    if (!service) {
      resolve({ success: false, error: 'Service not found' });
      return;
    }
    
    // Check if any service is currently running
    const currentStatus = await getPM2Status();
    const runningServices = Object.keys(currentStatus).filter(key => 
      currentStatus[key].status === 'online'
    );
    
    if (runningServices.length > 0 && !forceKill) {
      const runningServiceNames = runningServices.map(key => 
        currentStatus[key].name
      ).join(', ');
      
      resolve({ 
        success: false, 
        error: 'CONFLICT',
        conflictServices: runningServices,
        message: `Cannot start ${service.name}. Another service is running: ${runningServiceNames}. Use force option to override.`
      });
      return;
    }
    
    console.log(`${forceKill ? 'Force starting' : 'Starting'} service: ${service.name}`);
    
    // Stop all services first (with force if needed)
    exec('pm2 stop all', (stopError) => {
      // Wait a moment for services to fully stop
      setTimeout(() => {
        // Start the requested service
        exec(`pm2 start ${service.pm2Name}`, (startError, stdout, stderr) => {
          if (startError) {
            resolve({ success: false, error: startError.message });
          } else {
            currentService = serviceKey;
            resolve({ success: true, service: service.name, forced: forceKill });
          }
        });
      }, 1000);
    });
  });
}

// Stop all services
async function stopAllServices() {
  return new Promise((resolve) => {
    exec('pm2 stop all', (error) => {
      currentService = null;
      resolve({ success: !error, error: error?.message });
    });
  });
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/services', async (req, res) => {
  const status = await getPM2Status();
  res.json({
    success: true,
    services: status,
    currentService
  });
});

app.post('/api/start/:service', async (req, res) => {
  const forceKill = req.body.force === true;
  const result = await startService(req.params.service, forceKill);
  res.json(result);
});

app.post('/api/stop', async (req, res) => {
  const result = await stopAllServices();
  res.json(result);
});

app.get('/api/system', (req, res) => {
  exec('uptime && free -h && df -h /', (error, stdout) => {
    res.json({
      success: !error,
      info: stdout || 'Unable to get system info'
    });
  });
});

// Socket.IO for real-time updates
io.on('connection', (socket) => {
  console.log('Client connected to bootloader');
  
  socket.on('get-status', async () => {
    const status = await getPM2Status();
    socket.emit('status-update', {
      services: status,
      currentService
    });
  });
  
  socket.on('start-service', async (data) => {
    const serviceKey = typeof data === 'string' ? data : data.service;
    const forceKill = data.force === true;
    
    console.log(`${forceKill ? 'Force starting' : 'Starting'} service: ${serviceKey}`);
    const result = await startService(serviceKey, forceKill);
    
    if (result.success) {
      // Wait a moment for service to start, then send updated status
      setTimeout(async () => {
        const status = await getPM2Status();
        io.emit('status-update', {
          services: status,
          currentService
        });
        io.emit('service-started', { service: serviceKey, ...result });
      }, 2000);
    } else if (result.error === 'CONFLICT') {
      socket.emit('service-conflict', result);
    } else {
      socket.emit('service-error', result);
    }
  });
  
  socket.on('stop-services', async () => {
    console.log('Stopping all services');
    const result = await stopAllServices();
    
    setTimeout(async () => {
      const status = await getPM2Status();
      io.emit('status-update', {
        services: status,
        currentService: null
      });
    }, 1000);
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected from bootloader');
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Pi Service Bootloader running on port ${PORT}`);
  console.log(`🌐 Access at: http://pi.local:${PORT}`);
  
  // Initial status check
  getPM2Status().then(status => {
    console.log('📊 Current service status:', Object.keys(status).map(key => 
      `${status[key].name}: ${status[key].status}`
    ).join(', '));
  });
});