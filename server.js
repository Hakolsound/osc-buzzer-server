require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const Database = require('./services/database');
const ESP32Service = require('./services/esp32Service');
const OSCService = require('./services/oscService');

const buzzerRoutes = require('./routes/buzzers');
const bindingRoutes = require('./routes/bindings');
const commandRoutes = require('./routes/commands');
const targetRoutes = require('./routes/targets');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Serve frontend static files
app.use('/admin', express.static(path.join(__dirname, 'frontend')));
app.use('/shared', express.static(path.join(__dirname, '../frontend/shared')));

// Main CSS and JS files for admin interface
app.get('/admin.css', (req, res) => {
    res.setHeader('Content-Type', 'text/css');
    res.sendFile(path.join(__dirname, 'frontend/admin.css'));
});

app.get('/admin.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(path.join(__dirname, 'frontend/admin.js'));
});

// Initialize services
const db = new Database();
const esp32Service = new ESP32Service(io);
const oscService = new OSCService(io, db);

// API Routes
app.use('/api/buzzers', buzzerRoutes(esp32Service));
app.use('/api/bindings', bindingRoutes(db, oscService));
app.use('/api/commands', commandRoutes(db, oscService));
app.use('/api/targets', targetRoutes(db, oscService));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    services: {
      database: db.isConnected(),
      esp32: esp32Service.isConnected(),
      osc: oscService.isConnected()
    }
  });
});

// Main admin interface
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/index.html'));
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join-admin', () => {
    socket.join('admin');
    console.log('Client joined admin room');
  });

  socket.on('test-buzzer', (data) => {
    console.log('Test buzzer request:', data);
    // Simulate buzzer press for testing
    esp32Service.simulateBuzzerPress(data.deviceId || 1, Date.now());
  });

  socket.on('test-osc-command', (data) => {
    console.log('Test OSC command:', data);
    oscService.sendTestCommand(data);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Handle ESP32 buzzer presses
esp32Service.on('buzzer-press', (data) => {
  console.log('Buzzer press detected:', data);
  
  // Broadcast to admin clients
  io.to('admin').emit('buzzer-press', data);
  
  // Process through OSC service
  oscService.processBuzzerPress(data);
});

// Handle ESP32 device updates
esp32Service.on('device-update', (data) => {
  console.log('ESP32 device update:', data);
  io.to('admin').emit('device-update', data);
});

// Handle OSC message sending
oscService.on('osc-sent', (data) => {
  console.log('OSC message sent:', data);
  io.to('admin').emit('osc-sent', data);
});

// Initialize services and start server
async function startServer() {
  try {
    console.log('🚀 Starting OSC Buzzer Server...');
    
    await db.initialize();
    console.log('✅ Database initialized');
    
    await esp32Service.initialize();
    console.log('✅ ESP32 Service initialized');
    
    await oscService.initialize();
    console.log('✅ OSC Service initialized');

    server.listen(PORT, () => {
      console.log(`🌐 OSC Buzzer Server running on port ${PORT}`);
      console.log(`📱 Admin Interface: http://localhost:${PORT}`);
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down OSC Buzzer Server...');
  
  if (esp32Service) {
    esp32Service.disconnect();
  }
  
  if (oscService) {
    oscService.disconnect();
  }
  
  if (db) {
    db.close();
  }
  
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

startServer();