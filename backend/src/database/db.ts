import { Database, open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';

/**
 * Database singleton class
 */
class DatabaseService {
  private static instance: DatabaseService;
  private db: Database | null = null;
  private isInitializing = false;

  private constructor() {}

  /**
   * Get singleton instance
   */
  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  /**
   * Get the database connection
   */
  public async getDb(): Promise<Database> {
    if (this.db) {
      return this.db;
    }

    if (this.isInitializing) {
      // Wait for initialization to complete
      await new Promise((resolve) => setTimeout(resolve, 100));
      return this.getDb();
    }

    await this.initialize();
    return this.db!;
  }

  /**
   * Initialize the database connection
   */
  public async initialize(): Promise<void> {
    try {
      this.isInitializing = true;
      const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'database', 'dart_tournament.sqlite');
      
      this.db = await open({
        filename: dbPath,
        driver: sqlite3.Database
      });
      
      // Enable foreign keys
      await this.db.exec('PRAGMA foreign_keys = ON');
      
      // Initialize schema
      await this.initializeSchema();
      
      console.log(`Database initialized at ${dbPath}`);
    } catch (error) {
      console.error('Failed to initialize database:', error);
      throw error;
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Close the database connection
   */
  public async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
    }
  }
  
  /**
   * Reset the database (drop and recreate all tables)
   */
  public async reset(): Promise<void> {
    const db = await this.getDb();
    await this.initializeSchema(true);
    console.log('Database reset completed');
  }

  /**
   * Initialize database schema
   */
  private async initializeSchema(reset: boolean = false): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      // If reset flag is true, drop all tables
      if (reset) {
        console.log('Resetting database...');
        await this.db.exec('DROP TABLE IF EXISTS matches');
        await this.db.exec('DROP TABLE IF EXISTS players');
        await this.db.exec('DROP TABLE IF EXISTS boards');
        await this.db.exec('DROP TABLE IF EXISTS throws');
        await this.db.exec('DROP TABLE IF EXISTS match_players');
      }

      // Create boards table
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS boards (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          serial_number TEXT UNIQUE,
          access_token TEXT,
          ip_address TEXT,
          status TEXT DEFAULT 'offline',
          last_seen TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create players table
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS players (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          nickname TEXT,
          email TEXT,
          avatar TEXT,
          stats TEXT, -- JSON string for player statistics
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create matches table
      await this.db.exec(`
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
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (board_id) REFERENCES boards (id) ON DELETE CASCADE,
          FOREIGN KEY (winner_id) REFERENCES players (id) ON DELETE SET NULL
        )
      `);

      // Create match_players join table
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS match_players (
          match_id INTEGER NOT NULL,
          player_id INTEGER NOT NULL,
          position INTEGER NOT NULL, -- Player position (1, 2, etc.)
          starting_score INTEGER,
          current_score INTEGER,
          is_winner BOOLEAN DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (match_id, player_id),
          FOREIGN KEY (match_id) REFERENCES matches (id) ON DELETE CASCADE,
          FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE
        )
      `);

      // Create throws table for individual dart throws
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS throws (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          match_id INTEGER NOT NULL,
          player_id INTEGER NOT NULL,
          round INTEGER NOT NULL,
          position INTEGER NOT NULL, -- Position in round (1, 2, 3)
          segment TEXT NOT NULL, -- 'S20', 'D16', 'T19', 'BULL', 'DBULL', 'MISS'
          score INTEGER NOT NULL,
          is_corrected BOOLEAN DEFAULT 0,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (match_id) REFERENCES matches (id) ON DELETE CASCADE,
          FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE
        )
      `);

      // Create triggers to update updated_at timestamp
      await this.db.exec(`
        CREATE TRIGGER IF NOT EXISTS update_boards_timestamp
        AFTER UPDATE ON boards
        BEGIN
          UPDATE boards SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
        END;
      `);

      await this.db.exec(`
        CREATE TRIGGER IF NOT EXISTS update_players_timestamp
        AFTER UPDATE ON players
        BEGIN
          UPDATE players SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
        END;
      `);

      await this.db.exec(`
        CREATE TRIGGER IF NOT EXISTS update_matches_timestamp
        AFTER UPDATE ON matches
        BEGIN
          UPDATE matches SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
        END;
      `);

      console.log('Database schema initialized successfully');
    } catch (error) {
      console.error('Error initializing database schema:', error);
      throw error;
    }
  }
}

export const dbService = DatabaseService.getInstance();
export default dbService; 