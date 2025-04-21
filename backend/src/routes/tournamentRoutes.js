const express = require('express');
const router = express.Router();
const { getDb } = require('../models/database');

/**
 * Get all tournaments
 * GET /api/tournaments
 */
router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const { status } = req.query;
    
    let query = 'SELECT * FROM tournaments';
    const params = [];
    
    if (status) {
      query += ' WHERE status = ?';
      params.push(status);
    }
    
    query += ' ORDER BY start_date DESC';
    
    db.all(query, params, (err, tournaments) => {
      if (err) {
        console.error('Error getting tournaments:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      res.json(tournaments);
    });
  } catch (err) {
    console.error('Error in GET /tournaments:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Get a specific tournament by ID
 * GET /api/tournaments/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const db = getDb();
    const tournamentId = req.params.id;
    
    db.get('SELECT * FROM tournaments WHERE id = ?', [tournamentId], (err, tournament) => {
      if (err) {
        console.error('Error getting tournament:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      if (!tournament) {
        return res.status(404).json({ error: 'Tournament not found' });
      }
      
      res.json(tournament);
    });
  } catch (err) {
    console.error('Error in GET /tournaments/:id:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Create a new tournament
 * POST /api/tournaments
 */
router.post('/', async (req, res) => {
  try {
    const db = getDb();
    const { name, startDate, endDate, status = 'pending' } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Tournament name is required' });
    }
    
    db.run(
      'INSERT INTO tournaments (name, start_date, end_date, status, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
      [name, startDate || null, endDate || null, status],
      function(err) {
        if (err) {
          console.error('Error creating tournament:', err);
          return res.status(500).json({ error: 'Database error' });
        }
        
        const tournamentId = this.lastID;
        
        db.get('SELECT * FROM tournaments WHERE id = ?', [tournamentId], (err, tournament) => {
          if (err) {
            console.error('Error getting created tournament:', err);
            return res.status(500).json({ error: 'Database error' });
          }
          
          res.status(201).json(tournament);
        });
      }
    );
  } catch (err) {
    console.error('Error in POST /tournaments:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Update a tournament
 * PUT /api/tournaments/:id
 */
router.put('/:id', async (req, res) => {
  try {
    const db = getDb();
    const tournamentId = req.params.id;
    const { name, startDate, endDate, status } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Tournament name is required' });
    }
    
    db.run(
      'UPDATE tournaments SET name = ?, start_date = ?, end_date = ?, status = ? WHERE id = ?',
      [name, startDate || null, endDate || null, status || 'pending', tournamentId],
      function(err) {
        if (err) {
          console.error('Error updating tournament:', err);
          return res.status(500).json({ error: 'Database error' });
        }
        
        if (this.changes === 0) {
          return res.status(404).json({ error: 'Tournament not found' });
        }
        
        db.get('SELECT * FROM tournaments WHERE id = ?', [tournamentId], (err, tournament) => {
          if (err) {
            console.error('Error getting updated tournament:', err);
            return res.status(500).json({ error: 'Database error' });
          }
          
          res.json(tournament);
        });
      }
    );
  } catch (err) {
    console.error('Error in PUT /tournaments/:id:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Update a tournament's status
 * PATCH /api/tournaments/:id/status
 */
router.patch('/:id/status', async (req, res) => {
  try {
    const db = getDb();
    const tournamentId = req.params.id;
    const { status } = req.body;
    
    if (!status || !['pending', 'active', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Valid status is required' });
    }
    
    db.run(
      'UPDATE tournaments SET status = ? WHERE id = ?',
      [status, tournamentId],
      function(err) {
        if (err) {
          console.error('Error updating tournament status:', err);
          return res.status(500).json({ error: 'Database error' });
        }
        
        if (this.changes === 0) {
          return res.status(404).json({ error: 'Tournament not found' });
        }
        
        res.json({ id: tournamentId, status });
      }
    );
  } catch (err) {
    console.error('Error in PATCH /tournaments/:id/status:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Get all games for a tournament
 * GET /api/tournaments/:id/games
 */
router.get('/:id/games', async (req, res) => {
  try {
    const db = getDb();
    const tournamentId = req.params.id;
    const { status } = req.query;
    
    let query = `
      SELECT g.*, 
        p1.name as player1_name, p2.name as player2_name,
        b.name as board_name
      FROM games g
      JOIN players p1 ON g.player1_id = p1.id
      JOIN players p2 ON g.player2_id = p2.id
      LEFT JOIN boards b ON g.board_id = b.id
      WHERE g.tournament_id = ?
    `;
    
    const params = [tournamentId];
    
    if (status) {
      query += ' AND g.status = ?';
      params.push(status);
    }
    
    query += ' ORDER BY g.created_at DESC';
    
    db.all(query, params, (err, games) => {
      if (err) {
        console.error('Error getting tournament games:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      res.json(games);
    });
  } catch (err) {
    console.error('Error in GET /tournaments/:id/games:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Get tournament statistics
 * GET /api/tournaments/:id/stats
 */
router.get('/:id/stats', async (req, res) => {
  try {
    const db = getDb();
    const tournamentId = req.params.id;
    
    // Get tournament info
    db.get('SELECT * FROM tournaments WHERE id = ?', [tournamentId], (err, tournament) => {
      if (err) {
        console.error('Error getting tournament:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      if (!tournament) {
        return res.status(404).json({ error: 'Tournament not found' });
      }
      
      // Get game stats
      db.get(
        `SELECT 
          COUNT(*) as total_games,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_games,
          SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as active_games
        FROM games
        WHERE tournament_id = ?`,
        [tournamentId],
        (err, gameStats) => {
          if (err) {
            console.error('Error getting game stats:', err);
            return res.status(500).json({ error: 'Database error' });
          }
          
          // Get player stats
          db.all(
            `SELECT 
              p.id, p.name,
              COUNT(DISTINCT g.id) as games_played,
              SUM(CASE WHEN g.player1_id = p.id AND g.player1_legs >= g.legs_required THEN 1
                       WHEN g.player2_id = p.id AND g.player2_legs >= g.legs_required THEN 1
                       ELSE 0 END) as games_won,
              AVG(ps.three_dart_avg) as avg_three_dart_avg,
              MAX(ps.highest_checkout) as highest_checkout
            FROM players p
            JOIN games g ON p.id = g.player1_id OR p.id = g.player2_id
            LEFT JOIN player_stats ps ON p.id = ps.player_id AND g.id = ps.game_id
            WHERE g.tournament_id = ? AND g.status = 'completed'
            GROUP BY p.id
            ORDER BY games_won DESC, avg_three_dart_avg DESC`,
            [tournamentId],
            (err, playerStats) => {
              if (err) {
                console.error('Error getting player stats:', err);
                return res.status(500).json({ error: 'Database error' });
              }
              
              // Calculate highest averages, checkouts, etc.
              db.all(
                `SELECT 
                  p.id, p.name,
                  MAX(ps.three_dart_avg) as highest_avg,
                  MAX(ps.highest_checkout) as highest_checkout
                FROM player_stats ps
                JOIN players p ON ps.player_id = p.id
                JOIN games g ON ps.game_id = g.id
                WHERE g.tournament_id = ?
                GROUP BY p.id`,
                [tournamentId],
                (err, highlightStats) => {
                  if (err) {
                    console.error('Error getting highlight stats:', err);
                    return res.status(500).json({ error: 'Database error' });
                  }
                  
                  res.json({
                    tournament,
                    gameStats,
                    playerStats,
                    highlightStats
                  });
                }
              );
            }
          );
        }
      );
    });
  } catch (err) {
    console.error('Error in GET /tournaments/:id/stats:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router; 