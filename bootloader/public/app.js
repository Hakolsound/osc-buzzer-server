class BootloaderApp {
    constructor() {
        this.socket = io();
        this.services = {};
        this.currentService = null;
        
        this.initializeEventListeners();
        this.connectSocketEvents();
        this.loadInitialData();
    }

    initializeEventListeners() {
        // Refresh button
        document.getElementById('refresh-btn').addEventListener('click', () => {
            this.refreshStatus();
        });

        // Stop all services button
        document.getElementById('stop-all-btn').addEventListener('click', () => {
            this.stopAllServices();
        });
    }

    connectSocketEvents() {
        this.socket.on('connect', () => {
            console.log('Connected to bootloader server');
            this.showNotification('Connected to bootloader', 'success');
            this.updateConnectionStatus(true);
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from bootloader server');
            this.showNotification('Connection lost', 'error');
            this.updateConnectionStatus(false);
        });

        this.socket.on('status-update', (data) => {
            this.services = data.services;
            this.currentService = data.currentService;
            this.renderServices();
            this.updateCurrentServiceDisplay();
        });

        this.socket.on('service-started', (data) => {
            const serviceName = this.services[data.service]?.name || data.service;
            const forceText = data.forced ? ' (force started)' : '';
            this.showNotification(`${serviceName} started successfully${forceText}`, 'success');
            
            // Clear pending service key
            this.pendingServiceKey = null;
            
            setTimeout(() => {
                this.refreshStatus();
            }, 2000);
        });

        this.socket.on('service-error', (data) => {
            this.showNotification(`Error: ${data.error}`, 'error');
        });

        this.socket.on('service-conflict', (data) => {
            this.handleServiceConflict(data);
        });
    }

    async loadInitialData() {
        try {
            const response = await fetch('/api/services');
            const data = await response.json();
            
            if (data.success) {
                this.services = data.services;
                this.currentService = data.currentService;
                this.renderServices();
                this.updateCurrentServiceDisplay();
            }
        } catch (error) {
            console.error('Error loading services:', error);
            this.showNotification('Error loading services', 'error');
        }

        this.loadSystemInfo();
    }

    async loadSystemInfo() {
        try {
            const response = await fetch('/api/system');
            const data = await response.json();
            
            if (data.success) {
                document.getElementById('system-info').textContent = data.info;
            }
        } catch (error) {
            console.error('Error loading system info:', error);
        }
    }

    renderServices() {
        const container = document.querySelector('.services-grid');
        container.innerHTML = '';

        Object.keys(this.services).forEach(serviceKey => {
            const service = this.services[serviceKey];
            const isActive = service.status === 'online';
            const isCurrentService = this.currentService === serviceKey;

            const serviceCard = document.createElement('div');
            serviceCard.className = `service-card ${isActive ? 'active' : ''}`;
            
            serviceCard.innerHTML = `
                <div class="service-icon">${service.icon}</div>
                <h3 class="service-title">${service.name}</h3>
                <p class="service-description">${service.description}</p>
                <div class="service-url">${service.url}</div>
                <div class="service-status">
                    <span class="status-${service.status}">${this.formatStatus(service.status)}</span>
                    ${service.pid ? `• PID: ${service.pid}` : ''}
                    ${service.restarts > 0 ? `• Restarts: ${service.restarts}` : ''}
                </div>
                <div class="service-actions">
                    ${isActive ? 
                        `<a href="${service.url}" target="_blank" class="btn btn-link">
                            🌐 Open Interface
                        </a>` :
                        `<button class="btn btn-primary start-service-btn" data-service="${serviceKey}">
                            🚀 Start Service
                        </button>`
                    }
                </div>
                ${isActive ? 
                    `<div class="service-details">
                        <span class="label">Port:</span>
                        <span class="value">${service.port}</span>
                        <span class="label">Uptime:</span>
                        <span class="value">${this.formatUptime(service.uptime)}</span>
                    </div>` : ''
                }
            `;

            container.appendChild(serviceCard);
        });

        // Add event listeners to start buttons
        document.querySelectorAll('.start-service-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const serviceKey = e.target.dataset.service;
                this.startService(serviceKey, false); // false = don't force
            });
        });

        this.updateStopButton();
    }

    formatStatus(status) {
        const statusMap = {
            'online': '🟢 Running',
            'stopped': '🔴 Stopped',
            'stopping': '🟡 Stopping',
            'launching': '🟡 Starting',
            'errored': '🔴 Error'
        };
        return statusMap[status] || `🔴 ${status}`;
    }

    formatUptime(uptime) {
        if (!uptime) return 'N/A';
        
        const now = Date.now();
        const uptimeMs = now - uptime;
        const seconds = Math.floor(uptimeMs / 1000);
        
        if (seconds < 60) return `${seconds}s`;
        
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m`;
        
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ${minutes % 60}m`;
        
        const days = Math.floor(hours / 24);
        return `${days}d ${hours % 24}h`;
    }

    updateCurrentServiceDisplay() {
        const display = document.getElementById('current-service-display');
        
        if (this.currentService && this.services[this.currentService]) {
            const service = this.services[this.currentService];
            display.innerHTML = `
                <div class="current-service-info">
                    <div>
                        <strong>${service.icon} ${service.name}</strong>
                        <div>Status: ${this.formatStatus(service.status)}</div>
                        <div>URL: <a href="${service.url}" target="_blank">${service.url}</a></div>
                    </div>
                    <div>
                        <a href="${service.url}" target="_blank" class="btn btn-success">
                            🌐 Open Interface
                        </a>
                    </div>
                </div>
            `;
        } else {
            display.innerHTML = '<span class="no-service">No service running</span>';
        }
    }

    updateStopButton() {
        const stopBtn = document.getElementById('stop-all-btn');
        const hasRunningService = Object.values(this.services).some(service => 
            service.status === 'online'
        );
        stopBtn.disabled = !hasRunningService;
    }

    updateConnectionStatus(connected) {
        const piStatus = document.getElementById('pi-status');
        const uartStatus = document.getElementById('uart-status');
        
        if (connected) {
            piStatus.textContent = '🟢 Pi Online';
            piStatus.style.color = 'var(--success)';
        } else {
            piStatus.textContent = '🔴 Pi Offline';
            piStatus.style.color = 'var(--danger)';
        }

        // Update UART status based on running services
        const hasUartService = Object.values(this.services).some(service => 
            service.status === 'online'
        );
        
        if (hasUartService) {
            uartStatus.textContent = '🔒 UART In Use';
            uartStatus.style.color = 'var(--warning)';
        } else {
            uartStatus.textContent = '⚡ UART Available';
            uartStatus.style.color = 'var(--success)';
        }
    }

    async startService(serviceKey, force = false) {
        const service = this.services[serviceKey];
        if (!service) return;

        // Store the pending service key for conflict resolution
        this.pendingServiceKey = serviceKey;

        this.showNotification(`Starting ${service.name}...`, 'info');
        
        // Disable all start buttons
        document.querySelectorAll('.start-service-btn').forEach(btn => {
            btn.disabled = true;
            btn.textContent = '🔄 Starting...';
        });

        this.socket.emit('start-service', { service: serviceKey, force });
    }

    handleServiceConflict(data) {
        // Re-enable buttons
        document.querySelectorAll('.start-service-btn').forEach(btn => {
            btn.disabled = false;
            btn.textContent = '🚀 Start Service';
        });

        // Show conflict dialog
        this.showConflictDialog(data);
    }

    showConflictDialog(conflictData) {
        const dialog = document.createElement('div');
        dialog.className = 'conflict-dialog';
        
        const runningServiceNames = conflictData.conflictServices
            .map(key => this.services[key]?.name || key)
            .join(', ');
            
        const requestedService = conflictData.message.includes('Cannot start') 
            ? conflictData.message.split('Cannot start ')[1].split('.')[0]
            : 'the requested service';

        dialog.innerHTML = `
            <div class="conflict-dialog-backdrop">
                <div class="conflict-dialog-content">
                    <div class="conflict-dialog-header">
                        <h3>⚠️ Service Conflict Detected</h3>
                    </div>
                    <div class="conflict-dialog-body">
                        <p><strong>Cannot start ${requestedService}</strong></p>
                        <p>Another service is already running: <strong>${runningServiceNames}</strong></p>
                        <br>
                        <p>⚠️ <strong>WARNING:</strong> Only ONE service can use the UART port at a time!</p>
                        <p>Starting a new service will <strong>FORCEFULLY STOP</strong> the running service.</p>
                        <br>
                        <p>Do you want to proceed?</p>
                    </div>
                    <div class="conflict-dialog-actions">
                        <button class="btn btn-secondary cancel-btn">❌ Cancel</button>
                        <button class="btn btn-danger force-btn">⚡ Force Start Service</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);

        // Add event listeners
        const cancelBtn = dialog.querySelector('.cancel-btn');
        const forceBtn = dialog.querySelector('.force-btn');

        cancelBtn.addEventListener('click', () => {
            document.body.removeChild(dialog);
            this.showNotification('Service start cancelled', 'info');
        });

        forceBtn.addEventListener('click', () => {
            document.body.removeChild(dialog);
            
            // Extract service key from conflict data
            const serviceKey = this.getServiceKeyFromConflict(conflictData);
            if (serviceKey) {
                const serviceName = this.services[serviceKey]?.name || serviceKey;
                this.showNotification(`Force starting ${serviceName} - stopping existing service...`, 'warning');
                this.startService(serviceKey, true); // true = force
            }
        });

        // Close on backdrop click
        const backdrop = dialog.querySelector('.conflict-dialog-backdrop');
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) {
                cancelBtn.click();
            }
        });
    }

    getServiceKeyFromConflict(conflictData) {
        // Store the requested service key when conflict occurs
        return this.pendingServiceKey || null;
    }

    async stopAllServices() {
        this.showNotification('Stopping all services...', 'info');
        
        const stopBtn = document.getElementById('stop-all-btn');
        stopBtn.disabled = true;
        stopBtn.textContent = '🔄 Stopping...';

        this.socket.emit('stop-services');
        
        setTimeout(() => {
            stopBtn.disabled = false;
            stopBtn.textContent = '🛑 Stop All Services';
        }, 3000);
    }

    refreshStatus() {
        this.socket.emit('get-status');
        this.loadSystemInfo();
        this.showNotification('Status refreshed', 'info');
    }

    showNotification(message, type = 'info') {
        const notification = document.getElementById('notification');
        notification.textContent = message;
        notification.className = `notification show ${type}`;
        
        setTimeout(() => {
            notification.className = 'notification hidden';
        }, 3000);
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.bootloader = new BootloaderApp();
});