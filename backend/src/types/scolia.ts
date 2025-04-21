/**
 * Types for Scolia API integration
 */

// Board Message Types
export type BoardMessageType = 'pong' | 'event' | 'error' | 'gameState';

export interface BoardMessage {
  type: BoardMessageType;
  data: any;
}

// Board Event Types
export interface BoardEvent {
  eventType: string;
  data: any;
}

// Game State
export interface GameState {
  scores?: any;
  players?: ScoliaPlayer[];
}

// Player in Scolia board
export interface ScoliaPlayer {
  id: number;
  name: string;
  position: number;
  score: number;
  isActive: boolean;
  isWinner: boolean;
}

// Throw data from Scolia board
export interface ThrowData {
  id?: number;
  matchId: number;
  playerId: number;
  round: number;
  throwIndex: number;
  segment: string;
  score: number;
  is_corrected?: boolean;
  timestamp?: Date;
}

// Game configuration for Scolia board
export interface BoardConfig {
  gameType: string;
  players: ScoliaPlayer[];
  options: ScoliaGameOptions;
}

// Game options for Scolia board
export interface ScoliaGameOptions {
  doubleIn?: boolean;
  doubleOut?: boolean;
  maxRounds?: number;
}

// WebSocket Close Codes
export enum WebSocketCloseCode {
  NORMAL_CLOSURE = 1000,
  GOING_AWAY = 1001,
  PROTOCOL_ERROR = 1002,
  UNSUPPORTED_DATA = 1003,
  NO_STATUS_RECEIVED = 1005,
  ABNORMAL_CLOSURE = 1006,
  INVALID_FRAME_PAYLOAD_DATA = 1007,
  POLICY_VIOLATION = 1008,
  MESSAGE_TOO_BIG = 1009,
  MISSING_EXTENSION = 1010,
  INTERNAL_ERROR = 1011,
  SERVICE_RESTART = 1012,
  TRY_AGAIN_LATER = 1013,
  BAD_GATEWAY = 1014,
  TLS_HANDSHAKE = 1015,
  
  // Custom codes
  AUTH_FAILED = 4000,
  BOARD_OFFLINE = 4001,
  CONNECTION_LIMIT_EXCEEDED = 4002,
  SESSION_EXPIRED = 4003
}

/**
 * Scolia game types and interfaces
 */

/**
 * Represents a player in a Scolia game
 */
export interface ScoliaPlayer {
  id: number;
  name: string;
  position: number;
  score: number;
  isActive: boolean;
  isWinner: boolean;
}

/**
 * Represents a dart throw
 */
export interface ThrowData {
  id?: number;
  matchId: number;
  playerId: number;
  round: number;
  throwIndex: number;
  segment: string;
  score: number;
  is_corrected?: boolean;
  timestamp?: Date;
}

/**
 * Scolia board configuration
 */
export interface ScoliaBoardConfig {
  id: string;
  ipAddress: string;
  name: string;
  status: 'online' | 'offline' | 'game' | 'maintenance';
  version?: string;
  lastSeen?: Date;
}

/**
 * Scolia WebSocket message
 */
export interface ScoliaMessage {
  type: string;
  data: any;
}

/**
 * Scolia Throw message data
 */
export interface ScoliaThrowData {
  player: number;
  segment: string;
  value: number;
}

/**
 * Game modes supported by Scolia
 */
export type GameMode = '301' | '501' | '701' | 'cricket';

/**
 * Game state status
 */
export type GameStatus = 'pending' | 'warmup' | 'active' | 'completed'; 