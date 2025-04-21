const WebSocket = require('ws');
const { getDb } = require('../models/database');
const { processThrow } = require('./scoringService');
const { logGameAction } = require('../utils/gameLogger');

// Map to track board connections
const boardConnections = new Map();

/**
 * Connect to all Scolia boards defined in the database
 */
const connectToScoliaBoards = async () => {
  const db = getDb();
  
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM boards WHERE scolia_id IS NOT NULL', [], (err, boards) => {
      if (err) return reject(err);
      
      console.log(`Found ${boards.length} Scolia boards to connect to`);
      
      // Connect to each board
      const connectionPromises = boards.map(board => connectToBoard(board));
      
      Promise.all(connectionPromises)
        .then(() => resolve(boards.length))
        .catch(reject);
    });
  });
};

/**
 * Connect to a specific Scolia board
 */
const connectToBoard = async (board) => {
  return new Promise((resolve, reject) => {
    try {
      // Check if we're already connected
      if (boardConnections.has(board.id) && 
          boardConnections.get(board.id).readyState === WebSocket.OPEN) {
        console.log(`Already connected to board ${board.name} (${board.scolia_id})`);
        return resolve();
      }
      
      // Construct the WebSocket URL - this will need to be configured based on Scolia API
      const wsUrl = process.env.SCOLIA_WS_URL || 'ws://localhost:8080';
      const fullUrl = `${wsUrl}/${board.scolia_id}`;
      
      console.log(`Connecting to board ${board.name} at ${fullUrl}`);
      
      // Create WebSocket connection
      const ws = new WebSocket(fullUrl);
      
      ws.on('open', () => {
        console.log(`Connected to Scolia board ${board.name} (${board.scolia_id})`);
        
        // Store the connection
        boardConnections.set(board.id, ws);
        
        // Send authentication if required (depends on Scolia API)
        if (process.env.SCOLIA_API_KEY) {
          ws.send(JSON.stringify({
            type: 'authenticate',
            key: process.env.SCOLIA_API_KEY
          }));
        }
        
        // Update board status in the database
        updateBoardStatus(board.id, 'connected');
        
        resolve();
      });
      
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          handleScoliaMessage(board.id, message);
        } catch (err) {
          console.error(`Error parsing message from board ${board.name}:`, err);
        }
      });
      
      ws.on('close', () => {
        console.log(`Connection closed for board ${board.name} (${board.scolia_id})`);
        updateBoardStatus(board.id, 'disconnected');
        
        // Schedule reconnection
        setTimeout(() => {
          connectToBoard(board)
            .catch(err => console.error(`Failed to reconnect to board ${board.name}:`, err));
        }, 5000);
      });
      
      ws.on('error', (err) => {
        console.error(`WebSocket error for board ${board.name}:`, err);
        reject(err);
      });
    } catch (err) {
      console.error(`Failed to connect to board ${board.name}:`, err);
      reject(err);
    }
  });
};

/**
 * Update board status in the database
 */
const updateBoardStatus = (boardId, status) => {
  const db = getDb();
  
  db.run(
    'UPDATE boards SET status = ? WHERE id = ?',
    [status, boardId],
    function(err) {
      if (err) {
        console.error(`Failed to update status for board ${boardId}:`, err);
      }
    }
  );
};

/**
 * Handle incoming messages from Scolia boards
 */
const handleScoliaMessage = async (boardId, message) => {
  // Handle different message types based on Scolia API
  // This implementation will need to be adjusted based on the actual Scolia API
  
  const db = getDb();
  
  switch (message.type) {
    case 'throw':
      // Handle throw data
      if (message.score !== undefined && message.player !== undefined) {
        // Find active game on this board
        db.get(
          "SELECT * FROM games WHERE board_id = ? AND status = 'in_progress'",
          [boardId],
          (err, game) => {
            if (err) {
              console.error(`Error finding active game for board ${boardId}:`, err);
              return;
            }
            
            if (!game) {
              console.log(`No active game found for board ${boardId}`);
              return;
            }
            
            // Map Scolia player ID to our player ID
            const playerId = message.player === 1 ? game.player1_id : game.player2_id;
            
            // Process the throw
            processThrow(game.id, playerId, message.score, message.darts || [])
              .then(updatedGame => {
                console.log(`Processed throw for game ${game.id}, player ${playerId}, score ${message.score}`);
              })
              .catch(err => {
                console.error(`Failed to process throw for game ${game.id}:`, err);
              });
          }
        );
      }
      break;
      
    case 'button_press':
      // Handle button press events if needed
      console.log(`Button press on board ${boardId}: ${message.button}`);
      break;
      
    case 'status':
      // Handle board status updates
      updateBoardStatus(boardId, message.status);
      break;
      
    default:
      console.log(`Unknown message type from board ${boardId}:`, message);
  }
};

/**
 * Send game configuration to a Scolia board
 */
const configureBoard = async (boardId, gameConfig) => {
  const ws = boardConnections.get(boardId);
  
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    throw new Error(`Not connected to board ${boardId}`);
  }
  
  // Configure the board based on Scolia API
  // This will need to be adjusted based on actual API
  const configMessage = {
    type: 'configure',
    game_type: 'x01',
    starting_score: 501,
    players: [
      { id: 1, name: gameConfig.player1Name },
      { id: 2, name: gameConfig.player2Name }
    ],
    options: {
      double_in: false,
      double_out: true
    }
  };
  
  return new Promise((resolve, reject) => {
    try {
      ws.send(JSON.stringify(configMessage));
      resolve();
    } catch (err) {
      reject(err);
    }
  });
};

/**
 * Start a game on the Scolia board
 */
const startGame = async (boardId, gameId) => {
  const ws = boardConnections.get(boardId);
  
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    throw new Error(`Not connected to board ${boardId}`);
  }
  
  // Start the game based on Scolia API
  const startMessage = {
    type: 'start_game',
    game_id: gameId.toString()
  };
  
  return new Promise((resolve, reject) => {
    try {
      ws.send(JSON.stringify(startMessage));
      resolve();
    } catch (err) {
      reject(err);
    }
  });
};

/**
 * Register a new Scolia board
 */
const registerBoard = async (name, scoliaId) => {
  const db = getDb();
  
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO boards (name, scolia_id, status) VALUES (?, ?, "disconnected")',
      [name, scoliaId],
      function(err) {
        if (err) return reject(err);
        
        const boardId = this.lastID;
        
        // Try to connect to the new board
        db.get('SELECT * FROM boards WHERE id = ?', [boardId], (err, board) => {
          if (err) return reject(err);
          
          connectToBoard(board)
            .then(() => resolve(board))
            .catch(err => {
              console.error(`Failed to connect to newly registered board:`, err);
              resolve(board); // Still return the board even if connection fails
            });
        });
      }
    );
  });
};

/**
 * Get all boards with their connection status
 */
const getAllBoards = async () => {
  const db = getDb();
  
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM boards ORDER BY name', [], (err, boards) => {
      if (err) return reject(err);
      
      // Add real-time connection status
      const boardsWithStatus = boards.map(board => {
        const ws = boardConnections.get(board.id);
        const isConnected = ws && ws.readyState === WebSocket.OPEN;
        
        return {
          ...board,
          connected: isConnected
        };
      });
      
      resolve(boardsWithStatus);
    });
  });
};

module.exports = {
  connectToScoliaBoards,
  connectToBoard,
  configureBoard,
  startGame,
  registerBoard,
  getAllBoards
}; 