import { useState, useEffect } from 'react';
import Link from 'next/link';
import Head from 'next/head';

export default function Home() {
  const [activeGames, setActiveGames] = useState([]);
  const [upcomingGames, setUpcomingGames] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  
  useEffect(() => {
    // Fetch active games
    const fetchGames = async () => {
      try {
        setIsLoading(true);
        const activeResponse = await fetch('/api/games?status=in_progress');
        const pendingResponse = await fetch('/api/games?status=pending');
        
        if (!activeResponse.ok || !pendingResponse.ok) {
          throw new Error('Failed to fetch games');
        }
        
        const activeGamesData = await activeResponse.json();
        const pendingGamesData = await pendingResponse.json();
        
        setActiveGames(activeGamesData);
        setUpcomingGames(pendingGamesData);
        setError(null);
      } catch (err) {
        console.error('Error fetching games:', err);
        setError('Failed to load games. Please try again later.');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchGames();
    
    // Refresh games every 30 seconds
    const interval = setInterval(fetchGames, 30000);
    
    return () => clearInterval(interval);
  }, []);
  
  return (
    <div className="container mx-auto px-4 py-8">
      <Head>
        <title>Dart Tournament App</title>
        <meta name="description" content="Real-time dart tournament application" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      
      <header className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Dart Tournament Dashboard</h1>
        <div className="flex space-x-4">
          <Link href="/games/new" className="bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded">
            New Game
          </Link>
          <Link href="/players" className="bg-green-500 hover:bg-green-600 text-white py-2 px-4 rounded">
            Players
          </Link>
          <Link href="/tournaments" className="bg-purple-500 hover:bg-purple-600 text-white py-2 px-4 rounded">
            Tournaments
          </Link>
        </div>
      </header>
      
      {error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6" role="alert">
          <p>{error}</p>
        </div>
      )}
      
      <main>
        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-4">Active Games</h2>
          {isLoading ? (
            <p>Loading active games...</p>
          ) : activeGames.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {activeGames.map((game) => (
                <div key={game.id} className="bg-white shadow rounded-lg p-4 border-l-4 border-green-500">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-semibold">Game #{game.id}</span>
                    <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded">In Progress</span>
                  </div>
                  <div className="mb-2">
                    <div className="flex justify-between">
                      <span>{game.player1_name}</span>
                      <span className="font-bold">{game.player1_legs}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>{game.player2_name}</span>
                      <span className="font-bold">{game.player2_legs}</span>
                    </div>
                  </div>
                  <div className="text-sm text-gray-500 mb-3">
                    {game.board_name ? `Board: ${game.board_name}` : 'No board assigned'}
                  </div>
                  <Link href={`/games/${game.id}`} className="block text-center bg-blue-500 hover:bg-blue-600 text-white py-1 px-4 rounded text-sm">
                    View Game
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">No active games at the moment.</p>
          )}
        </section>
        
        <section>
          <h2 className="text-2xl font-bold mb-4">Upcoming Games</h2>
          {isLoading ? (
            <p>Loading upcoming games...</p>
          ) : upcomingGames.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {upcomingGames.map((game) => (
                <div key={game.id} className="bg-white shadow rounded-lg p-4 border-l-4 border-blue-500">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-semibold">Game #{game.id}</span>
                    <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">Pending</span>
                  </div>
                  <div className="mb-2">
                    <div className="flex justify-between">
                      <span>{game.player1_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>{game.player2_name}</span>
                    </div>
                  </div>
                  <div className="text-sm text-gray-500 mb-3">
                    {game.board_name ? `Board: ${game.board_name}` : 'No board assigned'}
                  </div>
                  <Link href={`/games/${game.id}`} className="block text-center bg-blue-500 hover:bg-blue-600 text-white py-1 px-4 rounded text-sm">
                    Start Game
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">No upcoming games scheduled.</p>
          )}
        </section>
      </main>
    </div>
  );
} 