const osc = require('node-osc');
const { EventEmitter } = require('events');

class OSCService extends EventEmitter {
  constructor(io, database) {
    super();
    this.io = io;
    this.db = database;
    this.clients = new Map(); // Map of target_id -> OSC Client
    this.isConnectedFlag = true; // OSC is always "connected" since it's UDP
  }

  async initialize() {
    try {
      console.log('OSC Service initialized');
      this.isConnectedFlag = true;
    } catch (error) {
      console.error('OSC Service initialization failed:', error);
      this.isConnectedFlag = false;
    }
  }

  async processBuzzerPress(buzzerData) {
    try {
      const { mac_address, timestamp } = buzzerData;
      
      // Get mappings for this buzzer's MAC address
      const mappings = await this.db.getMappingsForBuzzer(mac_address);
      
      if (mappings.length === 0) {
        console.log(`No OSC mappings found for buzzer ${mac_address}`);
        await this.db.logActivity('buzzer_press_unmapped', mac_address, null, null, false, 'No mappings configured');
        return;
      }

      console.log(`Processing ${mappings.length} OSC mappings for buzzer ${mac_address}`);

      // Send OSC messages for each mapping
      for (const mapping of mappings) {
        await this.sendOSCMessage(mapping, buzzerData);
      }

    } catch (error) {
      console.error('Error processing buzzer press:', error);
      await this.db.logActivity('buzzer_press_error', buzzerData.mac_address, null, null, false, error.message);
    }
  }

  async sendOSCMessage(mapping, buzzerData) {
    try {
      const { 
        command_address, 
        command_args, 
        ip_address, 
        port, 
        target_name,
        device_name 
      } = mapping;

      // Parse command arguments
      let args = [];
      try {
        args = JSON.parse(command_args || '[]');
      } catch (e) {
        console.warn(`Invalid JSON arguments for mapping: ${command_args}`);
        args = [];
      }

      // Get or create OSC client for this target
      const targetKey = `${ip_address}:${port}`;
      let client = this.clients.get(targetKey);
      
      if (!client) {
        console.log(`Creating OSC client for ${targetKey}`);
        client = new osc.Client(ip_address, port);
        this.clients.set(targetKey, client);
      }

      // Send OSC message
      console.log(`Sending OSC: ${command_address} ${JSON.stringify(args)} to ${target_name} (${ip_address}:${port})`);
      
      await new Promise((resolve, reject) => {
        client.send(command_address, ...args, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Log successful activity
      await this.db.logActivity(
        'osc_sent', 
        buzzerData.mac_address, 
        command_address, 
        ip_address, 
        true, 
        `Sent to ${target_name} from ${device_name || buzzerData.mac_address}`
      );

      // Emit to admin interface for monitoring
      this.emit('osc-sent', {
        buzzer_mac: buzzerData.mac_address,
        device_name: device_name || buzzerData.mac_address,
        osc_address: command_address,
        osc_args: args,
        target_name: target_name,
        target_ip: ip_address,
        target_port: port,
        timestamp: new Date().toISOString(),
        success: true
      });

    } catch (error) {
      console.error('Error sending OSC message:', error);
      
      // Log failed activity
      await this.db.logActivity(
        'osc_failed', 
        buzzerData.mac_address, 
        mapping.command_address, 
        mapping.ip_address, 
        false, 
        error.message
      );

      // Emit failure to admin interface
      this.emit('osc-sent', {
        buzzer_mac: buzzerData.mac_address,
        device_name: mapping.device_name || buzzerData.mac_address,
        osc_address: mapping.command_address,
        target_name: mapping.target_name,
        target_ip: mapping.ip_address,
        target_port: mapping.port,
        timestamp: new Date().toISOString(),
        success: false,
        error: error.message
      });
    }
  }

  async sendTestCommand(testData) {
    try {
      const { commandId, targetId, customArgs } = testData;

      // Get command details
      const command = await this.db.get('SELECT * FROM osc_commands WHERE id = ?', [commandId]);
      if (!command) {
        throw new Error(`Command not found: ${commandId}`);
      }

      // Get target details
      const target = await this.db.get('SELECT * FROM osc_targets WHERE id = ?', [targetId]);
      if (!target) {
        throw new Error(`Target not found: ${targetId}`);
      }

      // Parse arguments (use custom if provided, otherwise use command defaults)
      let args = [];
      try {
        args = customArgs ? JSON.parse(customArgs) : JSON.parse(command.arguments || '[]');
      } catch (e) {
        console.warn(`Invalid JSON arguments: ${customArgs || command.arguments}`);
        args = [];
      }

      // Create OSC client
      const targetKey = `${target.ip_address}:${target.port}`;
      let client = this.clients.get(targetKey);
      
      if (!client) {
        console.log(`Creating test OSC client for ${targetKey}`);
        client = new osc.Client(target.ip_address, target.port);
        this.clients.set(targetKey, client);
      }

      console.log(`Test OSC: ${command.address} ${JSON.stringify(args)} to ${target.name} (${target.ip_address}:${target.port})`);
      
      // Send test message
      await new Promise((resolve, reject) => {
        client.send(command.address, ...args, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Log test activity
      await this.db.logActivity(
        'test_osc_sent', 
        null, 
        command.address, 
        target.ip_address, 
        true, 
        `Test command: ${command.name} to ${target.name}`
      );

      // Emit success to admin interface
      this.emit('osc-sent', {
        test: true,
        command_name: command.name,
        osc_address: command.address,
        osc_args: args,
        target_name: target.name,
        target_ip: target.ip_address,
        target_port: target.port,
        timestamp: new Date().toISOString(),
        success: true
      });

      return { success: true };

    } catch (error) {
      console.error('Error sending test OSC command:', error);
      
      // Log test failure
      await this.db.logActivity(
        'test_osc_failed', 
        null, 
        testData.commandId, 
        testData.targetId, 
        false, 
        error.message
      );

      // Emit failure to admin interface
      this.emit('osc-sent', {
        test: true,
        timestamp: new Date().toISOString(),
        success: false,
        error: error.message
      });

      throw error;
    }
  }

  async getTargetStatus() {
    const targets = await this.db.getOSCTargets();
    const status = [];

    for (const target of targets) {
      const targetKey = `${target.ip_address}:${target.port}`;
      const hasClient = this.clients.has(targetKey);
      
      status.push({
        ...target,
        connected: hasClient,
        client_created: hasClient
      });
    }

    return status;
  }

  async getRecentActivity(limit = 50) {
    return await this.db.getRecentActivity(limit);
  }

  isConnected() {
    return this.isConnectedFlag;
  }

  disconnect() {
    // Close all OSC clients
    for (const [targetKey, client] of this.clients) {
      try {
        client.close();
        console.log(`Closed OSC client for ${targetKey}`);
      } catch (error) {
        console.warn(`Error closing OSC client for ${targetKey}:`, error);
      }
    }
    this.clients.clear();
    this.isConnectedFlag = false;
  }

  async close() {
    this.disconnect();
    console.log('OSC Service closed');
  }
}

module.exports = OSCService;