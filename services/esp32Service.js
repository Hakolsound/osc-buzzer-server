let SerialPort, ReadlineParser;
try {
  const serialportModule = require('serialport');
  SerialPort = serialportModule.SerialPort;
  ReadlineParser = require('@serialport/parser-readline').ReadlineParser;
} catch (error) {
  console.warn('SerialPort module not available, ESP32 will run in simulation mode');
}

const { EventEmitter } = require('events');

class ESP32Service extends EventEmitter {
  constructor(io) {
    super();
    this.io = io;
    this.serialPort = null;
    this.parser = null;
    this.isConnectedFlag = false;
    this.deviceStates = new Map();
    
    this.serialPortPath = process.env.ESP32_SERIAL_PORT || '/dev/ttyUSB0';
    this.baudRate = parseInt(process.env.ESP32_BAUD_RATE) || 115200;
  }

  async initialize() {
    try {
      if (!SerialPort || !ReadlineParser) {
        console.log('ESP32 running in simulation mode (no SerialPort module)');
        this.isConnectedFlag = false;
        return;
      }

      console.log(`Attempting to connect to ESP32 on ${this.serialPortPath}`);
      
      this.serialPort = new SerialPort({
        path: this.serialPortPath,
        baudRate: this.baudRate,
        autoOpen: false
      });

      this.parser = this.serialPort.pipe(new ReadlineParser({ delimiter: '\r\n' }));

      this.serialPort.on('open', () => {
        console.log('ESP32 Serial connection established');
        this.isConnectedFlag = true;
        this.sendCommand('STATUS');
      });

      this.serialPort.on('error', (err) => {
        console.warn('ESP32 Serial error (will continue without hardware):', err.message);
        this.isConnectedFlag = false;
      });

      this.serialPort.on('close', () => {
        console.log('ESP32 Serial connection closed');
        this.isConnectedFlag = false;
      });

      this.parser.on('data', (data) => {
        this.handleSerialData(data.trim());
      });

      try {
        await this.openSerialPort();
      } catch (error) {
        console.warn('Could not connect to ESP32 hardware, continuing in simulation mode');
        this.isConnectedFlag = false;
      }

    } catch (error) {
      console.warn('ESP32 Service initialization failed, continuing without hardware:', error.message);
      this.isConnectedFlag = false;
    }
  }

  openSerialPort() {
    return new Promise((resolve, reject) => {
      this.serialPort.open((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  handleSerialData(data) {
    try {
      console.log('ESP32 Data:', data);
      
      if (data.startsWith('BUZZER:')) {
        // Parse BUZZER:mac_address,timestamp format
        const buzzerData = data.substring(7);
        const [macAddress, timestamp] = buzzerData.split(',');
        this.handleBuzzerPress(macAddress, parseInt(timestamp));
      } else if (data.startsWith('STATUS:')) {
        // Parse STATUS:timestamp,armed=0,devices=3 format
        const statusStr = data.substring(7);
        const parts = statusStr.split(',');
        const statusData = {};
        
        parts.forEach(part => {
          if (part.includes('=')) {
            const [key, value] = part.split('=');
            statusData[key] = isNaN(value) ? value : parseInt(value);
          }
        });
        
        this.updateSystemStatus(statusData);
      } else if (data.startsWith('DEVICE:')) {
        // Parse DEVICE:mac_address,online=1,armed=0,pressed=0 format
        console.log('ESP32 Device Data:', data);
        this.parseDeviceData(data);
        
        // Emit device update for admin interface
        this.emit('device-update', {
          esp32_data: data,
          timestamp: new Date().toISOString()
        });
        
      } else if (data.includes('Heartbeat from device')) {
        // Handle Waze Trivia format heartbeats
        // "Heartbeat from device 1" 
        const deviceMatch = data.match(/Heartbeat from device (\d+)/);
        if (deviceMatch) {
          const deviceId = deviceMatch[1];
          this.handleTriviaModeHeartbeat(deviceId);
        }
      } else if (data.includes('Received') && data.includes('bytes from:')) {
        // Handle "Received 16 bytes from: EC:62:60:1D:E8:D4"
        const macMatch = data.match(/from: ([A-F0-9:]{17})/);
        if (macMatch) {
          const macAddress = macMatch[1];
          this.handleTriviaModeDevice(macAddress);
        }
      } else if (data.startsWith('ACK:')) {
        console.log('ESP32 Command acknowledged:', data.substring(4));
      } else if (data.startsWith('ERROR:')) {
        console.error('ESP32 Error:', data.substring(6));
      }
    } catch (error) {
      console.error('Error parsing ESP32 data:', error);
    }
  }

  handleBuzzerPress(macAddress, timestamp) {
    const buzzerData = {
      mac_address: macAddress,
      timestamp: timestamp,
      received_at: Date.now()
    };

    console.log('Buzzer press detected:', buzzerData);
    
    // Emit buzzer press event for OSC processing
    this.emit('buzzer-press', buzzerData);
    
    // Update device state
    if (this.deviceStates.has(macAddress)) {
      const deviceState = this.deviceStates.get(macAddress);
      deviceState.pressed = true;
      deviceState.last_press = timestamp;
      deviceState.press_count = (deviceState.press_count || 0) + 1;
    }
  }

  parseDeviceData(deviceString) {
    try {
      const parts = deviceString.split(',');
      if (parts.length < 2) return;
      
      // Extract MAC address from DEVICE:mac_address format
      const devicePart = parts[0];
      if (!devicePart.startsWith('DEVICE:')) return;
      const macAddress = devicePart.split(':')[1];
      
      if (!macAddress) return;
      
      // Get existing state to preserve historical data
      const existingState = this.deviceStates.get(macAddress) || {};
      
      // Parse parameters - default to offline
      const params = { 
        mac_address: macAddress,
        last_seen: Date.now(),
        last_online: existingState.last_online,
        online: false,
        armed: false,
        pressed: false,
        press_count: existingState.press_count || 0,
        last_press: existingState.last_press || null
      };
      
      for (let i = 1; i < parts.length; i++) {
        const [key, value] = parts[i].split('=');
        if (key && value !== undefined) {
          params[key] = value === '1' ? true : value === '0' ? false : value;
        }
      }
      
      // Update last_online timestamp when device comes online
      if (params.online === true) {
        params.last_online = Date.now();
      } else if (!params.last_online && existingState.last_online) {
        // Preserve existing last_online when going offline
        params.last_online = existingState.last_online;
      }
      
      // Store device state
      this.deviceStates.set(macAddress, params);
      console.log(`Updated device ${macAddress}:`, params);
      
    } catch (error) {
      console.error('Error parsing device data:', error);
    }
  }

  updateSystemStatus(statusData) {
    // Emit system status for monitoring
    this.io.to('admin').emit('esp32-status', {
      connected: true,
      ...statusData,
      timestamp: new Date().toISOString()
    });
  }

  handleTriviaModeDevice(macAddress) {
    // Handle trivia mode device discovery from "Received X bytes from: MAC"
    const existingState = this.deviceStates.get(macAddress) || {};
    
    const deviceState = {
      mac_address: macAddress,
      last_seen: Date.now(),
      last_online: Date.now(),
      online: true,
      armed: false,
      pressed: false,
      press_count: existingState.press_count || 0,
      last_press: existingState.last_press || null,
      discovery_mode: 'trivia_heartbeat'
    };
    
    this.deviceStates.set(macAddress, deviceState);
    console.log(`Discovered trivia mode device: ${macAddress}`);
    
    // Emit device update
    this.emit('device-update', {
      esp32_data: `DISCOVERED:${macAddress}`,
      timestamp: new Date().toISOString()
    });
  }

  handleTriviaModeHeartbeat(deviceId) {
    // Handle "Heartbeat from device X" - we need to associate this with MAC addresses
    console.log(`Heartbeat from trivia device ${deviceId}`);
    
    // For now, just log it. The MAC address discovery happens in handleTriviaModeDevice
    this.lastHeartbeatDevice = deviceId;
    this.lastHeartbeatTime = Date.now();
  }

  sendCommand(command) {
    if (this.isConnectedFlag && this.serialPort) {
      console.log('Sending ESP32 command:', command);
      this.serialPort.write(command + '\n');
      return true;
    } else {
      console.log('ESP32 not connected, simulating command:', command);
      this.simulateCommand(command);
      return false;
    }
  }

  simulateCommand(command) {
    setTimeout(() => {
      if (command === 'STATUS') {
        this.handleSerialData('STATUS:1640995200,armed=0,devices=3');
      } else if (command.startsWith('ARM')) {
        this.handleSerialData('ACK:ARMED');
      } else if (command === 'DISARM') {
        this.handleSerialData('ACK:DISARMED');
      } else if (command === 'SCAN') {
        // Simulate discovering devices
        this.handleSerialData('DEVICE:AA:BB:CC:DD:EE:FF,online=1,armed=0,pressed=0');
        this.handleSerialData('DEVICE:11:22:33:44:55:66,online=1,armed=0,pressed=0');
      }
    }, 100);
  }

  // Simulate a buzzer press for testing
  simulateBuzzerPress(macAddress, timestamp) {
    if (!macAddress) {
      macAddress = 'AA:BB:CC:DD:EE:FF'; // Default test MAC
    }
    if (!timestamp) {
      timestamp = Date.now();
    }
    
    console.log(`Simulating buzzer press from ${macAddress}`);
    this.handleBuzzerPress(macAddress, timestamp);
  }

  async startDeviceScan() {
    const success = this.sendCommand('SCAN');
    return {
      success: true,
      scanning: true,
      timestamp: Date.now(),
      hardwareConnected: success
    };
  }

  async getDevices() {
    const devices = [];
    const now = Date.now();
    const staleThreshold = 60000; // 60 seconds
    
    for (const [macAddress, state] of this.deviceStates) {
      const timeSinceLastSeen = now - (state.last_seen || 0);
      const isOnline = state.online === true && timeSinceLastSeen < staleThreshold;
      
      let lastOnlineTimestamp = null;
      if (isOnline) {
        lastOnlineTimestamp = state.last_online || state.last_seen || now;
      } else {
        lastOnlineTimestamp = state.last_online || null;
      }
      const timeSinceLastOnline = lastOnlineTimestamp ? now - lastOnlineTimestamp : null;
      
      devices.push({
        mac_address: macAddress,
        status: isOnline ? 'online' : 'offline',
        last_seen: state.last_seen || now,
        last_online: lastOnlineTimestamp || null,
        online: isOnline,
        armed: state.armed === true,
        pressed: state.pressed === true,
        press_count: state.press_count || 0,
        last_press: state.last_press || null,
        time_since_last_seen: timeSinceLastSeen,
        time_since_last_online: timeSinceLastOnline
      });
    }
    
    return devices;
  }

  async getStatus() {
    this.sendCommand('STATUS');
    
    return {
      connected: this.isConnectedFlag,
      port: this.serialPortPath,
      baudRate: this.baudRate,
      deviceCount: this.deviceStates.size,
      onlineDevices: Array.from(this.deviceStates.values()).filter(d => d.online).length,
      lastUpdate: Date.now()
    };
  }

  isConnected() {
    return this.isConnectedFlag;
  }

  disconnect() {
    if (this.serialPort && this.serialPort.isOpen) {
      this.serialPort.close();
    }
  }

  async close() {
    if (this.serialPort && this.serialPort.isOpen) {
      return new Promise((resolve) => {
        this.serialPort.close((err) => {
          if (err) console.error('Error closing ESP32 connection:', err);
          else console.log('ESP32 connection closed');
          resolve();
        });
      });
    }
  }
}

module.exports = ESP32Service;