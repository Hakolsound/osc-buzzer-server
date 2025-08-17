const express = require('express');

module.exports = function(esp32Service) {
  const router = express.Router();

  // Get all ESP32 devices
  router.get('/devices', async (req, res) => {
    try {
      const devices = await esp32Service.getDevices();
      res.json({
        success: true,
        devices,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error getting devices:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Get ESP32 service status
  router.get('/status', async (req, res) => {
    try {
      const status = await esp32Service.getStatus();
      res.json({
        success: true,
        status,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error getting ESP32 status:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Start device scan
  router.post('/scan', async (req, res) => {
    try {
      const result = await esp32Service.startDeviceScan();
      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('Error starting device scan:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Simulate buzzer press (for testing)
  router.post('/simulate', async (req, res) => {
    try {
      const { mac_address, timestamp } = req.body;
      esp32Service.simulateBuzzerPress(mac_address, timestamp);
      
      res.json({
        success: true,
        message: 'Buzzer press simulated',
        mac_address,
        timestamp: timestamp || Date.now()
      });
    } catch (error) {
      console.error('Error simulating buzzer press:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Trigger identification for testing
  router.post('/identify', async (req, res) => {
    try {
      const { mac_address } = req.body;
      
      if (!mac_address) {
        return res.status(400).json({
          success: false,
          error: 'MAC address is required'
        });
      }
      
      // Directly trigger identification
      esp32Service.handlePotentialIdentification(mac_address);
      
      res.json({
        success: true,
        message: 'Identification triggered',
        mac_address,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Error triggering identification:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Arm buzzer for testing button presses
  router.post('/arm', async (req, res) => {
    try {
      const { mac_address } = req.body;
      
      if (!mac_address) {
        return res.status(400).json({
          success: false,
          error: 'MAC address is required'
        });
      }
      
      // Send ARM command to ESP32
      const armCommand = 'ARM';
      esp32Service.sendCommand(armCommand);
      
      res.json({
        success: true,
        message: 'ARM command sent to buzzer',
        mac_address,
        command: armCommand,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Error sending ARM command:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
};