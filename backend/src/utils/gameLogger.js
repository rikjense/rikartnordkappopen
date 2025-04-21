/**
 * Log an action or event in a game
 * @param {SQLite3.Database} db - SQLite database instance
 * @param {number} gameId - ID of the game
 * @param {string} action - Type of action
 * @param {string} details - Details of the action
 * @param {string} performedBy - Who performed the action (optional)
 * @returns {Promise<number>} ID of the created log entry
 */
const logGameAction = (db, gameId, action, details, performedBy = 'system') => {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO game_logs (game_id, action, details, performed_by) VALUES (?, ?, ?, ?)',
      [gameId, action, details, performedBy],
      function(err) {
        if (err) return reject(err);
        resolve(this.lastID);
      }
    );
  });
};

/**
 * Get recent logs for a game
 * @param {SQLite3.Database} db - SQLite database instance
 * @param {number} gameId - ID of the game
 * @param {number} limit - Maximum number of logs to return
 * @returns {Promise<Array>} Array of log entries
 */
const getGameLogs = (db, gameId, limit = 50) => {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT * FROM game_logs WHERE game_id = ? ORDER BY id DESC LIMIT ?',
      [gameId, limit],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });
};

module.exports = {
  logGameAction,
  getGameLogs
}; 