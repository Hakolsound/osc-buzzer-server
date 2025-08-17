const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs').promises;

class Database {
  constructor() {
    this.db = null;
    this.dbPath = process.env.DB_PATH || path.join(__dirname, '../database/osc-buzzer.db');
  }

  async initialize() {
    try {
      await fs.mkdir(path.dirname(this.dbPath), { recursive: true });
      
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          throw new Error(`Database connection failed: ${err.message}`);
        }
        console.log('Connected to OSC Buzzer SQLite database');
      });

      await this.createTables();
      await this.seedDefaultData();
    } catch (error) {
      console.error('Database initialization failed:', error);
      throw error;
    }
  }

  async createTables() {
    const tables = [
      // Buzzer device bindings (MAC address to logical buzzer mapping)
      `CREATE TABLE IF NOT EXISTS buzzer_bindings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mac_address TEXT UNIQUE NOT NULL,
        device_name TEXT NOT NULL,
        description TEXT,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // OSC commands library
      `CREATE TABLE IF NOT EXISTS osc_commands (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        address TEXT NOT NULL,
        description TEXT,
        category TEXT DEFAULT 'custom',
        arguments TEXT DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // OSC target machines
      `CREATE TABLE IF NOT EXISTS osc_targets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        ip_address TEXT NOT NULL,
        port INTEGER NOT NULL,
        description TEXT,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Buzzer to Command to Target mappings (many-to-many relationships)
      `CREATE TABLE IF NOT EXISTS buzzer_command_mappings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        buzzer_binding_id INTEGER,
        osc_command_id INTEGER,
        osc_target_id INTEGER,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (buzzer_binding_id) REFERENCES buzzer_bindings (id),
        FOREIGN KEY (osc_command_id) REFERENCES osc_commands (id),
        FOREIGN KEY (osc_target_id) REFERENCES osc_targets (id)
      )`,
      
      // Activity log for monitoring
      `CREATE TABLE IF NOT EXISTS activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        buzzer_mac TEXT,
        osc_address TEXT,
        target_ip TEXT,
        success BOOLEAN DEFAULT 1,
        message TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    ];

    for (const table of tables) {
      await this.run(table);
    }
  }

  async seedDefaultData() {
    // Check if we have any data
    const commandCount = await this.get('SELECT COUNT(*) as count FROM osc_commands');
    if (commandCount.count > 0) return;

    console.log('Seeding default OSC commands...');

    // Default OSC commands for popular software
    const defaultCommands = [
      // Resolume commands
      { name: 'Resolume - Flash Layer 1', address: '/layer1/video/opacity/values', category: 'resolume', arguments: '[1.0]', description: 'Flash layer 1 to full opacity' },
      { name: 'Resolume - Flash Layer 2', address: '/layer2/video/opacity/values', category: 'resolume', arguments: '[1.0]', description: 'Flash layer 2 to full opacity' },
      { name: 'Resolume - Trigger Clip 1-1', address: '/layer1/clip1/connect', category: 'resolume', arguments: '[1]', description: 'Trigger clip 1 on layer 1' },
      { name: 'Resolume - Trigger Clip 1-2', address: '/layer1/clip2/connect', category: 'resolume', arguments: '[1]', description: 'Trigger clip 2 on layer 1' },
      { name: 'Resolume - BPM Sync', address: '/tempo/resync', category: 'resolume', arguments: '[]', description: 'Resync BPM timing' },
      
      // QLab commands  
      { name: 'QLab - GO', address: '/go', category: 'qlab', arguments: '[]', description: 'Execute next cue' },
      { name: 'QLab - Stop All', address: '/stop', category: 'qlab', arguments: '[]', description: 'Stop all running cues' },
      { name: 'QLab - Panic', address: '/panic', category: 'qlab', arguments: '[]', description: 'Emergency stop all' },
      { name: 'QLab - Cue 1', address: '/cue/1/start', category: 'qlab', arguments: '[]', description: 'Start cue 1' },
      { name: 'QLab - Cue 2', address: '/cue/2/start', category: 'qlab', arguments: '[]', description: 'Start cue 2' },
      
      // Generic lighting
      { name: 'Light - Scene 1', address: '/light/scene', category: 'lighting', arguments: '[1]', description: 'Activate lighting scene 1' },
      { name: 'Light - Scene 2', address: '/light/scene', category: 'lighting', arguments: '[2]', description: 'Activate lighting scene 2' },
      { name: 'Light - Strobe On', address: '/light/strobe', category: 'lighting', arguments: '[1]', description: 'Turn on strobe lights' },
      { name: 'Light - Strobe Off', address: '/light/strobe', category: 'lighting', arguments: '[0]', description: 'Turn off strobe lights' },
      { name: 'Light - Blackout', address: '/light/blackout', category: 'lighting', arguments: '[]', description: 'Blackout all lights' },
      
      // Generic audio
      { name: 'Audio - SFX 1', address: '/audio/sfx/trigger', category: 'audio', arguments: '[1]', description: 'Trigger sound effect 1' },
      { name: 'Audio - SFX 2', address: '/audio/sfx/trigger', category: 'audio', arguments: '[2]', description: 'Trigger sound effect 2' },
      { name: 'Audio - Music Start', address: '/audio/music/play', category: 'audio', arguments: '[]', description: 'Start background music' },
      { name: 'Audio - Music Stop', address: '/audio/music/stop', category: 'audio', arguments: '[]', description: 'Stop background music' }
    ];

    for (const cmd of defaultCommands) {
      await this.run(
        'INSERT INTO osc_commands (name, address, category, arguments, description) VALUES (?, ?, ?, ?, ?)',
        [cmd.name, cmd.address, cmd.category, cmd.arguments, cmd.description]
      );
    }

    // Default target (localhost for testing)
    await this.run(
      'INSERT INTO osc_targets (name, ip_address, port, description) VALUES (?, ?, ?, ?)',
      ['Local Test', '127.0.0.1', 53000, 'Local OSC receiver for testing']
    );
  }

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  // Buzzer bindings methods
  async createBuzzerBinding(macAddress, deviceName, description = '') {
    return await this.run(
      'INSERT OR REPLACE INTO buzzer_bindings (mac_address, device_name, description, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
      [macAddress, deviceName, description]
    );
  }

  async getBuzzerBindings() {
    return await this.all('SELECT * FROM buzzer_bindings ORDER BY device_name');
  }

  async getBuzzerBindingByMac(macAddress) {
    return await this.get('SELECT * FROM buzzer_bindings WHERE mac_address = ?', [macAddress]);
  }

  // OSC commands methods
  async createOSCCommand(name, address, category, args, description) {
    return await this.run(
      'INSERT INTO osc_commands (name, address, category, arguments, description) VALUES (?, ?, ?, ?, ?)',
      [name, address, category, args, description]
    );
  }

  async getOSCCommands(category = null) {
    if (category) {
      return await this.all('SELECT * FROM osc_commands WHERE category = ? ORDER BY name', [category]);
    }
    return await this.all('SELECT * FROM osc_commands ORDER BY category, name');
  }

  // OSC targets methods
  async createOSCTarget(name, ipAddress, port, description) {
    return await this.run(
      'INSERT INTO osc_targets (name, ip_address, port, description) VALUES (?, ?, ?, ?)',
      [name, ipAddress, port, description]
    );
  }

  async getOSCTargets() {
    return await this.all('SELECT * FROM osc_targets WHERE is_active = 1 ORDER BY name');
  }

  // Mappings methods
  async createMapping(buzzerBindingId, oscCommandId, oscTargetId) {
    return await this.run(
      'INSERT INTO buzzer_command_mappings (buzzer_binding_id, osc_command_id, osc_target_id) VALUES (?, ?, ?)',
      [buzzerBindingId, oscCommandId, oscTargetId]
    );
  }

  async getMappingsForBuzzer(macAddress) {
    return await this.all(`
      SELECT 
        bcm.*,
        bb.mac_address, bb.device_name,
        oc.name as command_name, oc.address as command_address, oc.arguments as command_args,
        ot.name as target_name, ot.ip_address, ot.port
      FROM buzzer_command_mappings bcm
      JOIN buzzer_bindings bb ON bcm.buzzer_binding_id = bb.id
      JOIN osc_commands oc ON bcm.osc_command_id = oc.id  
      JOIN osc_targets ot ON bcm.osc_target_id = ot.id
      WHERE bb.mac_address = ? AND bcm.is_active = 1 AND bb.is_active = 1 AND ot.is_active = 1
    `, [macAddress]);
  }

  async getAllMappings() {
    return await this.all(`
      SELECT 
        bcm.*,
        bb.mac_address, bb.device_name,
        oc.name as command_name, oc.address as command_address, oc.arguments as command_args,
        ot.name as target_name, ot.ip_address, ot.port
      FROM buzzer_command_mappings bcm
      JOIN buzzer_bindings bb ON bcm.buzzer_binding_id = bb.id
      JOIN osc_commands oc ON bcm.osc_command_id = oc.id  
      JOIN osc_targets ot ON bcm.osc_target_id = ot.id
      WHERE bcm.is_active = 1 AND bb.is_active = 1 AND ot.is_active = 1
      ORDER BY bb.device_name
    `);
  }

  // Activity logging
  async logActivity(eventType, buzzerMac, oscAddress, targetIp, success, message) {
    return await this.run(
      'INSERT INTO activity_log (event_type, buzzer_mac, osc_address, target_ip, success, message) VALUES (?, ?, ?, ?, ?, ?)',
      [eventType, buzzerMac, oscAddress, targetIp, success, message]
    );
  }

  async getRecentActivity(limit = 100) {
    return await this.all('SELECT * FROM activity_log ORDER BY timestamp DESC LIMIT ?', [limit]);
  }

  // Delete methods for unpair functionality
  async deleteBuzzerBinding(macAddress) {
    return await this.run('DELETE FROM buzzer_bindings WHERE mac_address = ?', [macAddress]);
  }

  async deleteMappingsForBuzzer(macAddress) {
    // First get the binding to get its ID
    const binding = await this.getBuzzerBindingByMac(macAddress);
    if (binding) {
      return await this.run('DELETE FROM buzzer_mappings WHERE buzzer_binding_id = ?', [binding.id]);
    }
    return { changes: 0 };
  }

  isConnected() {
    return this.db !== null;
  }

  async close() {
    if (this.db) {
      return new Promise((resolve) => {
        this.db.close((err) => {
          if (err) console.error('Error closing database:', err);
          else console.log('Database connection closed');
          resolve();
        });
      });
    }
  }
}

module.exports = Database;