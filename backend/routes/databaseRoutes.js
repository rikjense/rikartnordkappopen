const express = require('express');
const router = express.Router();

/**
 * POST /api/database/reset
 * Reset the database by dropping and recreating tables
 */
router.post('/reset', async (req, res) => {
  try {
    // Get the database instance
    const db = req.db;
    
    // Check if there are active games
    const activeGames = await db.get(
      `SELECT COUNT(*) as count FROM matches 
       WHERE state IN ('pending', 'warmup', 'active')`
    );
    
    if (activeGames && activeGames.count > 0) {
      return res.status(400).json({ 
        message: 'Cannot reset database while games are active. End all games first.' 
      });
    }
    
    // Disconnect all boards first
    for (const [boardId, manager] of global.boardManagers.entries()) {
      if (manager.isConnected) {
        await manager.disconnect();
      }
    }
    
    // Clear the board managers
    global.boardManagers.clear();
    
    // Drop all tables
    await db.exec(`
      PRAGMA foreign_keys = OFF;
      
      DROP TABLE IF EXISTS throws;
      DROP TABLE IF EXISTS match_players;
      DROP TABLE IF EXISTS matches;
      DROP TABLE IF EXISTS players;
      DROP TABLE IF EXISTS boards;
      
      PRAGMA foreign_keys = ON;
    `);
    
    // Recreate tables
    await db.exec(`
      -- Boards table
      CREATE TABLE IF NOT EXISTS boards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        ip_address TEXT,
        serial_number TEXT UNIQUE,
        access_token TEXT,
        status TEXT DEFAULT 'offline',
        last_seen DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      -- Players table
      CREATE TABLE IF NOT EXISTS players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        nickname TEXT,
        avatar TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      -- Matches table
      CREATE TABLE IF NOT EXISTS matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        board_id INTEGER,
        mode TEXT NOT NULL,
        state TEXT DEFAULT 'pending',
        settings TEXT,
        scores TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (board_id) REFERENCES boards (id)
      );
      
      -- Match Players table
      CREATE TABLE IF NOT EXISTS match_players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        match_id INTEGER NOT NULL,
        player_id INTEGER NOT NULL,
        position INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (match_id) REFERENCES matches (id),
        FOREIGN KEY (player_id) REFERENCES players (id)
      );
      
      -- Throws table
      CREATE TABLE IF NOT EXISTS throws (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        match_id INTEGER NOT NULL,
        player_id INTEGER NOT NULL,
        round INTEGER NOT NULL,
        throw_number INTEGER NOT NULL,
        segment TEXT NOT NULL,
        score INTEGER NOT NULL,
        coordinates TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (match_id) REFERENCES matches (id),
        FOREIGN KEY (player_id) REFERENCES players (id)
      );
    `);
    
    // Create default players for testing
    await db.run(`
      INSERT INTO players (name, nickname) VALUES 
      ('Player 1', 'P1'),
      ('Player 2', 'P2'),
      ('Player 3', 'P3'),
      ('Player 4', 'P4');
    `);
    
    // Reinitialize board managers
    const boards = await db.all('SELECT * FROM boards');
    
    for (const board of boards) {
      global.boardManagers.set(
        board.id, 
        new (require('../managers/ScoliaBoardManager'))(board, req.app.get('io'), req.db)
      );
      
      // Reconnect if board has credentials
      if (board.serial_number && board.access_token) {
        global.boardManagers.get(board.id).connect();
      }
    }
    
    // Emit database reset event
    req.app.get('io').emit('database:reset');
    
    res.json({ message: 'Database reset successful' });
  } catch (err) {
    console.error('Error resetting database:', err);
    res.status(500).json({ message: 'Failed to reset database', error: err.message });
  }
});

module.exports = router; 