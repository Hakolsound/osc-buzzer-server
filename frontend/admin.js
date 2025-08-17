class OSCBuzzerAdmin {
    constructor() {
        this.socket = io();
        this.currentTab = 'binding';
        this.devices = [];
        this.bindings = [];
        this.commands = [];
        this.targets = [];
        this.mappings = [];
        
        this.initializeEventListeners();
        this.connectSocketEvents();
        this.loadInitialData();
    }

    initializeEventListeners() {
        // Tab switching
        document.querySelectorAll('.config-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });

        // Binding tab
        document.getElementById('scan-devices-btn')?.addEventListener('click', () => this.scanDevices());
        document.getElementById('create-binding-btn')?.addEventListener('click', () => this.createBinding());

        // Commands tab
        document.getElementById('create-command-btn')?.addEventListener('click', () => this.createCommand());
        document.querySelectorAll('.category-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.filterCommands(e.target.dataset.category));
        });

        // Targets tab
        document.getElementById('create-target-btn')?.addEventListener('click', () => this.createTarget());

        // Test tab
        document.getElementById('test-esp32-status-btn')?.addEventListener('click', () => this.testESP32Status());
        document.getElementById('simulate-buzzer-btn')?.addEventListener('click', () => this.simulateBuzzer());
        document.getElementById('send-test-osc-btn')?.addEventListener('click', () => this.sendTestOSC());

        // Monitor tab
        document.getElementById('clear-monitor-btn')?.addEventListener('click', () => this.clearActivityLog());
    }

    connectSocketEvents() {
        this.socket.on('connect', () => {
            console.log('Connected to OSC Buzzer Server');
            this.socket.emit('join-admin');
            this.updateConnectionStatus();
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.updateConnectionStatus();
        });

        this.socket.on('buzzer-press', (data) => {
            this.handleBuzzerPress(data);
        });

        this.socket.on('device-update', (data) => {
            this.handleDeviceUpdate(data);
        });

        this.socket.on('esp32-status', (data) => {
            this.updateESP32Status(data);
        });

        this.socket.on('osc-sent', (data) => {
            this.handleOSCSent(data);
        });
    }

    switchTab(tabName) {
        // Hide all tabs
        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.remove('active');
        });
        
        // Remove active class from all tab buttons
        document.querySelectorAll('.config-tab').forEach(btn => {
            btn.classList.remove('active');
        });

        // Show selected tab
        document.getElementById(`${tabName}-tab`)?.classList.add('active');
        document.querySelector(`[data-tab="${tabName}"]`)?.classList.add('active');
        
        this.currentTab = tabName;

        // Load tab-specific data
        switch(tabName) {
            case 'binding':
                this.loadDevices();
                this.loadBindings();
                break;
            case 'commands':
                this.loadCommands();
                break;
            case 'targets':
                this.loadTargets();
                break;
            case 'test':
                this.loadTestData();
                break;
            case 'monitor':
                this.loadActivityLog();
                this.loadMappingsOverview();
                break;
        }
    }

    async loadInitialData() {
        await this.loadDevices();
        await this.loadBindings();
        await this.loadCommands();
        await this.loadTargets();
        this.updateConnectionStatus();
    }

    updateConnectionStatus() {
        const esp32Status = document.getElementById('esp32-status');
        const oscStatus = document.getElementById('osc-status');
        
        if (this.socket.connected) {
            esp32Status.querySelector('.status-text').textContent = 'Connected';
            esp32Status.querySelector('.status-text').className = 'status-text status-connected';
            oscStatus.querySelector('.status-text').textContent = 'Ready';
        } else {
            esp32Status.querySelector('.status-text').textContent = 'Disconnected';
            esp32Status.querySelector('.status-text').className = 'status-text status-disconnected';
        }
    }

    async scanDevices() {
        try {
            const response = await fetch('/api/buzzers/scan', { method: 'POST' });
            const data = await response.json();
            
            if (data.success) {
                this.showNotification('Device scan started', 'info');
                setTimeout(() => this.loadDevices(), 2000); // Refresh after scan
            }
        } catch (error) {
            this.showNotification('Error starting device scan', 'error');
            console.error('Scan error:', error);
        }
    }

    async loadDevices() {
        try {
            const response = await fetch('/api/buzzers/devices');
            const data = await response.json();
            
            console.log('Devices API response:', data);
            
            if (data.success) {
                this.devices = data.devices;
                console.log('Loaded devices:', this.devices);
                this.renderDevices();
                this.updateDeviceCount();
            }
        } catch (error) {
            console.error('Error loading devices:', error);
        }
    }

    renderDevices() {
        const container = document.getElementById('esp32-devices');
        if (!container) return;

        if (this.devices.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: rgba(224, 224, 224, 0.6);">No devices found. Click "Scan for Devices" to discover ESP32 buzzers.</p>';
            return;
        }

        container.innerHTML = this.devices.map(device => `
            <div class="device-card ${device.online ? 'online' : 'offline'}">
                <div class="card-header">
                    <span class="card-title">${device.mac_address}</span>
                    <span class="card-status ${device.status}">${device.status}</span>
                </div>
                <div class="card-subtitle">
                    Last seen: ${device.last_seen ? new Date(device.last_seen).toLocaleString() : 'Never'}
                </div>
                ${device.discovery_mode ? `<div class="discovery-mode">Mode: ${device.discovery_mode}</div>` : ''}
                ${device.press_count > 0 ? `<div>Press count: ${device.press_count}</div>` : ''}
                <button class="btn btn-primary btn-small" onclick="app.bindDevice('${device.mac_address}')">
                    🔗 Bind Device
                </button>
            </div>
        `).join('');
    }

    bindDevice(macAddress) {
        document.getElementById('binding-mac').value = macAddress;
        const deviceName = `Buzzer ${macAddress.slice(-5).replace(':', '')}`;
        document.getElementById('binding-name').value = deviceName;
    }

    updateDeviceCount() {
        const onlineCount = this.devices.filter(d => d.online).length;
        const totalCount = this.devices.length;
        document.getElementById('device-count').textContent = `Devices: ${onlineCount}/${totalCount}`;
    }

    async createBinding() {
        const macAddress = document.getElementById('binding-mac').value;
        const deviceName = document.getElementById('binding-name').value;
        const description = document.getElementById('binding-description').value;

        if (!macAddress || !deviceName) {
            this.showNotification('MAC address and device name are required', 'error');
            return;
        }

        try {
            const response = await fetch('/api/bindings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mac_address: macAddress, device_name: deviceName, description })
            });

            const data = await response.json();
            
            if (data.success) {
                this.showNotification('Binding created successfully', 'success');
                this.loadBindings();
                // Clear form
                document.getElementById('binding-mac').value = '';
                document.getElementById('binding-name').value = '';
                document.getElementById('binding-description').value = '';
            } else {
                this.showNotification(data.error || 'Error creating binding', 'error');
            }
        } catch (error) {
            this.showNotification('Error creating binding', 'error');
            console.error('Binding error:', error);
        }
    }

    async loadBindings() {
        try {
            const response = await fetch('/api/bindings');
            const data = await response.json();
            
            if (data.success) {
                this.bindings = data.bindings;
                this.renderBindings();
            }
        } catch (error) {
            console.error('Error loading bindings:', error);
        }
    }

    renderBindings() {
        const container = document.getElementById('bindings-list');
        if (!container) return;

        if (this.bindings.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: rgba(224, 224, 224, 0.6);">No device bindings configured.</p>';
            return;
        }

        container.innerHTML = this.bindings.map(binding => `
            <div class="binding-card">
                <div class="card-header">
                    <span class="card-title">${binding.device_name}</span>
                    <span class="card-status ${binding.is_active ? 'online' : 'offline'}">
                        ${binding.is_active ? 'Active' : 'Inactive'}
                    </span>
                </div>
                <div class="card-subtitle">${binding.mac_address}</div>
                ${binding.description ? `<div>${binding.description}</div>` : ''}
                <div style="margin-top: 12px;">
                    <button class="btn btn-secondary btn-small" onclick="app.viewMappings('${binding.mac_address}')">
                        View Mappings
                    </button>
                </div>
            </div>
        `).join('');
    }

    async loadCommands(category = null) {
        try {
            const url = category ? `/api/commands/categories/${category}` : '/api/commands';
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.success) {
                this.commands = data.commands;
                this.renderCommands();
            }
        } catch (error) {
            console.error('Error loading commands:', error);
        }
    }

    filterCommands(category) {
        // Update active button
        document.querySelectorAll('.category-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector(`[data-category="${category}"]`).classList.add('active');
        
        // Load commands for category
        this.loadCommands(category === 'all' ? null : category);
    }

    renderCommands() {
        const container = document.getElementById('commands-list');
        if (!container) return;

        container.innerHTML = this.commands.map(command => `
            <div class="command-card">
                <div class="card-header">
                    <span class="card-title">${command.name}</span>
                    <span class="category-btn active">${command.category}</span>
                </div>
                <div class="card-subtitle">${command.address}</div>
                <div>Args: ${command.arguments || '[]'}</div>
                ${command.description ? `<div style="margin-top: 8px; font-style: italic;">${command.description}</div>` : ''}
            </div>
        `).join('');
    }

    async createCommand() {
        const name = document.getElementById('cmd-name').value;
        const address = document.getElementById('cmd-address').value;
        const category = document.getElementById('cmd-category').value;
        const args = document.getElementById('cmd-args').value;
        const description = document.getElementById('cmd-description').value;

        if (!name || !address) {
            this.showNotification('Name and address are required', 'error');
            return;
        }

        try {
            // Validate JSON
            JSON.parse(args || '[]');
        } catch (e) {
            this.showNotification('Arguments must be valid JSON', 'error');
            return;
        }

        try {
            const response = await fetch('/api/commands', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, address, category, arguments: args, description })
            });

            const data = await response.json();
            
            if (data.success) {
                this.showNotification('Command created successfully', 'success');
                this.loadCommands();
                // Clear form
                document.getElementById('cmd-name').value = '';
                document.getElementById('cmd-address').value = '';
                document.getElementById('cmd-args').value = '[]';
                document.getElementById('cmd-description').value = '';
            } else {
                this.showNotification(data.error || 'Error creating command', 'error');
            }
        } catch (error) {
            this.showNotification('Error creating command', 'error');
            console.error('Command error:', error);
        }
    }

    async loadTargets() {
        try {
            const response = await fetch('/api/targets');
            const data = await response.json();
            
            if (data.success) {
                this.targets = data.targets;
                this.renderTargets();
            }
        } catch (error) {
            console.error('Error loading targets:', error);
        }
    }

    renderTargets() {
        const container = document.getElementById('targets-list');
        if (!container) return;

        if (this.targets.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: rgba(224, 224, 224, 0.6);">No OSC targets configured.</p>';
            return;
        }

        container.innerHTML = this.targets.map(target => `
            <div class="target-card">
                <div class="card-header">
                    <span class="card-title">${target.name}</span>
                    <span class="card-status ${target.is_active ? 'online' : 'offline'}">
                        ${target.is_active ? 'Active' : 'Inactive'}
                    </span>
                </div>
                <div class="card-subtitle">${target.ip_address}:${target.port}</div>
                ${target.description ? `<div>${target.description}</div>` : ''}
            </div>
        `).join('');
    }

    async createTarget() {
        const name = document.getElementById('target-name').value;
        const ip_address = document.getElementById('target-ip').value;
        const port = document.getElementById('target-port').value;
        const description = document.getElementById('target-description').value;

        if (!name || !ip_address || !port) {
            this.showNotification('Name, IP address, and port are required', 'error');
            return;
        }

        try {
            const response = await fetch('/api/targets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, ip_address, port: parseInt(port), description })
            });

            const data = await response.json();
            
            if (data.success) {
                this.showNotification('Target created successfully', 'success');
                this.loadTargets();
                // Clear form
                document.getElementById('target-name').value = '';
                document.getElementById('target-ip').value = '';
                document.getElementById('target-port').value = '';
                document.getElementById('target-description').value = '';
            } else {
                this.showNotification(data.error || 'Error creating target', 'error');
            }
        } catch (error) {
            this.showNotification('Error creating target', 'error');
            console.error('Target error:', error);
        }
    }

    async loadTestData() {
        // Populate command and target selects
        const commandSelect = document.getElementById('test-command-select');
        const targetSelect = document.getElementById('test-target-select');

        if (commandSelect) {
            commandSelect.innerHTML = '<option value="">Select command...</option>' +
                this.commands.map(cmd => `<option value="${cmd.id}">${cmd.name} (${cmd.address})</option>`).join('');
        }

        if (targetSelect) {
            targetSelect.innerHTML = '<option value="">Select target...</option>' +
                this.targets.map(target => `<option value="${target.id}">${target.name} (${target.ip_address}:${target.port})</option>`).join('');
        }
    }

    async testESP32Status() {
        try {
            const response = await fetch('/api/buzzers/status');
            const data = await response.json();
            
            if (data.success) {
                this.addActivityLogEntry('ESP32 Status', JSON.stringify(data.status, null, 2), 'info');
            }
        } catch (error) {
            this.addActivityLogEntry('ESP32 Status Error', error.message, 'error');
        }
    }

    async simulateBuzzer() {
        const macAddress = document.getElementById('sim-mac').value;
        
        if (!macAddress) {
            this.showNotification('MAC address is required for simulation', 'error');
            return;
        }

        try {
            const response = await fetch('/api/buzzers/simulate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mac_address: macAddress })
            });

            const data = await response.json();
            
            if (data.success) {
                this.showNotification('Buzzer press simulated', 'success');
                this.addActivityLogEntry('Simulation', `Buzzer press from ${macAddress}`, 'info');
            }
        } catch (error) {
            this.showNotification('Error simulating buzzer press', 'error');
        }
    }

    async sendTestOSC() {
        const commandId = document.getElementById('test-command-select').value;
        const targetId = document.getElementById('test-target-select').value;
        const customArgs = document.getElementById('test-custom-args').value;

        if (!commandId || !targetId) {
            this.showNotification('Please select both command and target', 'error');
            return;
        }

        try {
            const response = await fetch('/api/commands/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ commandId, targetId, customArgs })
            });

            const data = await response.json();
            
            if (data.success) {
                this.showNotification('Test OSC message sent', 'success');
            } else {
                this.showNotification(data.error || 'Error sending test OSC', 'error');
            }
        } catch (error) {
            this.showNotification('Error sending test OSC message', 'error');
        }
    }

    handleBuzzerPress(data) {
        this.addActivityLogEntry('Buzzer Press', 
            `${data.mac_address} at ${new Date(data.received_at).toLocaleTimeString()}`, 
            'success');
    }

    handleDeviceUpdate(data) {
        console.log('Device update received:', data);
        this.loadDevices(); // Refresh devices display
    }

    handleOSCSent(data) {
        const status = data.success ? 'success' : 'error';
        const message = data.success ? 
            `${data.osc_address} → ${data.target_name} (${data.target_ip}:${data.target_port})` :
            `Failed: ${data.error}`;
        
        this.addActivityLogEntry('OSC Sent', message, status);
    }

    updateESP32Status(data) {
        // Update status indicators based on ESP32 data
        const status = data.connected ? 'Connected' : 'Disconnected';
        document.getElementById('esp32-status').querySelector('.status-text').textContent = status;
    }

    async loadActivityLog() {
        try {
            const response = await fetch('/api/monitor/activity');
            // This endpoint would need to be implemented
        } catch (error) {
            console.error('Error loading activity log:', error);
        }
    }

    addActivityLogEntry(type, message, level = 'info') {
        const logContainer = document.getElementById('activity-log');
        if (!logContainer) return;

        const timestamp = new Date().toLocaleTimeString();
        const entry = document.createElement('div');
        entry.className = 'log-entry';
        entry.innerHTML = `
            <span class="log-timestamp">[${timestamp}]</span>
            <span class="log-${level}">${type}:</span>
            <span>${message}</span>
        `;

        logContainer.appendChild(entry);
        
        // Auto-scroll if enabled
        if (document.getElementById('auto-scroll-monitor')?.checked) {
            logContainer.scrollTop = logContainer.scrollHeight;
        }

        // Limit log entries
        while (logContainer.children.length > 100) {
            logContainer.removeChild(logContainer.firstChild);
        }
    }

    clearActivityLog() {
        const logContainer = document.getElementById('activity-log');
        if (logContainer) {
            logContainer.innerHTML = '';
        }
    }

    async loadMappingsOverview() {
        try {
            const response = await fetch('/api/bindings/mappings/all');
            const data = await response.json();
            
            if (data.success) {
                this.renderMappingsOverview(data.mappings);
            }
        } catch (error) {
            console.error('Error loading mappings overview:', error);
        }
    }

    renderMappingsOverview(mappings) {
        const container = document.getElementById('mappings-overview');
        if (!container) return;

        if (mappings.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: rgba(224, 224, 224, 0.6);">No mappings configured.</p>';
            return;
        }

        container.innerHTML = mappings.map(mapping => `
            <div class="mapping-item">
                <div class="mapping-chain">
                    <span>${mapping.device_name || mapping.mac_address}</span>
                    <span class="mapping-arrow">→</span>
                    <span>${mapping.command_name}</span>
                    <span class="mapping-arrow">→</span>
                    <span>${mapping.target_name}</span>
                </div>
            </div>
        `).join('');
    }

    showNotification(message, type = 'info') {
        // Simple notification system
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed; top: 20px; right: 20px; z-index: 1000;
            padding: 12px 20px; border-radius: 8px; color: white;
            background: ${type === 'success' ? 'var(--success)' : type === 'error' ? 'var(--error)' : 'var(--primary)'};
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        `;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
}

// Initialize the admin interface
const app = new OSCBuzzerAdmin();
window.app = app;