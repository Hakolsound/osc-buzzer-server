const express = require('express');

module.exports = function(database, oscService) {
  const router = express.Router();

  // Get all buzzer bindings
  router.get('/', async (req, res) => {
    try {
      const bindings = await database.getBuzzerBindings();
      res.json({
        success: true,
        bindings,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error getting bindings:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Create or update buzzer binding
  router.post('/', async (req, res) => {
    try {
      const { mac_address, device_name, description } = req.body;
      
      if (!mac_address || !device_name) {
        return res.status(400).json({
          success: false,
          error: 'MAC address and device name are required'
        });
      }

      const result = await database.createBuzzerBinding(mac_address, device_name, description);
      
      res.json({
        success: true,
        binding_id: result.id,
        mac_address,
        device_name,
        description,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error creating binding:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Get binding by MAC address
  router.get('/:mac_address', async (req, res) => {
    try {
      const { mac_address } = req.params;
      const binding = await database.getBuzzerBindingByMac(mac_address);
      
      if (!binding) {
        return res.status(404).json({
          success: false,
          error: 'Binding not found'
        });
      }

      res.json({
        success: true,
        binding,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error getting binding:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Get mappings for a specific buzzer
  router.get('/:mac_address/mappings', async (req, res) => {
    try {
      const { mac_address } = req.params;
      const mappings = await database.getMappingsForBuzzer(mac_address);
      
      res.json({
        success: true,
        mac_address,
        mappings,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error getting mappings:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Create mapping between buzzer, command, and target
  router.post('/:mac_address/mappings', async (req, res) => {
    try {
      const { mac_address } = req.params;
      const { osc_command_id, osc_target_id } = req.body;
      
      if (!osc_command_id || !osc_target_id) {
        return res.status(400).json({
          success: false,
          error: 'OSC command ID and target ID are required'
        });
      }

      // Get buzzer binding
      const binding = await database.getBuzzerBindingByMac(mac_address);
      if (!binding) {
        return res.status(404).json({
          success: false,
          error: 'Buzzer binding not found. Create binding first.'
        });
      }

      // Create mapping
      const result = await database.createMapping(binding.id, osc_command_id, osc_target_id);
      
      res.json({
        success: true,
        mapping_id: result.id,
        buzzer_binding_id: binding.id,
        osc_command_id,
        osc_target_id,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error creating mapping:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Get all mappings overview
  router.get('/mappings/all', async (req, res) => {
    try {
      const mappings = await database.getAllMappings();
      res.json({
        success: true,
        mappings,
        count: mappings.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error getting all mappings:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
};