const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const boardRoutes = require('./routes/boardRoutes');
const playerRoutes = require('./routes/playerRoutes');
const matchRoutes = require('./routes/matchRoutes');
const databaseRoutes = require('./routes/databaseRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const setupSocketHandlers = require('./socket/socketHandlers');
const { initDatabase } = require('./database/dbInit');
const ScoliaBoardManager = require('./managers/ScoliaBoardManager');

// Load environment variables
dotenv.config({ path: '.env.local' });

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  }
});

// Global state to hold board managers
global.boardManagers = new Map();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database initialization
let db;
const initializeDatabase = async () => {
  try {
    // Open DB connection
    db = await open({
      filename: process.env.DATABASE_PATH || './database/dart_tournament.sqlite',
      driver: sqlite3.Database
    });
    
    // Initialize database schema
    await initDatabase(db);
    
    // Make database available in request object
    app.use((req, res, next) => {
      req.db = db;
      next();
    });
    
    console.log('Database initialized successfully');
    
    // Initialize board managers for existing boards
    const boards = await db.all('SELECT * FROM boards');
    boards.forEach(board => {
      global.boardManagers.set(
        board.id, 
        new ScoliaBoardManager(board, io, db)
      );
    });
    
    console.log(`Initialized ${boards.length} board managers`);
    
  } catch (err) {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  }
};

// Routes
app.use('/api/boards', boardRoutes);
app.use('/api/players', playerRoutes);
app.use('/api/games', matchRoutes);
app.use('/api/database', databaseRoutes);
app.use('/api/settings', settingsRoutes);

// Serve frontend static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/build')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/build', 'index.html'));
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    message: 'Internal server error', 
    error: process.env.NODE_ENV === 'development' ? err.message : undefined 
  });
});

// Socket.IO setup
setupSocketHandlers(io, db);

// Start server
const PORT = process.env.PORT || 5000;

(async function startServer() {
  await initializeDatabase();
  
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
})();

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down server...');
  
  // Close all board connections
  for (const manager of global.boardManagers.values()) {
    await manager.disconnect();
  }
  
  // Close database connection
  if (db) {
    await db.close();
  }
  
  process.exit(0);
});

module.exports = { app, server, io }; 