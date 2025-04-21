const express = require('express');
const router = express.Router();
const { getDb } = require('../models/database');
const scoringService = require('../services/scoringService');
const scoliaService = require('../services/scoliaService');
const { logGameAction } = require('../utils/gameLogger');
const summaryService = require('../services/summaryService');

/**
 * Get all games with optional filtering
 * GET /api/games?status=in_progress&tournamentId=1
 */
router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const { status, tournamentId, boardId } = req.query;
    
    let query = 'SELECT g.*, p1.name as player1_name, p2.name as player2_name, b.name as board_name ' +
                'FROM games g ' +
                'JOIN players p1 ON g.player1_id = p1.id ' +
                'JOIN players p2 ON g.player2_id = p2.id ' +
                'LEFT JOIN boards b ON g.board_id = b.id';
                
    const queryParams = [];
    const conditions = [];
    
    if (status) {
      conditions.push('g.status = ?');
      queryParams.push(status);
    }
    
    if (tournamentId) {
      conditions.push('g.tournament_id = ?');
      queryParams.push(tournamentId);
    }
    
    if (boardId) {
      conditions.push('g.board_id = ?');
      queryParams.push(boardId);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' ORDER BY g.id DESC';
    
    db.all(query, queryParams, (err, games) => {
      if (err) {
        console.error('Error getting games:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      res.json(games);
    });
  } catch (err) {
    console.error('Error in GET /games:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Get a specific game by ID
 * GET /api/games/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const db = getDb();
    const gameId = req.params.id;
    
    db.get(
      'SELECT g.*, p1.name as player1_name, p2.name as player2_name, b.name as board_name ' +
      'FROM games g ' +
      'JOIN players p1 ON g.player1_id = p1.id ' +
      'JOIN players p2 ON g.player2_id = p2.id ' +
      'LEFT JOIN boards b ON g.board_id = b.id ' +
      'WHERE g.id = ?',
      [gameId],
      (err, game) => {
        if (err) {
          console.error('Error getting game:', err);
          return res.status(500).json({ error: 'Database error' });
        }
        
        if (!game) {
          return res.status(404).json({ error: 'Game not found' });
        }
        
        // Get the current leg if game is in progress
        if (game.status === 'in_progress') {
          db.get(
            'SELECT * FROM legs WHERE game_id = ? AND winner_id IS NULL',
            [gameId],
            (err, currentLeg) => {
              if (err) {
                console.error('Error getting current leg:', err);
                return res.status(500).json({ error: 'Database error' });
              }
              
              // Get the throws for the current leg
              db.all(
                'SELECT * FROM throws WHERE leg_id = ? ORDER BY id',
                [currentLeg ? currentLeg.id : null],
                (err, throws) => {
                  if (err) {
                    console.error('Error getting throws:', err);
                    return res.status(500).json({ error: 'Database error' });
                  }
                  
                  res.json({
                    ...game,
                    currentLeg,
                    throws
                  });
                }
              );
            }
          );
        } else {
          // Game is not in progress, just return basic info
          res.json(game);
        }
      }
    );
  } catch (err) {
    console.error('Error in GET /games/:id:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Create a new game
 * POST /api/games
 */
router.post('/', async (req, res) => {
  try {
    const db = getDb();
    const { 
      player1Id, 
      player2Id, 
      boardId, 
      tournamentId, 
      legsRequired = 3
    } = req.body;
    
    // Validate required fields
    if (!player1Id || !player2Id) {
      return res.status(400).json({ error: 'Player IDs are required' });
    }
    
    // Start a transaction
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      
      // Create the game
      db.run(
        `INSERT INTO games (
          player1_id, player2_id, board_id, tournament_id, 
          legs_required, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [player1Id, player2Id, boardId || null, tournamentId || null, legsRequired],
        function(err) {
          if (err) {
            db.run('ROLLBACK');
            console.error('Error creating game:', err);
            return res.status(500).json({ error: 'Database error' });
          }
          
          const gameId = this.lastID;
          
          // Log the game creation
          logGameAction(
            db, 
            gameId, 
            'game_created', 
            `Game created with players ${player1Id} and ${player2Id}, ${legsRequired} legs required`
          ).then(() => {
            db.run('COMMIT');
            
            // Get the created game
            db.get('SELECT * FROM games WHERE id = ?', [gameId], (err, game) => {
              if (err) {
                console.error('Error getting created game:', err);
                return res.status(500).json({ error: 'Database error' });
              }
              
              res.status(201).json(game);
            });
          }).catch(err => {
            db.run('ROLLBACK');
            console.error('Error logging game creation:', err);
            return res.status(500).json({ error: 'Database error' });
          });
        }
      );
    });
  } catch (err) {
    console.error('Error in POST /games:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Update a game's status
 * PATCH /api/games/:id/status
 */
router.patch('/:id/status', async (req, res) => {
  try {
    const db = getDb();
    const gameId = req.params.id;
    const { status } = req.body;
    
    if (!status || !['pending', 'warmup', 'bull', 'in_progress', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Valid status is required' });
    }
    
    db.run(
      'UPDATE games SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status, gameId],
      function(err) {
        if (err) {
          console.error('Error updating game status:', err);
          return res.status(500).json({ error: 'Database error' });
        }
        
        if (this.changes === 0) {
          return res.status(404).json({ error: 'Game not found' });
        }
        
        // Log the status change
        logGameAction(
          db,
          gameId,
          'status_changed',
          `Game status changed to ${status}`
        ).then(() => {
          res.json({ id: gameId, status });
        }).catch(err => {
          console.error('Error logging status change:', err);
          res.status(500).json({ error: 'Error logging status change' });
        });
      }
    );
  } catch (err) {
    console.error('Error in PATCH /games/:id/status:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Assign a board to a game
 * PATCH /api/games/:id/board
 */
router.patch('/:id/board', async (req, res) => {
  try {
    const db = getDb();
    const gameId = req.params.id;
    const { boardId } = req.body;
    
    if (!boardId) {
      return res.status(400).json({ error: 'Board ID is required' });
    }
    
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      
      // Check if the board is available
      db.get('SELECT * FROM boards WHERE id = ?', [boardId], (err, board) => {
        if (err) {
          db.run('ROLLBACK');
          console.error('Error checking board:', err);
          return res.status(500).json({ error: 'Database error' });
        }
        
        if (!board) {
          db.run('ROLLBACK');
          return res.status(404).json({ error: 'Board not found' });
        }
        
        // Update the game with the board ID
        db.run(
          'UPDATE games SET board_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [boardId, gameId],
          function(err) {
            if (err) {
              db.run('ROLLBACK');
              console.error('Error assigning board to game:', err);
              return res.status(500).json({ error: 'Database error' });
            }
            
            if (this.changes === 0) {
              db.run('ROLLBACK');
              return res.status(404).json({ error: 'Game not found' });
            }
            
            // Log the board assignment
            logGameAction(
              db,
              gameId,
              'board_assigned',
              `Board ${boardId} (${board.name}) assigned to game`
            ).then(() => {
              db.run('COMMIT');
              
              // Get the updated game
              db.get('SELECT * FROM games WHERE id = ?', [gameId], (err, game) => {
                if (err) {
                  console.error('Error getting updated game:', err);
                  return res.status(500).json({ error: 'Database error' });
                }
                
                res.json(game);
              });
            }).catch(err => {
              db.run('ROLLBACK');
              console.error('Error logging board assignment:', err);
              return res.status(500).json({ error: 'Database error' });
            });
          }
        );
      });
    });
  } catch (err) {
    console.error('Error in PATCH /games/:id/board:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Get player statistics for a game
 * GET /api/games/:id/stats/:playerId
 */
router.get('/:id/stats/:playerId', async (req, res) => {
  try {
    const gameId = req.params.id;
    const playerId = req.params.playerId;
    
    // Get the player stats
    const stats = await scoringService.getPlayerStats(gameId, playerId);
    res.json(stats);
  } catch (err) {
    console.error('Error getting player stats:', err);
    res.status(500).json({ error: 'Error getting player stats' });
  }
});

/**
 * Get game logs
 * GET /api/games/:id/logs
 */
router.get('/:id/logs', async (req, res) => {
  try {
    const db = getDb();
    const gameId = req.params.id;
    const limit = req.query.limit ? parseInt(req.query.limit) : 50;
    
    db.all(
      'SELECT * FROM game_logs WHERE game_id = ? ORDER BY id DESC LIMIT ?',
      [gameId, limit],
      (err, logs) => {
        if (err) {
          console.error('Error getting game logs:', err);
          return res.status(500).json({ error: 'Database error' });
        }
        
        res.json(logs);
      }
    );
  } catch (err) {
    console.error('Error in GET /games/:id/logs:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Create a manual throw (for override or manual input)
 * POST /api/games/:id/throws
 */
router.post('/:id/throws', async (req, res) => {
  try {
    const gameId = req.params.id;
    const { playerId, score, darts, adminId } = req.body;
    
    if (!playerId || !score || !darts) {
      return res.status(400).json({ error: 'Player ID, score, and darts are required' });
    }
    
    // Process the throw
    const updatedGame = await scoringService.processThrow(gameId, playerId, score, darts);
    
    // Log the manual throw
    await logGameAction(
      getDb(),
      gameId,
      'manual_throw',
      `Manual throw recorded for player ${playerId}: score=${score}, darts=${JSON.stringify(darts)}`,
      adminId || 'admin'
    );
    
    res.json(updatedGame);
  } catch (err) {
    console.error('Error processing manual throw:', err);
    res.status(500).json({ error: err.message || 'Error processing throw' });
  }
});

/**
 * Get match summary
 * GET /api/games/:id/summary
 */
router.get('/:id/summary', async (req, res) => {
  try {
    const gameId = req.params.id;
    
    // Try to get existing summaries
    let summaries = await summaryService.getMatchSummaries(gameId);
    
    // If no summaries exist yet, generate them
    if (!summaries || summaries.length === 0) {
      summaries = await summaryService.generateMatchSummaries(gameId);
    }
    
    res.json(summaries);
  } catch (err) {
    console.error('Error getting match summary:', err);
    res.status(500).json({ error: err.message || 'Error getting match summary' });
  }
});

/**
 * Generate match summary (even if it already exists)
 * POST /api/games/:id/summary
 */
router.post('/:id/summary', async (req, res) => {
  try {
    const gameId = req.params.id;
    
    // Generate and save summaries for all players
    const summaries = await summaryService.generateMatchSummaries(gameId);
    
    res.json(summaries);
  } catch (err) {
    console.error('Error generating match summary:', err);
    res.status(500).json({ error: err.message || 'Error generating match summary' });
  }
});

/**
 * Get player statistics across multiple matches
 * GET /api/games/player/:playerId/stats
 */
router.get('/player/:playerId/stats', async (req, res) => {
  try {
    const playerId = req.params.playerId;
    const limit = req.query.limit ? parseInt(req.query.limit) : 10;
    
    const stats = await summaryService.getPlayerStats(playerId, limit);
    
    res.json(stats);
  } catch (err) {
    console.error('Error getting player stats:', err);
    res.status(500).json({ error: err.message || 'Error getting player stats' });
  }
});

module.exports = router; 