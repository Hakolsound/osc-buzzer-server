const express = require('express');

module.exports = function(database, oscService) {
  const router = express.Router();

  // Get all OSC targets
  router.get('/', async (req, res) => {
    try {
      const targets = await database.getOSCTargets();
      res.json({
        success: true,
        targets,
        count: targets.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error getting targets:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Create new OSC target
  router.post('/', async (req, res) => {
    try {
      const { name, ip_address, port, description } = req.body;
      
      if (!name || !ip_address || !port) {
        return res.status(400).json({
          success: false,
          error: 'Name, IP address, and port are required'
        });
      }

      // Validate port is a number
      const portNum = parseInt(port);
      if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
        return res.status(400).json({
          success: false,
          error: 'Port must be a valid number between 1 and 65535'
        });
      }

      // Basic IP validation
      const ipPattern = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
      if (!ipPattern.test(ip_address) && ip_address !== 'localhost') {
        return res.status(400).json({
          success: false,
          error: 'Invalid IP address format'
        });
      }

      const result = await database.createOSCTarget(name, ip_address, portNum, description || '');
      
      res.json({
        success: true,
        target_id: result.id,
        name,
        ip_address,
        port: portNum,
        description,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error creating target:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Get target status (connection info)
  router.get('/status', async (req, res) => {
    try {
      const status = await oscService.getTargetStatus();
      res.json({
        success: true,
        targets: status,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error getting target status:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Test connection to target
  router.post('/:id/test', async (req, res) => {
    try {
      const { id } = req.params;
      const { commandId } = req.body;
      
      if (!commandId) {
        return res.status(400).json({
          success: false,
          error: 'Command ID is required for testing'
        });
      }

      await oscService.sendTestCommand({ 
        commandId, 
        targetId: id 
      });
      
      res.json({
        success: true,
        message: 'Test message sent to target',
        targetId: id,
        commandId,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error testing target:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
};