# OSC Buzzer Server

A Node.js server that bridges ESP32 wireless buzzer presses to OSC (Open Sound Control) messages for lighting and audio control systems.

## Features

- **Device Discovery**: Automatically discover and bind ESP32 buzzer devices by MAC address
- **OSC Command Library**: Predefined commands for popular software (Resolume, QLab, lighting, audio)
- **Target Management**: Configure multiple remote machines to send OSC messages to
- **Real-time Translation**: Instant translation of buzzer presses to configured OSC commands
- **Web Admin Interface**: Comprehensive web interface for configuration and monitoring
- **Live Monitoring**: Real-time activity logging and system status monitoring
- **Testing Tools**: Built-in tools for testing ESP32 communication and OSC message delivery

## Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

3. **Start Server**
   ```bash
   npm start
   ```

4. **Open Admin Interface**
   - Navigate to `http://localhost:3002` (or your configured port)
   - Use the web interface to configure buzzer bindings, OSC commands, and targets

## Architecture

### Hardware Components
- **ESP32 Central Coordinator**: Receives wireless buzzer presses via ESP-NOW
- **ESP32 Buzzers**: Individual wireless buzzers with unique MAC addresses
- **Raspberry Pi**: Runs this OSC server, connected to coordinator via UART

### Software Components
- **ESP32 Service**: Handles UART communication with ESP32 coordinator
- **OSC Service**: Manages OSC message generation and delivery
- **Database Service**: SQLite database for configuration storage
- **Web Admin**: React-like admin interface for system management

## Configuration

### Buzzer Binding
1. Scan for ESP32 devices
2. Bind MAC addresses to logical device names
3. Configure descriptions and settings

### OSC Commands
- Use predefined commands for popular software
- Create custom OSC commands with specific addresses and arguments
- Organize commands by category (Resolume, QLab, Lighting, Audio, Custom)

### Target Machines
- Configure IP addresses and ports for OSC message destinations
- Support for multiple simultaneous targets
- Test connectivity to each target

### Mappings
- Create many-to-many relationships between buzzers, commands, and targets
- One buzzer press can trigger multiple commands to multiple targets
- Flexible routing configuration

## API Endpoints

### Buzzer Management
- `GET /api/buzzers/devices` - Get all ESP32 devices
- `GET /api/buzzers/status` - Get ESP32 service status
- `POST /api/buzzers/scan` - Start device discovery
- `POST /api/buzzers/simulate` - Simulate buzzer press for testing

### Binding Management
- `GET /api/bindings` - Get all buzzer bindings
- `POST /api/bindings` - Create new buzzer binding
- `GET /api/bindings/:mac/mappings` - Get mappings for specific buzzer

### Command Management
- `GET /api/commands` - Get all OSC commands
- `POST /api/commands` - Create new OSC command
- `POST /api/commands/test` - Test OSC command delivery

### Target Management
- `GET /api/targets` - Get all OSC targets
- `POST /api/targets` - Create new OSC target
- `GET /api/targets/status` - Get target connection status

## Environment Variables

```bash
PORT=3002                          # Server port
ESP32_SERIAL_PORT=/dev/ttyUSB0    # ESP32 UART port
ESP32_BAUD_RATE=115200            # UART baud rate
DB_PATH=./database/osc-buzzer.db  # SQLite database path
```

## Database Schema

### Tables
- **buzzer_bindings**: MAC address to device name mapping
- **osc_commands**: OSC command library with addresses and arguments
- **osc_targets**: Target machine configuration (IP, port, name)
- **buzzer_command_mappings**: Many-to-many relationships between buzzers, commands, and targets
- **activity_log**: Real-time activity monitoring

## Web Interface

### Binding Tab
- View online/offline ESP32 devices
- Create and manage buzzer bindings
- Quick bind from discovered devices

### Commands Tab
- Browse predefined command library
- Filter by category (Resolume, QLab, Lighting, Audio)
- Create custom OSC commands

### Targets Tab
- Configure remote OSC receivers
- Test connectivity to targets
- Manage IP addresses and ports

### Test Tab
- Test ESP32 communication
- Simulate buzzer presses
- Send test OSC messages
- Verify end-to-end functionality

### Monitor Tab
- Live activity log with real-time updates
- View current mappings configuration
- System status monitoring

## Integration Examples

### Resolume Avenue
```javascript
// Flash layer 1
{
  address: "/layer1/video/opacity/values",
  arguments: [1.0]
}

// Trigger specific clip
{
  address: "/layer1/clip1/connect",
  arguments: [1]
}
```

### QLab
```javascript
// Execute next cue
{
  address: "/go",
  arguments: []
}

// Start specific cue
{
  address: "/cue/1/start",
  arguments: []
}
```

### Generic Lighting
```javascript
// Activate scene
{
  address: "/light/scene",
  arguments: [1]
}

// Control dimmer
{
  address: "/light/dimmer/1",
  arguments: [255]
}
```

## Development

### Simulation Mode
When no ESP32 hardware is connected, the server runs in simulation mode:
- Simulated device discovery
- Manual buzzer press simulation
- Full OSC functionality testing

### Debugging
- Enable verbose logging in `.env`
- Use browser developer tools for frontend debugging
- Monitor real-time WebSocket communication
- Check SQLite database directly for troubleshooting

## Hardware Requirements

- Raspberry Pi 4 (recommended) or similar Linux system
- ESP32 central coordinator connected via USB/UART
- ESP32 buzzer devices configured with ESP-NOW
- Network connection for OSC message delivery

## Software Requirements

- Node.js 16+ with npm
- Modern web browser for admin interface
- Target systems configured to receive OSC messages

## License

This project is part of the Hakol Trivia Game system.

## Support

For technical support, hardware setup, or feature requests, please refer to the main trivia game project documentation.