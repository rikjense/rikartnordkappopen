import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { Server } from 'socket.io';
import { Database } from 'sqlite';
import { BoardModel, MatchModel, PlayerModel, ThrowModel } from '../types/models';
import { 
  BoardEvent, 
  BoardMessage, 
  GameState, 
  ThrowData, 
  BoardConfig, 
  ScoliaPlayer,
  ScoliaGameOptions,
  WebSocketCloseCode
} from '../types/scolia';

/**
 * ScoliaBoardManager
 * 
 * Handles communication with a Scolia dart board via WebSocket
 * Manages the full lifecycle of a game and updates the database
 */
class ScoliaBoardManager extends EventEmitter {
  board: BoardModel;
  io: Server;
  db: Database;
  wsClient: WebSocket | null = null;
  reconnectAttempts: number = 0;
  maxReconnectAttempts: number = 5;
  reconnectTimeout: NodeJS.Timeout | null = null;
  reconnectDelay: number = 5000; // 5 seconds
  connectedAt: Date | null = null;
  currentMatch: { id: number; mode: string } | null = null;
  isConnecting: boolean = false;
  pingInterval: NodeJS.Timeout | null = null;
  lastPingTime: Date | null = null;
  isConnected: boolean = false;

  constructor(board: BoardModel, io: Server, db: Database) {
    super();
    this.board = board;
    this.io = io;
    this.db = db;
    
    // If board has serial_number and access_token, connect automatically
    if (board.serial_number && board.access_token) {
      this.connect();
    }
  }
  
  /**
   * Connect to the Scolia board via WebSocket
   */
  async connect(): Promise<void> {
    if (this.wsClient || this.isConnecting) {
      console.log(`Already connected or connecting to board ${this.board.name}`);
      return;
    }
    
    this.isConnecting = true;
    
    try {
      console.log(`Connecting to board ${this.board.name}...`);
      
      // Update board status in database
      await this.updateBoardStatus('connecting');
      
      // Create WebSocket connection to Scolia Social API
      // Using format from the API docs: wss://game.scoliadarts.com/api/v1/social?serialNumber=ABC123&accessToken=XYZ456
      const wsUrl = `wss://game.scoliadarts.com/api/v1/social?serialNumber=${this.board.serial_number}&accessToken=${this.board.access_token}`;
      this.wsClient = new WebSocket(wsUrl);
      
      this.wsClient.on('open', async () => {
        console.log(`Connected to board ${this.board.name}`);
        this.isConnected = true;
        this.connectedAt = new Date();
        this.reconnectAttempts = 0;
        
        // Update board status in database
        await this.updateBoardStatus('online');
        
        // Set up ping interval to keep the connection alive
        this.pingInterval = setInterval(() => this.ping(), 30000); // 30 seconds
        
        // Notify clients via Socket.IO
        this.io.emit('board:updated', {
          ...this.board,
          status: 'online',
          last_seen: this.connectedAt
        });
        
        this.isConnecting = false;
      });
      
      this.wsClient.on('message', (data) => this.handleMessage(data.toString()));
      this.wsClient.on('close', (code, reason) => this.handleClose(code, reason.toString()));
      this.wsClient.on('error', (error) => this.handleError(error));
      
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
  async disconnect(): Promise<void> {
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
  reconnect(): void {
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
  handleMessage(message: string): void {
    try {
      const data = JSON.parse(message);
      console.log(`Received message from board ${this.board.name}:`, data.type);
      
      // Update last seen timestamp
      this.board.last_seen = new Date();
      
      // Process message based on type
      switch (data.type) {
        case 'HELLO_CLIENT':
          console.log(`Connection established with board ${this.board.name}`);
          // Request board status
          this.sendMessage({ type: 'GET_SBC_STATUS' });
          break;
          
        case 'THROW_DETECTED':
          this.handleThrowDetected(data.payload);
          break;
          
        case 'SBC_STATUS_CHANGED':
          this.handleStatusChanged(data.payload);
          break;
          
        case 'TAKEOUT_STARTED':
          this.handleTakeoutStarted(data.payload);
          break;
          
        case 'TAKEOUT_FINISHED':
          this.handleTakeoutFinished(data.payload);
          break;
          
        case 'SBC_CONFIGURATION':
          this.handleBoardConfiguration(data.payload);
          break;
          
        case 'CAMERA_IMAGES':
          // Handle camera images if needed
          break;
          
        case 'ACKNOWLEDGED':
          console.log(`Command acknowledged by board ${this.board.name}:`, data.payload);
          break;
          
        case 'REFUSED':
          console.error(`Command refused by board ${this.board.name}:`, data.payload);
          break;
          
        default:
          console.log(`Unknown message type from board ${this.board.name}:`, data.type);
      }
      
      // Forward event to clients if relevant
      if (['THROW_DETECTED', 'SBC_STATUS_CHANGED', 'TAKEOUT_STARTED', 'TAKEOUT_FINISHED'].includes(data.type)) {
        this.io.emit('board:event', {
          boardId: this.board.id,
          eventType: data.type,
          data: data.payload
        });
      }
    } catch (error) {
      console.error(`Error handling message from board ${this.board.name}:`, error);
    }
  }
  
  /**
   * Handle WebSocket close event
   */
  async handleClose(code: number, reason: string): Promise<void> {
    console.log(`Connection closed to board ${this.board.name} with code: ${code}, reason: ${reason || 'No reason provided'}`);
    
    this.wsClient = null;
    this.isConnected = false;
    
    await this.updateBoardStatus('offline');
    
    // Check for specific close codes
    switch (code) {
      case 4000:
        console.error(`Ping timeout for board ${this.board.name}`);
        break;
      case 4100:
        console.error(`Invalid serial number for board ${this.board.name}`);
        break;
      case 4101:
        console.error(`Board ${this.board.name} already connected elsewhere`);
        break;
      case 4102:
        console.error(`Invalid access token for board ${this.board.name}`);
        break;
      default:
        // Try to reconnect for other codes
        this.reconnect();
    }
  }
  
  /**
   * Handle WebSocket error
   */
  handleError(error: Error): void {
    console.error(`WebSocket error for board ${this.board.name}:`, error);
  }
  
  /**
   * Send a message to the board
   */
  sendMessage(message: any): boolean {
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
  ping(): void {
    this.lastPingTime = new Date();
    // No explicit ping needed for the Scolia API as it handles its own heartbeat
  }
  
  /**
   * Handle pong response from board
   */
  handlePong(): void {
    const now = new Date();
    const pingTime = this.lastPingTime ? now.getTime() - this.lastPingTime.getTime() : 0;
    console.log(`Received pong from board ${this.board.name} (${pingTime}ms)`);
  }
  
  /**
   * Handle THROW_DETECTED event
   */
  async handleThrowDetected(throwData: any): Promise<void> {
    if (!this.currentMatch) {
      console.log(`Received throw but no active match for board ${this.board.name}`);
      return;
    }
    
    try {
      const { sector, coordinates, angle, bounceout, detectionTime } = throwData;
      
      // Convert sector to score
      const score = this.sectorToScore(sector);
      
      // Get current active player
      const playerResult = await this.db.get<{player_id: number, position: number}>(
        'SELECT player_id, position FROM match_players WHERE match_id = ? AND is_active = 1',
        [this.currentMatch.id]
      );
      
      if (!playerResult) {
        console.error(`No active player found for match ${this.currentMatch.id}`);
        return;
      }
      
      // Record throw in database
      const throwRecord = {
        match_id: this.currentMatch.id,
        player_id: playerResult.player_id,
        segment: sector,
        score: score,
        coordinates: JSON.stringify(coordinates || null),
        bounceout: bounceout ? 1 : 0,
        detection_time: detectionTime,
        created_at: new Date().toISOString()
      };
      
      await this.db.run(
        `INSERT INTO throws (
          match_id, player_id, segment, score, coordinates, bounceout, 
          detection_time, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          throwRecord.match_id,
          throwRecord.player_id,
          throwRecord.segment,
          throwRecord.score,
          throwRecord.coordinates,
          throwRecord.bounceout,
          throwRecord.detection_time,
          throwRecord.created_at
        ]
      );
      
      // Emit throw event to clients
      this.io.emit('game:throw', {
        ...throwRecord,
        boardId: this.board.id,
        playerId: playerResult.player_id,
        playerPosition: playerResult.position
      });
      
    } catch (error) {
      console.error(`Error handling throw for board ${this.board.name}:`, error);
    }
  }
  
  /**
   * Convert sector notation to score
   */
  private sectorToScore(sector: string): number {
    if (!sector) return 0;
    
    // Handle singles
    if (sector.match(/^S\d+$/)) {
      return parseInt(sector.substring(1));
    }
    
    // Handle doubles
    if (sector.match(/^D\d+$/)) {
      return parseInt(sector.substring(1)) * 2;
    }
    
    // Handle triples
    if (sector.match(/^T\d+$/)) {
      return parseInt(sector.substring(1)) * 3;
    }
    
    // Handle bullseye
    if (sector === 'SB') return 25;
    if (sector === 'DB') return 50;
    
    // Handle miss
    if (sector === 'MISS') return 0;
    
    // Default
    return 0;
  }
  
  /**
   * Handle SBC_STATUS_CHANGED event
   */
  async handleStatusChanged(statusData: any): Promise<void> {
    try {
      const { status, phase } = statusData;
      
      console.log(`Board ${this.board.name} status changed to ${status}, phase: ${phase}`);
      
      // Update board status
      await this.updateBoardStatus(status.toLowerCase());
      
      // Emit status change event
      this.io.emit('board:status', {
        boardId: this.board.id,
        status: status.toLowerCase(),
        phase: phase
      });
      
    } catch (error) {
      console.error(`Error handling status change for board ${this.board.name}:`, error);
    }
  }
  
  /**
   * Handle TAKEOUT_STARTED event
   */
  async handleTakeoutStarted(data: any): Promise<void> {
    if (!this.currentMatch) return;
    
    try {
      console.log(`Takeout started on board ${this.board.name}`);
      
      // Update match state if needed
      await this.db.run(
        'UPDATE matches SET takeout_in_progress = 1 WHERE id = ?',
        [this.currentMatch.id]
      );
      
      // Emit takeout started event
      this.io.emit('game:takeoutStarted', {
        matchId: this.currentMatch.id,
        boardId: this.board.id,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error(`Error handling takeout started for board ${this.board.name}:`, error);
    }
  }
  
  /**
   * Handle TAKEOUT_FINISHED event
   */
  async handleTakeoutFinished(data: any): Promise<void> {
    if (!this.currentMatch) return;
    
    try {
      console.log(`Takeout finished on board ${this.board.name}`);
      
      // Update match state
      await this.db.run(
        'UPDATE matches SET takeout_in_progress = 0 WHERE id = ?',
        [this.currentMatch.id]
      );
      
      // Emit takeout finished event
      this.io.emit('game:takeoutFinished', {
        matchId: this.currentMatch.id,
        boardId: this.board.id,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error(`Error handling takeout finished for board ${this.board.name}:`, error);
    }
  }
  
  /**
   * Handle SBC_CONFIGURATION event
   */
  async handleBoardConfiguration(configData: any): Promise<void> {
    try {
      console.log(`Received configuration data for board ${this.board.name}`);
      
      // Save configuration to database if needed
      await this.db.run(
        'UPDATE boards SET configuration = ? WHERE id = ?',
        [JSON.stringify(configData), this.board.id]
      );
      
      // Emit configuration event
      this.io.emit('board:configuration', {
        boardId: this.board.id,
        configuration: configData
      });
      
    } catch (error) {
      console.error(`Error handling board configuration for ${this.board.name}:`, error);
    }
  }
  
  /**
   * Update board status in database
   */
  async updateBoardStatus(status: string): Promise<boolean> {
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
   * Start a new match on the board
   */
  async startMatch(matchData: {
    players: PlayerModel[];
    mode: string;
    settings?: ScoliaGameOptions;
  }): Promise<any> {
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
      
      // Configure board for match
      // This depends on the specific API requirements for your game type
      // Use RESET_PHASE and CONFIGURE_SBC if needed
      
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
  async endMatch(): Promise<{success: boolean; matchId: number}> {
    if (!this.currentMatch) {
      throw new Error('No active match on this board');
    }
    
    try {
      // Update match in database
      await this.db.run(
        'UPDATE matches SET state = ?, end_time = CURRENT_TIMESTAMP WHERE id = ?',
        ['completed', this.currentMatch.id]
      );
      
      // Get match details before clearing
      const match = await this.getMatchDetails(this.currentMatch.id);
      
      // Clear current match
      const matchId = this.currentMatch.id;
      this.currentMatch = null;
      
      // Reset board phase if needed
      this.sendMessage({ type: 'RESET_PHASE' });
      
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
  async correctThrow(throwData: {
    throwId: string;
    segment: string;
    score: number;
  }): Promise<{success: boolean}> {
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
        type: 'THROW_CORRECTED',
        data: { 
          id: throwId,
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
  async manualPlayerSwitch(): Promise<{success: boolean}> {
    if (!this.currentMatch) {
      throw new Error('No active match on this board');
    }
    
    try {
      // No direct player switch command in the API docs
      // We could use RESET_PHASE to move to the next player depending on the game state
      
      this.sendMessage({
        type: 'RESET_PHASE'
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
  async getMatchDetails(matchId: number): Promise<any> {
    try {
      // Get match
      const match = await this.db.get<MatchModel>(
        'SELECT * FROM matches WHERE id = ?',
        [matchId]
      );
      
      if (!match) {
        throw new Error(`Match ${matchId} not found`);
      }
      
      // Get players
      const players = await this.db.all<PlayerModel[]>(
        `SELECT mp.*, p.name, p.nickname, p.avatar 
         FROM match_players mp
         JOIN players p ON mp.player_id = p.id
         WHERE mp.match_id = ?
         ORDER BY mp.position`,
        [matchId]
      );
      
      // Get throws
      const throws = await this.db.all<ThrowModel[]>(
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
  
  /**
   * Request board to recalibrate
   */
  async recalibrate(): Promise<{success: boolean}> {
    try {
      const success = this.sendMessage({
        type: 'RECALIBRATE'
      });
      
      return { success };
    } catch (error) {
      console.error(`Error requesting recalibration for board ${this.board.name}:`, error);
      throw error;
    }
  }
  
  /**
   * Get camera images from the board
   */
  async getCameraImages(): Promise<{success: boolean}> {
    try {
      const success = this.sendMessage({
        type: 'GET_CAMERA_IMAGES'
      });
      
      return { success };
    } catch (error) {
      console.error(`Error requesting camera images for board ${this.board.name}:`, error);
      throw error;
    }
  }
  
  /**
   * Get board configuration
   */
  async getBoardConfiguration(): Promise<{success: boolean}> {
    try {
      const success = this.sendMessage({
        type: 'GET_SBC_CONFIGURATION'
      });
      
      return { success };
    } catch (error) {
      console.error(`Error requesting board configuration for ${this.board.name}:`, error);
      throw error;
    }
  }
}

export default ScoliaBoardManager; 