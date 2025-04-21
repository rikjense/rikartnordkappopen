import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';

export default function NewGame() {
  const router = useRouter();
  const [players, setPlayers] = useState([]);
  const [boards, setBoards] = useState([]);
  const [tournaments, setTournaments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [formData, setFormData] = useState({
    player1Id: '',
    player2Id: '',
    boardId: '',
    tournamentId: '',
    legsRequired: 3
  });
  
  // Fetch players, boards, and tournaments
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        
        const [playersResponse, boardsResponse, tournamentsResponse] = await Promise.all([
          fetch('/api/players'),
          fetch('/api/games/boards'), // Adjust if your API is different
          fetch('/api/tournaments?status=active')
        ]);
        
        if (!playersResponse.ok) {
          throw new Error('Failed to fetch players');
        }
        
        const playersData = await playersResponse.json();
        setPlayers(playersData);
        
        // Only set boards and tournaments if the respective requests were successful
        if (boardsResponse.ok) {
          const boardsData = await boardsResponse.json();
          setBoards(boardsData);
        }
        
        if (tournamentsResponse.ok) {
          const tournamentsData = await tournamentsResponse.json();
          setTournaments(tournamentsData);
        }
        
        setError(null);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Failed to load data. Please try again later.');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchData();
  }, []);
  
  // Handle form input changes
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'legsRequired' ? parseInt(value, 10) : value
    }));
  };
  
  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      // Validate form
      if (!formData.player1Id || !formData.player2Id) {
        setError('Please select both players');
        return;
      }
      
      if (formData.player1Id === formData.player2Id) {
        setError('Please select different players');
        return;
      }
      
      // Submit the form
      const response = await fetch('/api/games', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });
      
      if (!response.ok) {
        throw new Error('Failed to create game');
      }
      
      const game = await response.json();
      
      // Redirect to the new game page
      router.push(`/games/${game.id}`);
    } catch (err) {
      console.error('Error creating game:', err);
      setError('Failed to create game. Please try again.');
    }
  };
  
  return (
    <div className="container mx-auto px-4 py-8">
      <Head>
        <title>New Game | Dart Tournament App</title>
        <meta name="description" content="Create a new dart game" />
      </Head>
      
      <div className="mb-6">
        <Link href="/" className="text-blue-500 hover:text-blue-700 font-medium">
          ← Back to Dashboard
        </Link>
      </div>
      
      <div className="bg-white shadow-md rounded-lg p-6 mb-6">
        <h1 className="text-2xl font-bold mb-6">Create New Game</h1>
        
        {error && (
          <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6" role="alert">
            <p>{error}</p>
          </div>
        )}
        
        {isLoading ? (
          <p>Loading data...</p>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              {/* Player 1 Selection */}
              <div>
                <label className="block text-gray-700 font-medium mb-2" htmlFor="player1Id">
                  Player 1
                </label>
                <select
                  id="player1Id"
                  name="player1Id"
                  value={formData.player1Id}
                  onChange={handleInputChange}
                  className="w-full border rounded px-3 py-2"
                  required
                >
                  <option value="">Select Player 1</option>
                  {players.map(player => (
                    <option key={player.id} value={player.id}>
                      {player.name} {player.nickname ? `(${player.nickname})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              
              {/* Player 2 Selection */}
              <div>
                <label className="block text-gray-700 font-medium mb-2" htmlFor="player2Id">
                  Player 2
                </label>
                <select
                  id="player2Id"
                  name="player2Id"
                  value={formData.player2Id}
                  onChange={handleInputChange}
                  className="w-full border rounded px-3 py-2"
                  required
                >
                  <option value="">Select Player 2</option>
                  {players.map(player => (
                    <option key={player.id} value={player.id}>
                      {player.name} {player.nickname ? `(${player.nickname})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              
              {/* Board Selection (Optional) */}
              {boards.length > 0 && (
                <div>
                  <label className="block text-gray-700 font-medium mb-2" htmlFor="boardId">
                    Board (Optional)
                  </label>
                  <select
                    id="boardId"
                    name="boardId"
                    value={formData.boardId}
                    onChange={handleInputChange}
                    className="w-full border rounded px-3 py-2"
                  >
                    <option value="">Select Board</option>
                    {boards.map(board => (
                      <option key={board.id} value={board.id}>
                        {board.name} {board.status === 'available' ? '(Available)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              
              {/* Tournament Selection (Optional) */}
              {tournaments.length > 0 && (
                <div>
                  <label className="block text-gray-700 font-medium mb-2" htmlFor="tournamentId">
                    Tournament (Optional)
                  </label>
                  <select
                    id="tournamentId"
                    name="tournamentId"
                    value={formData.tournamentId}
                    onChange={handleInputChange}
                    className="w-full border rounded px-3 py-2"
                  >
                    <option value="">Select Tournament</option>
                    {tournaments.map(tournament => (
                      <option key={tournament.id} value={tournament.id}>
                        {tournament.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              
              {/* Legs Required */}
              <div>
                <label className="block text-gray-700 font-medium mb-2" htmlFor="legsRequired">
                  First to (Legs)
                </label>
                <select
                  id="legsRequired"
                  name="legsRequired"
                  value={formData.legsRequired}
                  onChange={handleInputChange}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                  <option value="5">5</option>
                  <option value="7">7</option>
                  <option value="9">9</option>
                </select>
              </div>
            </div>
            
            <div className="flex justify-end">
              <button
                type="submit"
                className="bg-blue-500 hover:bg-blue-600 text-white py-2 px-6 rounded font-medium"
              >
                Create Game
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
} 