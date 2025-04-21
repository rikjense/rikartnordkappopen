import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { useSocket } from '../../context/SocketContext';

export default function GamePage() {
  const router = useRouter();
  const { id } = router.query;
  const [gameState, setGameState] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dartInput, setDartInput] = useState('');
  const [dartNotation, setDartNotation] = useState(['', '', '']);
  
  const {
    isConnected,
    joinGame,
    sendThrow,
    startWarmup,
    completeWarmup,
    setBullWinner,
    onGameState,
    onError
  } = useSocket();
  
  // Fetch initial game data and set up socket listeners
  useEffect(() => {
    if (!id) return;
    
    const fetchGame = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`/api/games/${id}`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch game');
        }
        
        const data = await response.json();
        setGameState(data);
        setError(null);
      } catch (err) {
        console.error('Error fetching game:', err);
        setError('Failed to load game data. Please try again later.');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchGame();
    
    // Join the game room for real-time updates when socket is connected
    if (isConnected) {
      joinGame(id);
    }
  }, [id, isConnected, joinGame]);
  
  // Set up socket event listeners
  useEffect(() => {
    // Listen for game state updates
    const unsubscribeGameState = onGameState((newGameState) => {
      setGameState(newGameState);
    });
    
    // Listen for errors
    const unsubscribeError = onError((err) => {
      setError(err.message || 'An error occurred');
    });
    
    return () => {
      unsubscribeGameState();
      unsubscribeError();
    };
  }, [onGameState, onError]);
  
  // Handle different game state actions
  const handleStartWarmup = () => {
    if (!id) return;
    startWarmup(id);
  };
  
  const handleCompleteWarmup = () => {
    if (!id) return;
    completeWarmup(id);
  };
  
  const handleSetBullWinner = (playerId) => {
    if (!id) return;
    setBullWinner(id, playerId);
  };
  
  // Handle dart input
  const handleDartInputChange = (e) => {
    setDartInput(e.target.value);
  };
  
  const handleDartNotationChange = (index, value) => {
    const newNotation = [...dartNotation];
    newNotation[index] = value;
    setDartNotation(newNotation);
  };
  
  const calculateScore = (notation) => {
    // Simple dart notation score calculator
    // This would need to be expanded for a full implementation
    let score = 0;
    notation.forEach(dart => {
      if (!dart) return;
      
      // Examples: "T20" (triple 20), "D16" (double 16), "25" (outer bull), "50" (bull)
      const match = dart.match(/^([SDT])?(\d+)$/i);
      if (!match) return;
      
      const [, multiplier, value] = match;
      const numValue = parseInt(value, 10);
      
      if (multiplier === 'S' || !multiplier) {
        score += numValue;
      } else if (multiplier === 'D') {
        score += numValue * 2;
      } else if (multiplier === 'T') {
        score += numValue * 3;
      }
    });
    
    return score;
  };
  
  const handleSendThrow = () => {
    if (!id || !gameState) return;
    
    // Calculate score from notation
    const score = calculateScore(dartNotation);
    
    // Get the current player ID
    const currentPlayerId = gameState.game.current_player;
    
    // Send the throw
    sendThrow(id, currentPlayerId, score, dartNotation);
    
    // Reset input
    setDartInput('');
    setDartNotation(['', '', '']);
  };
  
  // Quick score buttons for common scores
  const quickScores = [
    { label: "0", score: 0, notation: ["0", "", ""] },
    { label: "26", score: 26, notation: ["20", "6", ""] },
    { label: "45", score: 45, notation: ["20", "T5", "D5"] },
    { label: "60", score: 60, notation: ["20", "20", "20"] },
    { label: "85", score: 85, notation: ["T20", "T5", "D5"] },
    { label: "100", score: 100, notation: ["T20", "T20", "0"] },
    { label: "140", score: 140, notation: ["T20", "T20", "T20"] },
    { label: "180", score: 180, notation: ["T20", "T20", "T20"] },
  ];
  
  const handleQuickScore = (score, notation) => {
    if (!id || !gameState) return;
    
    // Get the current player ID
    const currentPlayerId = gameState.game.current_player;
    
    // Send the throw
    sendThrow(id, currentPlayerId, score, notation);
  };
  
  // Render different game states
  const renderPendingGame = () => (
    <div className="bg-white shadow-md rounded-lg p-6 mb-6">
      <h2 className="text-xl font-bold mb-4">Game Setup</h2>
      <p className="mb-4">This game is waiting to start.</p>
      <button 
        onClick={handleStartWarmup}
        className="bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded"
      >
        Start Warmup
      </button>
    </div>
  );
  
  const renderWarmupGame = () => (
    <div className="bg-white shadow-md rounded-lg p-6 mb-6">
      <h2 className="text-xl font-bold mb-4">Warmup in Progress</h2>
      <p className="mb-4">Players are warming up (9 darts each).</p>
      <button 
        onClick={handleCompleteWarmup}
        className="bg-green-500 hover:bg-green-600 text-white py-2 px-4 rounded"
      >
        Complete Warmup
      </button>
    </div>
  );
  
  const renderBullThrow = () => (
    <div className="bg-white shadow-md rounded-lg p-6 mb-6">
      <h2 className="text-xl font-bold mb-4">Throw for Bull</h2>
      <p className="mb-4">Players should throw for bull to determine who starts.</p>
      <div className="grid grid-cols-2 gap-4">
        <button 
          onClick={() => handleSetBullWinner(gameState.game.player1_id)}
          className="bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded"
        >
          {gameState.player1.name} Wins Bull
        </button>
        <button 
          onClick={() => handleSetBullWinner(gameState.game.player2_id)}
          className="bg-red-500 hover:bg-red-600 text-white py-2 px-4 rounded"
        >
          {gameState.player2.name} Wins Bull
        </button>
      </div>
    </div>
  );
  
  const renderActiveGame = () => (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Scoreboard */}
        <div className="bg-white shadow-md rounded-lg p-6">
          <h2 className="text-xl font-bold mb-4">Scoreboard</h2>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className={`p-4 rounded-lg ${gameState.game.current_player === gameState.player1.id ? 'bg-blue-100 border-2 border-blue-500' : 'bg-gray-100'}`}>
              <div className="font-bold text-lg">{gameState.player1.name}</div>
              <div className="text-3xl font-bold">{gameState.game.player1_legs}</div>
              <div className="text-2xl">{gameState.game.current_leg_player1_score}</div>
            </div>
            <div className={`p-4 rounded-lg ${gameState.game.current_player === gameState.player2.id ? 'bg-red-100 border-2 border-red-500' : 'bg-gray-100'}`}>
              <div className="font-bold text-lg">{gameState.player2.name}</div>
              <div className="text-3xl font-bold">{gameState.game.player2_legs}</div>
              <div className="text-2xl">{gameState.game.current_leg_player2_score}</div>
            </div>
          </div>
          <div className="text-sm text-gray-600">
            <p>First to {gameState.game.legs_required} legs</p>
            <p>Current leg: {gameState.currentLeg?.leg_number || 1}</p>
          </div>
        </div>
        
        {/* Throw Input */}
        <div className="bg-white shadow-md rounded-lg p-6">
          <h2 className="text-xl font-bold mb-4">Input Score</h2>
          <div className="mb-4">
            <p className="text-lg font-medium mb-2">
              Current Player: {gameState.game.current_player === gameState.player1.id 
                ? gameState.player1.name 
                : gameState.player2.name}
            </p>
            <p className="text-sm text-gray-600 mb-4">
              Remaining: {gameState.game.current_player === gameState.player1.id 
                ? gameState.game.current_leg_player1_score 
                : gameState.game.current_leg_player2_score}
            </p>
          </div>
          
          {/* Dart notation input */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            {[0, 1, 2].map((index) => (
              <input
                key={index}
                type="text"
                placeholder={`Dart ${index + 1}`}
                value={dartNotation[index]}
                onChange={(e) => handleDartNotationChange(index, e.target.value)}
                className="border p-2 rounded"
              />
            ))}
          </div>
          
          <div className="flex space-x-2 mb-4">
            <input
              type="number"
              placeholder="Score"
              value={dartInput}
              onChange={handleDartInputChange}
              className="border p-2 rounded flex-grow"
            />
            <button
              onClick={handleSendThrow}
              className="bg-green-500 hover:bg-green-600 text-white py-2 px-4 rounded"
            >
              Submit
            </button>
          </div>
          
          {/* Quick score buttons */}
          <div className="grid grid-cols-4 gap-2">
            {quickScores.map((item) => (
              <button
                key={item.label}
                onClick={() => handleQuickScore(item.score, item.notation)}
                className="bg-gray-200 hover:bg-gray-300 py-2 px-3 rounded text-sm"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      
      {/* Recent Throws */}
      {gameState.throws && gameState.throws.length > 0 && (
        <div className="bg-white shadow-md rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">Recent Throws</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Player</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Score</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Darts</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Remaining</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {gameState.throws.map((t, index) => (
                  <tr key={t.id || index}>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {t.player_id === gameState.player1.id ? gameState.player1.name : gameState.player2.name}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {t.score} {t.is_bust ? '(BUST)' : ''}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {[t.dart1, t.dart2, t.dart3].filter(Boolean).join(', ')}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">{t.remaining}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
  
  // Main render
  return (
    <div className="container mx-auto px-4 py-8">
      <Head>
        <title>Game {id} | Dart Tournament App</title>
        <meta name="description" content="Dart game in progress" />
      </Head>
      
      <div className="mb-6">
        <Link href="/" className="text-blue-500 hover:text-blue-700 font-medium">
          ← Back to Dashboard
        </Link>
      </div>
      
      {error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6" role="alert">
          <p>{error}</p>
        </div>
      )}
      
      {isLoading ? (
        <div className="bg-white shadow-md rounded-lg p-6 mb-6">
          <p>Loading game data...</p>
        </div>
      ) : !gameState ? (
        <div className="bg-white shadow-md rounded-lg p-6 mb-6">
          <p>Game not found.</p>
        </div>
      ) : (
        <>
          <div className="bg-white shadow-md rounded-lg p-6 mb-6">
            <h1 className="text-2xl font-bold mb-2">
              Game #{id}: {gameState.player1.name} vs {gameState.player2.name}
            </h1>
            <div className="text-sm text-gray-600 mb-2">
              Status: <span className="font-medium">{gameState.game.status}</span>
            </div>
            {gameState.game.board_name && (
              <div className="text-sm text-gray-600">
                Board: <span className="font-medium">{gameState.game.board_name}</span>
              </div>
            )}
          </div>
          
          {gameState.game.status === 'pending' && renderPendingGame()}
          {gameState.game.status === 'warmup' && renderWarmupGame()}
          {gameState.game.status === 'bull' && renderBullThrow()}
          {gameState.game.status === 'in_progress' && renderActiveGame()}
          
          {gameState.game.status === 'completed' && (
            <div className="bg-white shadow-md rounded-lg p-6 mb-6">
              <h2 className="text-xl font-bold mb-4">Game Completed</h2>
              <p className="text-lg mb-4">
                Winner: <span className="font-bold">
                  {gameState.game.player1_legs >= gameState.game.legs_required 
                    ? gameState.player1.name 
                    : gameState.player2.name}
                </span>
              </p>
              <div className="text-lg">
                Final Score: {gameState.game.player1_legs} - {gameState.game.player2_legs}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
} 