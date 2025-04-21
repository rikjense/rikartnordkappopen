require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const WebSocket = require('ws');
const db = require('./models/database');
const gameRoutes = require('./routes/gameRoutes');
const playerRoutes = require('./routes/playerRoutes');
const tournamentRoutes = require('./routes/tournamentRoutes');
const overrideRouter = require('./routes/overrideRouter');
const scoringService = require('./services/scoringService');
const { setupSocketHandlers } = require('./services/socketService');
const { connectToScoliaBoards } = require('./services/scoliaService');

// Initialize app
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

// Routes
app.use('/api/games', gameRoutes);
app.use('/api/players', playerRoutes);
app.use('/api/tournaments', tournamentRoutes);
app.use('/api/override', overrideRouter);

// Initialize database
db.init()
  .then(() => {
    console.log('Database initialized');
    
    // Setup Socket.IO handlers
    setupSocketHandlers(io);
    
    // Connect to Scolia boards
    connectToScoliaBoards();
    
    // Auto-save game state every 30 seconds
    setInterval(() => {
      scoringService.autoSaveAllGames();
    }, 30000);
  })
  .catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
}); 