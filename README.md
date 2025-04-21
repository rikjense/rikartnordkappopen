# Dart Scoring & Streaming System

A real-time dart scoring application with a streaming overlay, utilizing Scolia electronic dart boards for automated scoring. This system includes admin tools, match management, and real-time score tracking.

## Features

- **Real-time game state updates** via WebSocket connections
- **Scolia Board Integration** for automatic dart recognition
- **Admin override tools** for score corrections and game management
- **Match summaries** and statistics tracking
- **Streaming overlay** for live broadcasting
- **Multi-game support** with flexible configurations

## System Requirements

- Node.js 14.x or higher
- SQLite (included)
- A Scolia electronic dart board (for auto-scoring)

## Setup Instructions

### 1. Clone the repository

```bash
git clone <repository-url>
cd dart-scoring-system
```

### 2. Install dependencies

```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 3. Configuration

Create a `.env.local` file in the root directory and add your configuration:

```env
# API Configuration
PORT=3001
NODE_ENV=development

# Scolia Dart Board Credentials
SCOLIA_API_KEY=your_scolia_api_key
SCOLIA_SECRET=your_scolia_secret

# Database Configuration (optional)
DB_PATH=data/tournament.db

# CORS Configuration (if needed)
ALLOWED_ORIGINS=http://localhost:3000
```

### 4. Database initialization

The system will automatically create the database and tables on first startup. No manual setup required.

## Development Commands

### Backend

```bash
# Start the backend in development mode
cd backend
npm run dev

# Build for production
npm run build

# Start in production mode
npm start

# Run tests
npm test
```

### Frontend

```bash
# Start the frontend development server
cd frontend
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run tests
npm test
```

## API Documentation

### REST Endpoints

- `GET /api/boards` - Get all available dart boards
- `GET /api/boards/:id` - Get specific board details
- `POST /api/boards` - Register a new dart board
- `DELETE /api/boards/:id` - Remove a dart board

- `GET /api/games` - Get all games
- `GET /api/games/:id` - Get specific game details
- `POST /api/games` - Create a new game
- `GET /api/games/:id/summary` - Get match summary
- `POST /api/games/:id/summary` - Generate match summary

### WebSocket Events

#### Client → Server Events
- `authenticate` - Authenticate with the server
- `join_game` - Join a specific game room
- `process_throw` - Submit a dart throw
- `start_warmup` - Start warmup period
- `complete_warmup` - End warmup period
- `set_bull_winner` - Set bull throw winner
- `override_throw` - Admin override for throw score
- `get_player_stats` - Request player statistics
- `get_game_state` - Force refresh game state
- `get_missed_events` - Get events missed during disconnection

#### Server → Client Events
- `authenticated` - Authentication result
- `game_state` - Complete game state update
- `player_stats` - Player statistics
- `error` - Error messages
- `board:event` - Board-specific events
- `match:updated` - Match data updates
- `match:created` - New match created
- `match:deleted` - Match removed
- `missed_events` - Events missed during disconnection

## Game Flow

1. **Setup Phase**
   - Create match with players and settings
   - Assign a dart board

2. **Warmup Phase**
   - Players get 9 darts (3 rounds) for warmup
   - Scores not counted in stats

3. **Bull Throw**
   - Each player throws one dart at the bull
   - Closest to center starts the first leg

4. **Game Play**
   - Players alternate throwing 3 darts per turn
   - First to exactly zero with a double wins the leg
   - Busts reset the score to the beginning of that turn
   - Detailed statistics tracked throughout

5. **Match End**
   - First player to win the required number of legs wins
   - Match summary generated with detailed statistics

## Admin Tools

- Score overrides
- Player turn management
- Match state adjustments
- Database management
- Player and board configuration

## Troubleshooting

### Common Issues

- **WebSocket Connection Failures**: Check your firewall settings and ensure the backend is running.
- **Database Errors**: Ensure the data directory is writable.
- **Board Connection Issues**: Verify the board credentials in the `.env.local` file.

### Logs

- Backend logs are stored in `backend/logs/`
- Check browser console for frontend error messages

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- The Scolia team for their dart board API
- Contributors and testers
