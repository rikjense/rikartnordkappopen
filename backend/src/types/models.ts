export interface BoardModel {
  id: number;
  name: string;
  serial_number: string;
  access_token: string;
  ip_address?: string;
  status: string;
  last_seen: Date;
  created_at: string;
  updated_at: string;
}

export interface PlayerModel {
  id: number;
  name: string;
  nickname?: string;
  email?: string;
  avatar?: string;
  stats?: string; // JSON string for player statistics
  created_at: string;
  updated_at: string;
}

export interface MatchModel {
  id: number;
  board_id: number;
  mode: string; // '301', '501', 'cricket', etc.
  state: string; // 'pending', 'warmup', 'active', 'completed', 'canceled'
  scores?: string; // JSON string for current scores
  settings?: string; // JSON string for game settings
  start_time?: string;
  end_time?: string;
  winner_id?: number;
  created_at: string;
  updated_at: string;
}

export interface MatchPlayerModel {
  match_id: number;
  player_id: number;
  position: number;
  starting_score: number;
  current_score: number;
  is_winner: boolean;
  created_at: string;
  updated_at: string;
}

export interface ThrowModel {
  id: number;
  match_id: number;
  player_id: number;
  round: number;
  position: number; // Position in round (1, 2, 3)
  segment: string; // 'S20', 'D16', 'T19', 'BULL', 'DBULL', 'MISS'
  score: number;
  is_corrected: boolean;
  timestamp: string;
} 