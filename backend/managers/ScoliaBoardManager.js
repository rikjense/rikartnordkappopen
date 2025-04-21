const WebSocket = require('ws');
const EventEmitter = require('events');

/**
 * ScoliaBoardManager
 * 
 * Handles communication with a Scolia dart board via WebSocket
 * Manages the full lifecycle of a game and updates the database
 */
class ScoliaBoardManager extends EventEmitter {
  constructor(board, io, db) {
    super();
    this.board = board;
    this.io = io;
    this.db = db;
    this.wsClient = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectTimeout = null;
    this.reconnectDelay = 5000; // 5 seconds
    this.connectedAt = null;
    this.currentMatch = null;
    this.isConnecting = false;
    this.pingInterval = null;
    this.lastPingTime = null;
    this.isConnected = false;
    
    // Bind methods
    this.connect = this.connect.bind(this);
    this.disconnect = this.disconnect.bind(this);
    this.reconnect = this.reconnect.bind(this);
    this.handleMessage = this.handleMessage.bind(this);
    this.handleClose = this.handleClose.bind(this);
    this.handleError = this.handleError.bind(this);
    this.sendMessage = this.sendMessage.bind(this);
    this.ping = this.ping.bind(this);
    this.updateBoardStatus = this.updateBoardStatus.bind(this);
    this.startMatch = this.startMatch.bind(this);
    this.endMatch = this.endMatch.bind(this);
    this.correctThrow = this.correctThrow.bind(this);
    this.manualPlayerSwitch = this.manualPlayerSwitch.bind(this);
    this.handleBoardEvent = this.handleBoardEvent.bind(this);
    
    // If board has serial_number and access_token, connect automatically
    if (board.serial_number && board.access_token) {
      this.connect();
    }
  }
  
  /**
   * Connect to the Scolia board via WebSocket
   */
  async connect() {
    if (this.wsClient || this.isConnecting) {
      console.log(`Already connected or connecting to board ${this.board.name}`);
      return;
    }
    
    this.isConnecting = true;
    
    try {
      console.log(`Connecting to board ${this.board.name}...`);
      
      // Update board status in database
      await this.updateBoardStatus('connecting');
      
      // Create WebSocket connection
      const wsUrl = `wss://boards.scolia.online/${this.board.serial_number}?accessToken=${this.board.access_token}`;
      this.wsClient = new WebSocket(wsUrl);
      
      this.wsClient.on('open', async () => {
        console.log(`Connected to board ${this.board.name}`);
        this.isConnected = true;
        this.connectedAt = new Date();
        this.reconnectAttempts = 0;
        
        // Update board status in database
        await this.updateBoardStatus('online');
        
        // Set up ping interval
        this.pingInterval = setInterval(this.ping, 30000); // 30 seconds
        
        // Notify clients via Socket.IO
        this.io.emit('board:updated', {
          ...this.board,
          status: 'online',
          last_seen: this.connectedAt
        });
        
        // Send initial configuration to the board
        this.sendMessage({
          type: 'configuration',
          data: {
            displayMode: 'match',
            soundEnabled: true,
            animationsEnabled: true
          }
        });
        
        this.isConnecting = false;
      });
      
      this.wsClient.on('message', this.handleMessage);
      this.wsClient.on('close', this.handleClose);
      this.wsClient.on('error', this.handleError);
      
    } catch (error) {
      console.error(`Error connecting to board ${this.board.name}:`, error);
      this.isConnecting = false;
      await this.updateBoardStatus('offline');
      this.reconnect();
    }
  }
  
  /**
   * Disconnect from the Scolia board
   */
  async disconnect() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    if (this.wsClient) {
      this.wsClient.removeAllListeners();
      
      if (this.wsClient.readyState === WebSocket.OPEN) {
        this.wsClient.close();
      }
      
      this.wsClient = null;
    }
    
    this.isConnected = false;
    await this.updateBoardStatus('offline');
    
    console.log(`Disconnected from board ${this.board.name}`);
  }
  
  /**
   * Attempt to reconnect to the board
   */
  reconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log(`Maximum reconnect attempts reached for board ${this.board.name}`);
      return;
    }
    
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts;
    
    console.log(`Reconnecting to board ${this.board.name} in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay);
  }
  
  /**
   * Handle incoming WebSocket messages from the board
   */
  handleMessage(message) {
    try {
      const data = JSON.parse(message);
      console.log(`Received message from board ${this.board.name}:`, data.type);
      
      // Update last seen timestamp
      this.board.last_seen = new Date();
      
      // Process message based on type
      switch (data.type) {
        case 'pong':
          this.handlePong();
          break;
          
        case 'event':
          this.handleBoardEvent(data.data);
          break;
          
        case 'error':
          console.error(`Error from board ${this.board.name}:`, data.data);
          break;
          
        case 'gameState':
          this.handleGameState(data.data);
          break;
          
        default:
          console.log(`Unknown message type from board ${this.board.name}:`, data.type);
      }
    } catch (error) {
      console.error(`Error handling message from board ${this.board.name}:`, error);
    }
  }
  
  /**
   * Handle WebSocket close event
   */
  async handleClose(code, reason) {
    console.log(`Connection closed to board ${this.board.name} with code: ${code}, reason: ${reason || 'No reason provided'}`);
    
    this.wsClient = null;
    this.isConnected = false;
    
    await this.updateBoardStatus('offline');
    
    // Try to reconnect
    this.reconnect();
  }
  
  /**
   * Handle WebSocket error
   */
  handleError(error) {
    console.error(`WebSocket error for board ${this.board.name}:`, error);
  }
  
  /**
   * Send a message to the board
   */
  sendMessage(message) {
    if (!this.wsClient || this.wsClient.readyState !== WebSocket.OPEN) {
      console.error(`Cannot send message to board ${this.board.name}: not connected`);
      return false;
    }
    
    try {
      this.wsClient.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error(`Error sending message to board ${this.board.name}:`, error);
      return false;
    }
  }
  
  /**
   * Send a ping to keep the connection alive
   */
  ping() {
    this.lastPingTime = new Date();
    this.sendMessage({ type: 'ping' });
  }
  
  /**
   * Handle pong response from board
   */
  handlePong() {
    const now = new Date();
    const pingTime = this.lastPingTime ? now - this.lastPingTime : 0;
    console.log(`Received pong from board ${this.board.name} (${pingTime}ms)`);
  }
  
  /**
   * Update board status in database
   */
  async updateBoardStatus(status) {
    try {
      const now = new Date();
      
      // Update in-memory board object
      this.board.status = status;
      this.board.last_seen = now;
      
      // Update database
      await this.db.run(
        'UPDATE boards SET status = ?, last_seen = ? WHERE id = ?',
        [status, now.toISOString(), this.board.id]
      );
      
      // Emit event to clients
      this.io.emit('board:updated', {
        ...this.board,
        status,
        last_seen: now
      });
      
      return true;
    } catch (error) {
      console.error(`Error updating board status for ${this.board.name}:`, error);
      return false;
    }
  }
  
  /**
   * Handle board events
   */
  async handleBoardEvent(eventData) {
    const { eventType, data } = eventData;
    
    switch (eventType) {
      case 'throw':
        await this.handleThrow(data);
        break;
        
      case 'gameStarted':
        await this.handleGameStarted(data);
        break;
        
      case 'gameEnded':
        await this.handleGameEnded(data);
        break;
        
      case 'playerSwitch':
        await this.handlePlayerSwitch(data);
        break;
        
      case 'warmupStarted':
        await this.handleWarmupStarted(data);
        break;
        
      case 'warmupEnded':
        await this.handleWarmupEnded(data);
        break;
        
      default:
        console.log(`Unknown board event: ${eventType}`);
    }
    
    // Forward event to clients
    this.io.emit('board:event', {
      boardId: this.board.id,
      eventType,
      data
    });
  }
  
  /**
   * Handle game state updates
   */
  async handleGameState(stateData) {
    if (!this.currentMatch) {
      console.log(`Received game state but no active match for board ${this.board.name}`);
      return;
    }
    
    try {
      // Update match in database
      await this.db.run(
        'UPDATE matches SET scores = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [JSON.stringify(stateData.scores), this.currentMatch.id]
      );
      
      // Update player scores in match_players
      if (stateData.players) {
        for (const player of stateData.players) {
          await this.db.run(
            'UPDATE match_players SET current_score = ? WHERE match_id = ? AND position = ?',
            [player.score, this.currentMatch.id, player.position]
          );
        }
      }
      
      // Emit game update event
      const updatedMatch = await this.getMatchDetails(this.currentMatch.id);
      this.io.emit('game:updated', updatedMatch);
      
    } catch (error) {
      console.error(`Error updating game state for board ${this.board.name}:`, error);
    }
  }
  
  /**
   * Handle a throw event
   */
  async handleThrow(throwData) {
    if (!this.currentMatch) {
      console.log(`Received throw but no active match for board ${this.board.name}`);
      return;
    }
    
    try {
      const { player, round, throwIndex, segment, score } = throwData;
      
      // Get player ID
      const playerResult = await this.db.get(
        'SELECT player_id FROM match_players WHERE match_id = ? AND position = ?',
        [this.currentMatch.id, player.position]
      );
      
      if (!playerResult) {
        console.error(`Player position ${player.position} not found for match ${this.currentMatch.id}`);
        return;
      }
      
      // Record throw in database
      await this.db.run(
        'INSERT INTO throws (match_id, player_id, round, position, segment, score) VALUES (?, ?, ?, ?, ?, ?)',
        [this.currentMatch.id, playerResult.player_id, round, throwIndex + 1, segment, score]
      );
      
      // Update current score for player
      await this.db.run(
        'UPDATE match_players SET current_score = ? WHERE match_id = ? AND player_id = ?',
        [player.score, this.currentMatch.id, playerResult.player_id]
      );
      
      // Emit throw event
      this.io.emit('game:throw', {
        matchId: this.currentMatch.id,
        boardId: this.board.id,
        playerId: playerResult.player_id,
        round,
        position: throwIndex + 1,
        segment,
        score,
        playerScore: player.score
      });
      
    } catch (error) {
      console.error(`Error handling throw for board ${this.board.name}:`, error);
    }
  }
  
  /**
   * Handle game started event
   */
  async handleGameStarted(gameData) {
    if (!this.currentMatch) {
      console.log(`Received game started but no active match for board ${this.board.name}`);
      return;
    }
    
    try {
      // Update match in database
      await this.db.run(
        'UPDATE matches SET state = ?, start_time = CURRENT_TIMESTAMP WHERE id = ?',
        ['active', this.currentMatch.id]
      );
      
      // Emit game started event
      const updatedMatch = await this.getMatchDetails(this.currentMatch.id);
      this.io.emit('game:updated', updatedMatch);
      
    } catch (error) {
      console.error(`Error handling game started for board ${this.board.name}:`, error);
    }
  }
  
  /**
   * Handle game ended event
   */
  async handleGameEnded(gameData) {
    if (!this.currentMatch) {
      console.log(`Received game ended but no active match for board ${this.board.name}`);
      return;
    }
    
    try {
      // Get winner player ID
      let winnerId = null;
      
      if (gameData.winner) {
        const winnerResult = await this.db.get(
          'SELECT player_id FROM match_players WHERE match_id = ? AND position = ?',
          [this.currentMatch.id, gameData.winner.position]
        );
        
        if (winnerResult) {
          winnerId = winnerResult.player_id;
          
          // Update winner in match_players
          await this.db.run(
            'UPDATE match_players SET is_winner = 1 WHERE match_id = ? AND player_id = ?',
            [this.currentMatch.id, winnerId]
          );
        }
      }
      
      // Update match in database
      await this.db.run(
        'UPDATE matches SET state = ?, end_time = CURRENT_TIMESTAMP, winner_id = ? WHERE id = ?',
        ['completed', winnerId, this.currentMatch.id]
      );
      
      // Emit game ended event
      const updatedMatch = await this.getMatchDetails(this.currentMatch.id);
      this.io.emit('game:updated', updatedMatch);
      
      // Clear current match
      this.currentMatch = null;
      
    } catch (error) {
      console.error(`Error handling game ended for board ${this.board.name}:`, error);
    }
  }
  
  /**
   * Handle player switch event
   */
  async handlePlayerSwitch(switchData) {
    if (!this.currentMatch) return;
    
    // Just relay the event, no database updates needed
    this.io.emit('game:playerSwitch', {
      matchId: this.currentMatch.id,
      boardId: this.board.id,
      ...switchData
    });
  }
  
  /**
   * Handle warmup started event
   */
  async handleWarmupStarted(warmupData) {
    if (!this.currentMatch) {
      console.log(`Received warmup started but no active match for board ${this.board.name}`);
      return;
    }
    
    try {
      // Update match state
      await this.db.run(
        'UPDATE matches SET state = ? WHERE id = ?',
        ['warmup', this.currentMatch.id]
      );
      
      // Emit warmup started event
      const updatedMatch = await this.getMatchDetails(this.currentMatch.id);
      this.io.emit('game:updated', updatedMatch);
      
    } catch (error) {
      console.error(`Error handling warmup started for board ${this.board.name}:`, error);
    }
  }
  
  /**
   * Handle warmup ended event
   */
  async handleWarmupEnded(warmupData) {
    if (!this.currentMatch) return;
    
    try {
      // Update match state back to pending if it was in warmup
      const match = await this.db.get(
        'SELECT state FROM matches WHERE id = ?',
        [this.currentMatch.id]
      );
      
      if (match && match.state === 'warmup') {
        await this.db.run(
          'UPDATE matches SET state = ? WHERE id = ?',
          ['pending', this.currentMatch.id]
        );
        
        // Emit update
        const updatedMatch = await this.getMatchDetails(this.currentMatch.id);
        this.io.emit('game:updated', updatedMatch);
      }
    } catch (error) {
      console.error(`Error handling warmup ended for board ${this.board.name}:`, error);
    }
  }
  
  /**
   * Start a new match on the board
   */
  async startMatch(matchData) {
    try {
      const { players, mode, settings } = matchData;
      
      if (!players || players.length < 2) {
        throw new Error('At least two players are required');
      }
      
      // Check if board is connected
      if (!this.isConnected) {
        throw new Error('Board is not connected');
      }
      
      // Create match in database
      const result = await this.db.run(
        'INSERT INTO matches (board_id, mode, state, settings) VALUES (?, ?, ?, ?)',
        [this.board.id, mode, 'pending', JSON.stringify(settings || {})]
      );
      
      const matchId = result.lastID;
      
      // Add players to match
      for (let i = 0; i < players.length; i++) {
        const player = players[i];
        const position = i + 1;
        let playerId = player.id;
        
        // If player doesn't exist, create a new one
        if (!playerId) {
          const playerResult = await this.db.run(
            'INSERT INTO players (name, nickname) VALUES (?, ?)',
            [player.name, player.nickname || null]
          );
          playerId = playerResult.lastID;
        }
        
        // Calculate starting score based on game mode
        let startingScore = 0;
        if (mode === '301') startingScore = 301;
        else if (mode === '501') startingScore = 501;
        else if (mode === '701') startingScore = 701;
        
        // Add player to match
        await this.db.run(
          'INSERT INTO match_players (match_id, player_id, position, starting_score, current_score) VALUES (?, ?, ?, ?, ?)',
          [matchId, playerId, position, startingScore, startingScore]
        );
      }
      
      // Set as current match
      this.currentMatch = { id: matchId, mode };
      
      // Send game configuration to board
      const boardPlayers = players.map((player, index) => ({
        position: index + 1,
        name: player.name,
        score: mode === '301' ? 301 : mode === '501' ? 501 : mode === '701' ? 701 : 0
      }));
      
      const boardConfig = {
        gameType: mode,
        players: boardPlayers,
        options: {
          doubleIn: settings?.doubleIn || false,
          doubleOut: settings?.doubleOut || true,
          maxRounds: settings?.maxRounds || 20
        }
      };
      
      this.sendMessage({
        type: 'startGame',
        data: boardConfig
      });
      
      // Get and return match details
      const match = await this.getMatchDetails(matchId);
      this.io.emit('game:created', match);
      
      return match;
    } catch (error) {
      console.error(`Error starting match on board ${this.board.name}:`, error);
      throw error;
    }
  }
  
  /**
   * End the current match
   */
  async endMatch() {
    if (!this.currentMatch) {
      throw new Error('No active match on this board');
    }
    
    try {
      // Send end game command to board
      this.sendMessage({
        type: 'endGame',
        data: {}
      });
      
      // Update match in database
      await this.db.run(
        'UPDATE matches SET state = ?, end_time = CURRENT_TIMESTAMP WHERE id = ?',
        ['canceled', this.currentMatch.id]
      );
      
      // Get match details before clearing
      const match = await this.getMatchDetails(this.currentMatch.id);
      
      // Clear current match
      const matchId = this.currentMatch.id;
      this.currentMatch = null;
      
      // Emit game ended event
      this.io.emit('game:deleted', matchId, this.board.id);
      
      return { success: true, matchId };
    } catch (error) {
      console.error(`Error ending match on board ${this.board.name}:`, error);
      throw error;
    }
  }
  
  /**
   * Correct a throw
   */
  async correctThrow(throwData) {
    if (!this.currentMatch) {
      throw new Error('No active match on this board');
    }
    
    try {
      const { throwId, segment, score } = throwData;
      
      // Update throw in database
      await this.db.run(
        'UPDATE throws SET segment = ?, score = ?, is_corrected = 1 WHERE id = ?',
        [segment, score, throwId]
      );
      
      // Send correction to board
      this.sendMessage({
        type: 'correctThrow',
        data: { 
          throwId,
          segment,
          score
        }
      });
      
      return { success: true };
    } catch (error) {
      console.error(`Error correcting throw on board ${this.board.name}:`, error);
      throw error;
    }
  }
  
  /**
   * Manually switch active player
   */
  async manualPlayerSwitch() {
    if (!this.currentMatch) {
      throw new Error('No active match on this board');
    }
    
    try {
      // Send player switch command to board
      this.sendMessage({
        type: 'switchPlayer',
        data: {}
      });
      
      return { success: true };
    } catch (error) {
      console.error(`Error switching player on board ${this.board.name}:`, error);
      throw error;
    }
  }
  
  /**
   * Get match details from database
   */
  async getMatchDetails(matchId) {
    try {
      // Get match
      const match = await this.db.get(
        'SELECT * FROM matches WHERE id = ?',
        [matchId]
      );
      
      if (!match) {
        throw new Error(`Match ${matchId} not found`);
      }
      
      // Get players
      const players = await this.db.all(
        `SELECT mp.*, p.name, p.nickname, p.avatar 
         FROM match_players mp
         JOIN players p ON mp.player_id = p.id
         WHERE mp.match_id = ?
         ORDER BY mp.position`,
        [matchId]
      );
      
      // Get throws
      const throws = await this.db.all(
        'SELECT * FROM throws WHERE match_id = ? ORDER BY timestamp',
        [matchId]
      );
      
      // Parse JSON fields
      const parsedMatch = {
        ...match,
        settings: match.settings ? JSON.parse(match.settings) : {},
        scores: match.scores ? JSON.parse(match.scores) : {},
        players,
        throws,
        boardId: match.board_id
      };
      
      return parsedMatch;
    } catch (error) {
      console.error(`Error getting match details:`, error);
      throw error;
    }
  }
}

module.exports = ScoliaBoardManager; 