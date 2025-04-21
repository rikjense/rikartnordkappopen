const express = require('express');
const router = express.Router();
const { getDb } = require('../models/database');

/**
 * Get all players
 * GET /api/players
 */
router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const { search } = req.query;
    
    let query = 'SELECT * FROM players';
    const params = [];
    
    if (search) {
      query += ' WHERE name LIKE ? OR nickname LIKE ?';
      params.push(`%${search}%`, `%${search}%`);
    }
    
    query += ' ORDER BY name';
    
    db.all(query, params, (err, players) => {
      if (err) {
        console.error('Error getting players:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      res.json(players);
    });
  } catch (err) {
    console.error('Error in GET /players:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Get a specific player by ID
 * GET /api/players/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const db = getDb();
    const playerId = req.params.id;
    
    db.get('SELECT * FROM players WHERE id = ?', [playerId], (err, player) => {
      if (err) {
        console.error('Error getting player:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      if (!player) {
        return res.status(404).json({ error: 'Player not found' });
      }
      
      res.json(player);
    });
  } catch (err) {
    console.error('Error in GET /players/:id:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Create a new player
 * POST /api/players
 */
router.post('/', async (req, res) => {
  try {
    const db = getDb();
    const { name, nickname } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }
    
    db.run(
      'INSERT INTO players (name, nickname, created_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
      [name, nickname || null],
      function(err) {
        if (err) {
          console.error('Error creating player:', err);
          return res.status(500).json({ error: 'Database error' });
        }
        
        const playerId = this.lastID;
        
        db.get('SELECT * FROM players WHERE id = ?', [playerId], (err, player) => {
          if (err) {
            console.error('Error getting created player:', err);
            return res.status(500).json({ error: 'Database error' });
          }
          
          res.status(201).json(player);
        });
      }
    );
  } catch (err) {
    console.error('Error in POST /players:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Update a player
 * PUT /api/players/:id
 */
router.put('/:id', async (req, res) => {
  try {
    const db = getDb();
    const playerId = req.params.id;
    const { name, nickname } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }
    
    db.run(
      'UPDATE players SET name = ?, nickname = ? WHERE id = ?',
      [name, nickname || null, playerId],
      function(err) {
        if (err) {
          console.error('Error updating player:', err);
          return res.status(500).json({ error: 'Database error' });
        }
        
        if (this.changes === 0) {
          return res.status(404).json({ error: 'Player not found' });
        }
        
        db.get('SELECT * FROM players WHERE id = ?', [playerId], (err, player) => {
          if (err) {
            console.error('Error getting updated player:', err);
            return res.status(500).json({ error: 'Database error' });
          }
          
          res.json(player);
        });
      }
    );
  } catch (err) {
    console.error('Error in PUT /players/:id:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Get player statistics across all games or for a specific tournament
 * GET /api/players/:id/stats?tournamentId=1
 */
router.get('/:id/stats', async (req, res) => {
  try {
    const db = getDb();
    const playerId = req.params.id;
    const { tournamentId } = req.query;
    
    let query = `
      SELECT 
        p.id, p.name, p.nickname,
        COUNT(DISTINCT g.id) as games_played,
        SUM(CASE WHEN g.player1_id = ? AND g.player1_legs >= g.legs_required THEN 1
                 WHEN g.player2_id = ? AND g.player2_legs >= g.legs_required THEN 1
                 ELSE 0 END) as games_won,
        SUM(CASE WHEN g.player1_id = ? THEN g.player1_legs
                 WHEN g.player2_id = ? THEN g.player2_legs
                 ELSE 0 END) as legs_won,
        AVG(ps.three_dart_avg) as avg_three_dart_avg,
        SUM(ps.checkout_successes) as checkouts,
        SUM(ps.checkout_attempts) as checkout_attempts,
        MAX(ps.highest_checkout) as highest_checkout,
        AVG(ps.darts_per_leg) as avg_darts_per_leg
      FROM players p
      JOIN games g ON p.id = g.player1_id OR p.id = g.player2_id
      LEFT JOIN player_stats ps ON p.id = ps.player_id AND g.id = ps.game_id
      WHERE p.id = ?
    `;
    
    const params = [playerId, playerId, playerId, playerId, playerId];
    
    if (tournamentId) {
      query += ' AND g.tournament_id = ?';
      params.push(tournamentId);
    }
    
    query += ' GROUP BY p.id';
    
    db.get(query, params, (err, stats) => {
      if (err) {
        console.error('Error getting player stats:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      if (!stats) {
        return res.status(404).json({ error: 'Player not found or no stats available' });
      }
      
      // Calculate checkout percentage
      const checkoutPercentage = stats.checkout_attempts > 0 ? 
        (stats.checkouts / stats.checkout_attempts) * 100 : 0;
      
      // Calculate win percentage
      const winPercentage = stats.games_played > 0 ? 
        (stats.games_won / stats.games_played) * 100 : 0;
      
      res.json({
        ...stats,
        checkout_percentage: checkoutPercentage,
        win_percentage: winPercentage
      });
    });
  } catch (err) {
    console.error('Error in GET /players/:id/stats:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Get a player's recent games
 * GET /api/players/:id/games?limit=5
 */
router.get('/:id/games', async (req, res) => {
  try {
    const db = getDb();
    const playerId = req.params.id;
    const limit = req.query.limit ? parseInt(req.query.limit) : 10;
    
    const query = `
      SELECT g.*, 
        p1.name as player1_name, p2.name as player2_name,
        t.name as tournament_name, b.name as board_name
      FROM games g
      JOIN players p1 ON g.player1_id = p1.id
      JOIN players p2 ON g.player2_id = p2.id
      LEFT JOIN tournaments t ON g.tournament_id = t.id
      LEFT JOIN boards b ON g.board_id = b.id
      WHERE g.player1_id = ? OR g.player2_id = ?
      ORDER BY g.updated_at DESC
      LIMIT ?
    `;
    
    db.all(query, [playerId, playerId, limit], (err, games) => {
      if (err) {
        console.error('Error getting player games:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      res.json(games);
    });
  } catch (err) {
    console.error('Error in GET /players/:id/games:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router; 