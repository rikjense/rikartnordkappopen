const { getDb } = require('../models/database');
const { logGameAction } = require('../utils/gameLogger');

/**
 * Process a throw in the current game
 * @param {Object} gameState - Current game state
 * @param {number} playerId - ID of the player making the throw
 * @param {number} score - Score for the current throw (3 darts)
 * @param {Array} darts - Array of dart notation for each dart [dart1, dart2, dart3]
 * @returns {Object} Updated game state
 */
const processThrow = async (gameId, playerId, score, darts) => {
  const db = getDb();
  let game, currentLeg;
  
  // Start a transaction
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      
      // Get current game state
      db.get('SELECT * FROM games WHERE id = ?', [gameId], (err, row) => {
        if (err) {
          db.run('ROLLBACK');
          return reject(err);
        }
        
        if (!row) {
          db.run('ROLLBACK');
          return reject(new Error('Game not found'));
        }
        
        game = row;
        
        // Check if the game is in progress
        if (game.status !== 'in_progress') {
          db.run('ROLLBACK');
          return reject(new Error('Game is not in progress'));
        }
        
        // Check if it's the player's turn
        if (game.current_player !== playerId) {
          db.run('ROLLBACK');
          return reject(new Error('Not the player\'s turn'));
        }
        
        // Get current leg
        db.get(
          'SELECT * FROM legs WHERE game_id = ? AND winner_id IS NULL', 
          [gameId], 
          (err, legRow) => {
            if (err) {
              db.run('ROLLBACK');
              return reject(err);
            }
            
            if (!legRow) {
              db.run('ROLLBACK');
              return reject(new Error('No active leg found'));
            }
            
            currentLeg = legRow;
            
            // Determine which player and current score
            const isPlayer1 = playerId === game.player1_id;
            const currentScore = isPlayer1 ? game.current_leg_player1_score : game.current_leg_player2_score;
            const dartsThrown = isPlayer1 ? game.current_leg_player1_darts : game.current_leg_player2_darts;
            
            // Calculate new score and check if it's valid
            const newScore = currentScore - score;
            
            // Check if it's a bust (less than 0 or 1)
            const isBust = newScore < 0 || newScore === 1;
            
            // If it's a bust, score doesn't change but we log the throw
            const finalScore = isBust ? currentScore : newScore;
            const dartsThrownAfter = dartsThrown + darts.filter(d => d).length;
            
            // Record the throw
            db.run(
              `INSERT INTO throws 
                (leg_id, player_id, score, dart1, dart2, dart3, remaining, is_bust) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                currentLeg.id, 
                playerId, 
                score, 
                darts[0] || null, 
                darts[1] || null, 
                darts[2] || null, 
                finalScore,
                isBust ? 1 : 0
              ],
              function(err) {
                if (err) {
                  db.run('ROLLBACK');
                  return reject(err);
                }
                
                // Update the current leg score and darts thrown
                let updateQuery, updateParams;
                
                if (isPlayer1) {
                  updateQuery = `
                    UPDATE games 
                    SET current_leg_player1_score = ?, 
                        current_leg_player1_darts = ?,
                        current_player = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                  `;
                  updateParams = [
                    finalScore, 
                    dartsThrownAfter, 
                    game.player2_id,  // Switch to the other player
                    gameId
                  ];
                } else {
                  updateQuery = `
                    UPDATE games 
                    SET current_leg_player2_score = ?, 
                        current_leg_player2_darts = ?,
                        current_player = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                  `;
                  updateParams = [
                    finalScore, 
                    dartsThrownAfter, 
                    game.player1_id,  // Switch to the other player
                    gameId
                  ];
                }
                
                // If checkout (score = 0), also update leg and possibly game
                if (newScore === 0) {
                  handleCheckout(db, game, currentLeg, playerId, dartsThrownAfter)
                    .then(updatedGame => {
                      db.run('COMMIT');
                      resolve(updatedGame);
                    })
                    .catch(err => {
                      db.run('ROLLBACK');
                      reject(err);
                    });
                } else {
                  // Just update the current score and switch players
                  db.run(updateQuery, updateParams, function(err) {
                    if (err) {
                      db.run('ROLLBACK');
                      return reject(err);
                    }
                    
                    // If bust, log it
                    if (isBust) {
                      logGameAction(
                        db, 
                        gameId, 
                        'bust', 
                        `Player busted with score ${score}. Remaining: ${currentScore}`
                      );
                    }
                    
                    // Get updated game state
                    db.get('SELECT * FROM games WHERE id = ?', [gameId], (err, updatedGame) => {
                      if (err) {
                        db.run('ROLLBACK');
                        return reject(err);
                      }
                      
                      db.run('COMMIT');
                      resolve(updatedGame);
                    });
                  });
                }
              }
            );
          }
        );
      });
    });
  });
};

/**
 * Handle checkout (player reached exactly 0)
 */
const handleCheckout = async (db, game, leg, playerId, dartsThrownTotal) => {
  return new Promise((resolve, reject) => {
    const isPlayer1 = playerId === game.player1_id;
    const checkoutScore = isPlayer1 ? 
      game.current_leg_player1_score : 
      game.current_leg_player2_score;
      
    // Record checkout in stats if it's a valid checkout (≤170)
    if (checkoutScore <= 170) {
      db.run(
        `UPDATE player_stats
         SET checkout_attempts = checkout_attempts + 1,
             checkout_successes = checkout_successes + 1,
             highest_checkout = CASE WHEN ? > highest_checkout THEN ? ELSE highest_checkout END,
             updated_at = CURRENT_TIMESTAMP
         WHERE player_id = ? AND game_id = ?`,
        [checkoutScore, checkoutScore, playerId, game.id],
        function(err) {
          if (err) {
            console.error('Error updating player stats:', err);
            // Continue anyway, this is not critical
          }
        }
      );
    }
    
    // Update leg as completed
    db.run(
      `UPDATE legs
       SET winner_id = ?,
           ${isPlayer1 ? 'player1_darts' : 'player2_darts'} = ?,
           completed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [playerId, dartsThrownTotal, leg.id],
      function(err) {
        if (err) return reject(err);
        
        // Increment leg count for player
        const legField = isPlayer1 ? 'player1_legs' : 'player2_legs';
        const newLegCount = isPlayer1 ? game.player1_legs + 1 : game.player2_legs + 1;
        
        // Check if the player has won the match
        const gameWon = newLegCount >= game.legs_required;
        
        // Update game state
        let updateSql, updateParams;
        
        if (gameWon) {
          // Game is complete
          updateSql = `
            UPDATE games
            SET ${legField} = ${legField} + 1,
                status = 'completed',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `;
          updateParams = [game.id];
          
          // Log game completion
          logGameAction(
            db, 
            game.id, 
            'game_completed', 
            `Game won by player ${playerId} with score ${newLegCount}-${isPlayer1 ? game.player2_legs : game.player1_legs}`
          );
        } else {
          // Game continues with a new leg
          updateSql = `
            UPDATE games
            SET ${legField} = ${legField} + 1,
                current_leg_player1_score = 501,
                current_leg_player2_score = 501,
                current_leg_player1_darts = 0,
                current_leg_player2_darts = 0,
                current_leg_starter = ?,
                current_player = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `;
          
          // Alternate the starter of each leg
          const newStarter = game.current_leg_starter === game.player1_id ? 
            game.player2_id : game.player1_id;
            
          updateParams = [newStarter, newStarter, game.id];
          
          // Create a new leg
          db.run(
            `INSERT INTO legs (
              game_id, 
              leg_number, 
              starter_id, 
              player1_score, 
              player2_score
             ) VALUES (?, ?, ?, 501, 501)`,
            [game.id, leg.leg_number + 1, newStarter],
            function(err) {
              if (err) return reject(err);
              
              // Log leg completion
              logGameAction(
                db, 
                game.id, 
                'leg_completed', 
                `Leg ${leg.leg_number} won by player ${playerId}. New leg starting with player ${newStarter}`
              );
            }
          );
        }
        
        db.run(updateSql, updateParams, function(err) {
          if (err) return reject(err);
          
          // Get updated game state
          db.get('SELECT * FROM games WHERE id = ?', [game.id], (err, updatedGame) => {
            if (err) return reject(err);
            resolve(updatedGame);
          });
        });
      }
    );
  });
};

/**
 * Start a warmup period for a game
 */
const startWarmup = async (gameId) => {
  const db = getDb();
  
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM games WHERE id = ?', [gameId], (err, game) => {
      if (err) return reject(err);
      if (!game) return reject(new Error('Game not found'));
      
      if (game.status !== 'pending') {
        return reject(new Error('Game must be in pending state to start warmup'));
      }
      
      db.run(
        `UPDATE games 
         SET status = 'warmup', updated_at = CURRENT_TIMESTAMP 
         WHERE id = ?`,
        [gameId],
        function(err) {
          if (err) return reject(err);
          
          logGameAction(db, gameId, 'warmup_started', 'Warmup period started');
          resolve({ ...game, status: 'warmup' });
        }
      );
    });
  });
};

/**
 * Complete the warmup period
 */
const completeWarmup = async (gameId) => {
  const db = getDb();
  
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM games WHERE id = ?', [gameId], (err, game) => {
      if (err) return reject(err);
      if (!game) return reject(new Error('Game not found'));
      
      if (game.status !== 'warmup') {
        return reject(new Error('Game must be in warmup state'));
      }
      
      db.run(
        `UPDATE games 
         SET warmup_complete = 1, status = 'bull', updated_at = CURRENT_TIMESTAMP 
         WHERE id = ?`,
        [gameId],
        function(err) {
          if (err) return reject(err);
          
          logGameAction(db, gameId, 'warmup_completed', 'Warmup period completed, bull throw next');
          resolve({ ...game, warmup_complete: 1, status: 'bull' });
        }
      );
    });
  });
};

/**
 * Set the winner of the bull throw
 */
const setBullWinner = async (gameId, winnerId) => {
  const db = getDb();
  
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM games WHERE id = ?', [gameId], (err, game) => {
      if (err) return reject(err);
      if (!game) return reject(new Error('Game not found'));
      
      if (game.status !== 'bull') {
        return reject(new Error('Game must be in bull throw state'));
      }
      
      // Validate that winnerId is one of the players
      if (winnerId !== game.player1_id && winnerId !== game.player2_id) {
        return reject(new Error('Invalid winner ID'));
      }
      
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        // Set the bull winner and start the game
        db.run(
          `UPDATE games 
           SET bull_complete = 1, 
               status = 'in_progress', 
               current_leg_starter = ?, 
               current_player = ?,
               updated_at = CURRENT_TIMESTAMP 
           WHERE id = ?`,
          [winnerId, winnerId, gameId],
          function(err) {
            if (err) {
              db.run('ROLLBACK');
              return reject(err);
            }
            
            // Create the first leg
            db.run(
              `INSERT INTO legs (
                game_id, 
                leg_number, 
                starter_id, 
                player1_score, 
                player2_score
               ) VALUES (?, 1, ?, 501, 501)`,
              [gameId, winnerId],
              function(err) {
                if (err) {
                  db.run('ROLLBACK');
                  return reject(err);
                }
                
                logGameAction(
                  db, 
                  gameId, 
                  'game_started', 
                  `Bull throw won by player ${winnerId}, game started`
                );
                
                db.run('COMMIT');
                
                // Get updated game state
                db.get('SELECT * FROM games WHERE id = ?', [gameId], (err, updatedGame) => {
                  if (err) return reject(err);
                  resolve(updatedGame);
                });
              }
            );
          }
        );
      });
    });
  });
};

/**
 * Manually override a throw
 */
const overrideThrow = async (gameId, throwId, newScore, newDarts, adminId) => {
  const db = getDb();
  
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      
      // Get the throw to override
      db.get('SELECT * FROM throws WHERE id = ?', [throwId], (err, throwData) => {
        if (err) {
          db.run('ROLLBACK');
          return reject(err);
        }
        
        if (!throwData) {
          db.run('ROLLBACK');
          return reject(new Error('Throw not found'));
        }
        
        // Get the game state
        db.get('SELECT * FROM games WHERE id = ?', [gameId], (err, game) => {
          if (err) {
            db.run('ROLLBACK');
            return reject(err);
          }
          
          if (!game) {
            db.run('ROLLBACK');
            return reject(new Error('Game not found'));
          }
          
          // This is a complex operation that will require recalculating the game state
          // Log the override
          logGameAction(
            db, 
            gameId, 
            'throw_override', 
            `Throw ${throwId} overridden: ${throwData.score} to ${newScore} by admin ${adminId}`
          );
          
          // Update the throw
          db.run(
            `UPDATE throws 
             SET score = ?, dart1 = ?, dart2 = ?, dart3 = ?
             WHERE id = ?`,
            [newScore, newDarts[0] || null, newDarts[1] || null, newDarts[2] || null, throwId],
            function(err) {
              if (err) {
                db.run('ROLLBACK');
                return reject(err);
              }
              
              // Recalculate the game state - this is complex and might need to adjust
              // remaining scores, leg winners, game status, etc.
              recalculateGameState(db, gameId)
                .then(() => {
                  db.run('COMMIT');
                  
                  // Get updated game state
                  db.get('SELECT * FROM games WHERE id = ?', [gameId], (err, updatedGame) => {
                    if (err) return reject(err);
                    resolve(updatedGame);
                  });
                })
                .catch(err => {
                  db.run('ROLLBACK');
                  reject(err);
                });
            }
          );
        });
      });
    });
  });
};

/**
 * Recalculate the entire game state after an override
 */
const recalculateGameState = async (db, gameId) => {
  // This is a complex operation that would recalculate scores for each leg,
  // determine leg winners, and set the current game state
  // Implementation details would depend on specific requirements
  return new Promise((resolve, reject) => {
    // For brevity, this is a placeholder
    // In a real implementation, this would process all throws in order
    // and recalculate the game state accurately
    resolve();
  });
};

/**
 * Get player statistics for a game
 */
const getPlayerStats = async (gameId, playerId) => {
  const db = getDb();
  
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM player_stats WHERE game_id = ? AND player_id = ?',
      [gameId, playerId],
      (err, stats) => {
        if (err) return reject(err);
        
        if (stats) {
          resolve(stats);
        } else {
          // Calculate stats on demand if not cached
          calculatePlayerStats(gameId, playerId)
            .then(resolve)
            .catch(reject);
        }
      }
    );
  });
};

/**
 * Calculate and cache player statistics
 */
const calculatePlayerStats = async (gameId, playerId) => {
  const db = getDb();
  
  return new Promise((resolve, reject) => {
    // Get all throws for the player in this game
    db.all(
      `SELECT t.* 
       FROM throws t
       JOIN legs l ON t.leg_id = l.id
       WHERE l.game_id = ? AND t.player_id = ?
       ORDER BY t.id`,
      [gameId, playerId],
      (err, throws) => {
        if (err) return reject(err);
        
        // Calculate 3-dart average
        const totalScore = throws.reduce((sum, t) => sum + (t.is_bust ? 0 : t.score), 0);
        const totalDarts = throws.reduce((sum, t) => {
          const dartCount = [t.dart1, t.dart2, t.dart3].filter(d => d).length;
          return sum + dartCount;
        }, 0);
        
        const threeDartAvg = totalDarts > 0 ? (totalScore / totalDarts) * 3 : 0;
        
        // Calculate checkout stats
        const checkoutAttempts = throws.filter(t => t.remaining <= 170 && t.remaining > 0).length;
        const checkoutSuccesses = throws.filter(t => t.remaining === 0).length;
        
        // Calculate highest checkout
        const checkouts = throws.filter(t => t.remaining === 0);
        let highestCheckout = 0;
        
        if (checkouts.length > 0) {
          // For each checkout, find the previous throw to get the checkout value
          db.all(
            `SELECT t1.*, t2.remaining as checkout_value
             FROM throws t1
             JOIN throws t2 ON t2.id = (
               SELECT MAX(id) FROM throws 
               WHERE leg_id = t1.leg_id AND player_id = t1.player_id AND id < t1.id
             )
             WHERE t1.leg_id IN (SELECT id FROM legs WHERE game_id = ?)
             AND t1.player_id = ? AND t1.remaining = 0`,
            [gameId, playerId],
            (err, checkoutRows) => {
              if (err) return reject(err);
              
              highestCheckout = checkoutRows.length > 0 ?
                Math.max(...checkoutRows.map(r => r.checkout_value)) : 0;
              
              // Get darts per leg
              db.all(
                `SELECT winner_id, player1_darts, player2_darts
                 FROM legs
                 WHERE game_id = ? AND winner_id IS NOT NULL`,
                [gameId],
                (err, legs) => {
                  if (err) return reject(err);
                  
                  const completedLegsForPlayer = legs.filter(l => l.winner_id === playerId);
                  const totalDartsForLegs = completedLegsForPlayer.reduce((sum, l) => {
                    return sum + (l.winner_id === playerId ? 
                      (playerId === l.player1_id ? l.player1_darts : l.player2_darts) : 0);
                  }, 0);
                  
                  const dartsPerLeg = completedLegsForPlayer.length > 0 ?
                    totalDartsForLegs / completedLegsForPlayer.length : 0;
                  
                  // Update or insert the stats
                  db.run(
                    `INSERT INTO player_stats (
                      player_id, game_id, three_dart_avg, 
                      checkout_attempts, checkout_successes, 
                      highest_checkout, darts_per_leg
                     ) VALUES (?, ?, ?, ?, ?, ?, ?)
                     ON CONFLICT(player_id, game_id) DO UPDATE SET
                       three_dart_avg = excluded.three_dart_avg,
                       checkout_attempts = excluded.checkout_attempts,
                       checkout_successes = excluded.checkout_successes,
                       highest_checkout = excluded.highest_checkout,
                       darts_per_leg = excluded.darts_per_leg,
                       updated_at = CURRENT_TIMESTAMP`,
                    [
                      playerId, gameId, threeDartAvg, 
                      checkoutAttempts, checkoutSuccesses, 
                      highestCheckout, dartsPerLeg
                    ],
                    function(err) {
                      if (err) return reject(err);
                      
                      resolve({
                        player_id: playerId,
                        game_id: gameId,
                        three_dart_avg: threeDartAvg,
                        checkout_attempts: checkoutAttempts,
                        checkout_successes: checkoutSuccesses,
                        checkout_percentage: checkoutAttempts > 0 ? 
                          (checkoutSuccesses / checkoutAttempts) * 100 : 0,
                        highest_checkout: highestCheckout,
                        darts_per_leg: dartsPerLeg
                      });
                    }
                  );
                }
              );
            }
          );
        } else {
          // No checkouts, so we can resolve with basic stats
          resolve({
            player_id: playerId,
            game_id: gameId,
            three_dart_avg: threeDartAvg,
            checkout_attempts: checkoutAttempts,
            checkout_successes: checkoutAttempts,
            checkout_percentage: 0,
            highest_checkout: 0,
            darts_per_leg: 0
          });
        }
      }
    );
  });
};

/**
 * Auto-save all active games
 */
const autoSaveAllGames = async () => {
  const db = getDb();
  
  return new Promise((resolve, reject) => {
    db.all(
      "SELECT id FROM games WHERE status = 'in_progress'",
      [],
      (err, games) => {
        if (err) return reject(err);
        
        // For each active game, update the timestamp
        const promises = games.map(game => {
          return new Promise((res, rej) => {
            db.run(
              "UPDATE games SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
              [game.id],
              function(err) {
                if (err) return rej(err);
                res();
              }
            );
          });
        });
        
        Promise.all(promises)
          .then(() => resolve(games.length))
          .catch(reject);
      }
    );
  });
};

module.exports = {
  processThrow,
  startWarmup,
  completeWarmup,
  setBullWinner,
  overrideThrow,
  getPlayerStats,
  calculatePlayerStats,
  autoSaveAllGames
}; 