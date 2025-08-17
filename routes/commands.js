const express = require('express');

module.exports = function(database, oscService) {
  const router = express.Router();

  // Get all OSC commands
  router.get('/', async (req, res) => {
    try {
      const { category } = req.query;
      const commands = await database.getOSCCommands(category);
      
      res.json({
        success: true,
        commands,
        category: category || 'all',
        count: commands.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error getting commands:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Get commands by category
  router.get('/categories/:category', async (req, res) => {
    try {
      const { category } = req.params;
      const commands = await database.getOSCCommands(category);
      
      res.json({
        success: true,
        commands,
        category,
        count: commands.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error getting commands by category:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Create new OSC command
  router.post('/', async (req, res) => {
    try {
      const { name, address, category, arguments: args, description } = req.body;
      
      if (!name || !address) {
        return res.status(400).json({
          success: false,
          error: 'Name and address are required'
        });
      }

      // Validate arguments is valid JSON
      let argsStr = args || '[]';
      try {
        JSON.parse(argsStr);
      } catch (e) {
        return res.status(400).json({
          success: false,
          error: 'Arguments must be valid JSON array'
        });
      }

      const result = await database.createOSCCommand(
        name, 
        address, 
        category || 'custom', 
        argsStr, 
        description || ''
      );
      
      res.json({
        success: true,
        command_id: result.id,
        name,
        address,
        category: category || 'custom',
        arguments: argsStr,
        description,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error creating command:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Test OSC command
  router.post('/test', async (req, res) => {
    try {
      const { commandId, targetId, customArgs } = req.body;
      
      if (!commandId || !targetId) {
        return res.status(400).json({
          success: false,
          error: 'Command ID and target ID are required'
        });
      }

      await oscService.sendTestCommand({ commandId, targetId, customArgs });
      
      res.json({
        success: true,
        message: 'Test command sent successfully',
        commandId,
        targetId,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error testing command:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Get available categories
  router.get('/categories', async (req, res) => {
    try {
      const commands = await database.getOSCCommands();
      const categories = [...new Set(commands.map(cmd => cmd.category))];
      
      res.json({
        success: true,
        categories,
        count: categories.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error getting categories:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
};