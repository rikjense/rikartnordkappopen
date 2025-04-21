const express = require('express');
const router = express.Router();

/**
 * GET /api/settings
 * Get all application settings
 */
router.get('/', async (req, res) => {
  try {
    // Check if settings table exists
    const tableExists = await req.db.get(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='settings'"
    );
    
    if (!tableExists) {
      // Create settings table if it doesn't exist
      await req.db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          game_defaults TEXT,  -- JSON string for default game settings
          refresh_interval INTEGER DEFAULT 5000,
          checkout_suggestions BOOLEAN DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Create default settings
      await req.db.run(`
        INSERT OR IGNORE INTO settings (id, game_defaults, refresh_interval)
        VALUES (1, ?, 5000)
      `, [JSON.stringify({
        x01: {
          startingScore: 501,
          doubleIn: false,
          doubleOut: true,
          masterOut: false
        }
      })]);
    }
    
    // Get settings
    const settings = await req.db.get('SELECT * FROM settings WHERE id = 1');
    
    if (!settings) {
      return res.status(404).json({ message: 'Settings not found' });
    }
    
    // Parse JSON fields
    const formattedSettings = {
      ...settings,
      game_defaults: JSON.parse(settings.game_defaults || '{}')
    };
    
    res.json(formattedSettings);
  } catch (err) {
    console.error('Error fetching settings:', err);
    res.status(500).json({ message: 'Failed to fetch settings', error: err.message });
  }
});

/**
 * PUT /api/settings
 * Update application settings
 */
router.put('/', async (req, res) => {
  try {
    const { game_defaults, refresh_interval, checkout_suggestions } = req.body;
    
    // Validate
    if (refresh_interval && (refresh_interval < 1000 || refresh_interval > 60000)) {
      return res.status(400).json({ 
        message: 'Refresh interval must be between 1000 and 60000 ms' 
      });
    }
    
    // Get current settings
    const currentSettings = await req.db.get('SELECT * FROM settings WHERE id = 1');
    
    if (!currentSettings) {
      return res.status(404).json({ message: 'Settings not found' });
    }
    
    // Parse current game defaults
    const currentGameDefaults = JSON.parse(currentSettings.game_defaults || '{}');
    
    // Merge with new game defaults if provided
    const updatedGameDefaults = game_defaults ? 
      { ...currentGameDefaults, ...game_defaults } : 
      currentGameDefaults;
    
    // Update settings
    await req.db.run(
      `UPDATE settings 
       SET game_defaults = ?, 
           refresh_interval = ?, 
           checkout_suggestions = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = 1`,
      [
        JSON.stringify(updatedGameDefaults),
        refresh_interval !== undefined ? refresh_interval : currentSettings.refresh_interval,
        checkout_suggestions !== undefined ? (checkout_suggestions ? 1 : 0) : currentSettings.checkout_suggestions
      ]
    );
    
    // Get updated settings
    const updatedSettings = await req.db.get('SELECT * FROM settings WHERE id = 1');
    
    // Parse JSON fields
    const formattedSettings = {
      ...updatedSettings,
      game_defaults: JSON.parse(updatedSettings.game_defaults || '{}')
    };
    
    // Emit settings updated event
    req.app.get('io').emit('settings:updated', formattedSettings);
    
    res.json(formattedSettings);
  } catch (err) {
    console.error('Error updating settings:', err);
    res.status(500).json({ message: 'Failed to update settings', error: err.message });
  }
});

/**
 * POST /api/settings/reset
 * Reset all settings to defaults
 */
router.post('/reset', async (req, res) => {
  try {
    // Default settings
    const defaultSettings = {
      game_defaults: {
        x01: {
          startingScore: 501,
          doubleIn: false,
          doubleOut: true,
          masterOut: false
        }
      },
      refresh_interval: 5000,
      checkout_suggestions: true
    };
    
    // Update settings
    await req.db.run(
      `UPDATE settings 
       SET game_defaults = ?, 
           refresh_interval = ?, 
           checkout_suggestions = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = 1`,
      [
        JSON.stringify(defaultSettings.game_defaults),
        defaultSettings.refresh_interval,
        defaultSettings.checkout_suggestions ? 1 : 0
      ]
    );
    
    // Get updated settings
    const updatedSettings = await req.db.get('SELECT * FROM settings WHERE id = 1');
    
    // Parse JSON fields
    const formattedSettings = {
      ...updatedSettings,
      game_defaults: JSON.parse(updatedSettings.game_defaults || '{}')
    };
    
    // Emit settings updated event
    req.app.get('io').emit('settings:updated', formattedSettings);
    
    res.json(formattedSettings);
  } catch (err) {
    console.error('Error resetting settings:', err);
    res.status(500).json({ message: 'Failed to reset settings', error: err.message });
  }
});

module.exports = router; 