const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'tournament.db');
let db;

// Initialize database and create tables if they don't exist
const init = () => {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err.message);
        return reject(err);
      }
      console.log('Connected to the SQLite database.');
      
      db.serialize(() => {
        // Enable foreign keys
        db.run('PRAGMA foreign_keys = ON');
        
        // Players table
        db.run(`
          CREATE TABLE IF NOT EXISTS players (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            nickname TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        
        // Tournaments table
        db.run(`
          CREATE TABLE IF NOT EXISTS tournaments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            start_date TIMESTAMP,
            end_date TIMESTAMP,
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        
        // Boards table
        db.run(`
          CREATE TABLE IF NOT EXISTS boards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            scolia_id TEXT UNIQUE,
            status TEXT DEFAULT 'available',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        
        // Games table
        db.run(`
          CREATE TABLE IF NOT EXISTS games (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tournament_id INTEGER,
            board_id INTEGER,
            legs_required INTEGER NOT NULL,
            status TEXT DEFAULT 'pending',
            player1_id INTEGER NOT NULL,
            player2_id INTEGER NOT NULL,
            player1_legs INTEGER DEFAULT 0,
            player2_legs INTEGER DEFAULT 0,
            current_leg_player1_score INTEGER DEFAULT 501,
            current_leg_player2_score INTEGER DEFAULT 501,
            current_leg_player1_darts INTEGER DEFAULT 0,
            current_leg_player2_darts INTEGER DEFAULT 0,
            current_leg_starter INTEGER, 
            current_player INTEGER,
            warmup_complete BOOLEAN DEFAULT 0,
            bull_complete BOOLEAN DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (tournament_id) REFERENCES tournaments (id),
            FOREIGN KEY (board_id) REFERENCES boards (id),
            FOREIGN KEY (player1_id) REFERENCES players (id),
            FOREIGN KEY (player2_id) REFERENCES players (id)
          )
        `);
        
        // Legs table
        db.run(`
          CREATE TABLE IF NOT EXISTS legs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            game_id INTEGER NOT NULL,
            leg_number INTEGER NOT NULL,
            winner_id INTEGER,
            player1_darts INTEGER DEFAULT 0,
            player2_darts INTEGER DEFAULT 0,
            player1_score INTEGER DEFAULT 501,
            player2_score INTEGER DEFAULT 501,
            starter_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMP,
            FOREIGN KEY (game_id) REFERENCES games (id),
            FOREIGN KEY (winner_id) REFERENCES players (id),
            FOREIGN KEY (starter_id) REFERENCES players (id)
          )
        `);
        
        // Throws table
        db.run(`
          CREATE TABLE IF NOT EXISTS throws (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            leg_id INTEGER NOT NULL,
            player_id INTEGER NOT NULL,
            score INTEGER NOT NULL,
            dart1 TEXT,
            dart2 TEXT,
            dart3 TEXT,
            remaining INTEGER NOT NULL,
            is_bust BOOLEAN DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (leg_id) REFERENCES legs (id),
            FOREIGN KEY (player_id) REFERENCES players (id)
          )
        `);
        
        // Game logs table for tracking manual overrides and important events
        db.run(`
          CREATE TABLE IF NOT EXISTS game_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            game_id INTEGER NOT NULL,
            action TEXT NOT NULL,
            details TEXT,
            performed_by TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (game_id) REFERENCES games (id)
          )
        `);
        
        // Stats table for cache of calculated statistics
        db.run(`
          CREATE TABLE IF NOT EXISTS player_stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player_id INTEGER NOT NULL,
            game_id INTEGER NOT NULL,
            three_dart_avg REAL,
            checkout_attempts INTEGER DEFAULT 0,
            checkout_successes INTEGER DEFAULT 0,
            highest_checkout INTEGER DEFAULT 0,
            darts_per_leg REAL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (player_id) REFERENCES players (id),
            FOREIGN KEY (game_id) REFERENCES games (id),
            UNIQUE(player_id, game_id)
          )
        `);
        
        // Match summaries table
        db.run(`
          CREATE TABLE IF NOT EXISTS match_summaries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            match_id INTEGER NOT NULL,
            player_id INTEGER NOT NULL,
            legs_played INTEGER DEFAULT 0,
            legs_won INTEGER DEFAULT 0,
            average REAL DEFAULT 0,
            first_nine_average REAL DEFAULT 0,
            checkout_percentage REAL DEFAULT 0,
            highest_checkout INTEGER DEFAULT 0,
            checkout_attempts INTEGER DEFAULT 0,
            checkout_successes INTEGER DEFAULT 0,
            ton_plus INTEGER DEFAULT 0,
            ton_forty_plus INTEGER DEFAULT 0,
            ton_eighty INTEGER DEFAULT 0,
            total_darts INTEGER DEFAULT 0,
            darts_per_leg REAL DEFAULT 0,
            match_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (match_id) REFERENCES games (id),
            FOREIGN KEY (player_id) REFERENCES players (id),
            UNIQUE(match_id, player_id)
          )
        `);

        // Matches table with takeout_in_progress field
        db.run(`
          CREATE TABLE IF NOT EXISTS matches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            board_id INTEGER NOT NULL,
            mode TEXT NOT NULL, -- '301', '501', 'cricket', etc.
            state TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'warmup', 'active', 'completed', 'canceled'
            scores TEXT, -- JSON string for current scores
            settings TEXT, -- JSON string for game settings
            start_time TIMESTAMP,
            end_time TIMESTAMP,
            winner_id INTEGER,
            takeout_in_progress BOOLEAN DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (board_id) REFERENCES boards (id) ON DELETE CASCADE,
            FOREIGN KEY (winner_id) REFERENCES players (id) ON DELETE SET NULL
          )
        `, (err) => {
          if (err) {
            console.error('Error creating tables:', err.message);
            return reject(err);
          }
          resolve();
        });
      });
    });
  });
};

// Get database instance
const getDb = () => {
  if (!db) {
    throw new Error('Database not initialized. Call init() first.');
  }
  return db;
};

// Close database connection
const close = () => {
  return new Promise((resolve, reject) => {
    if (db) {
      db.close((err) => {
        if (err) {
          console.error('Error closing database:', err.message);
          return reject(err);
        }
        console.log('Database connection closed.');
        db = null;
        resolve();
      });
    } else {
      resolve();
    }
  });
};

module.exports = { init, getDb, close }; 