import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { useSocket } from '../context/SocketContext';
import Scoreboard from '../components/Scoreboard';
import LoadingSpinner from '../components/LoadingSpinner';
import AdminOverridePanel from '../components/AdminOverridePanel';
import styles from '../styles/Game.module.css';

export default function GamePage() {
  const router = useRouter();
  const { boardId, matchId } = router.query;
  const { socket, isConnected } = useSocket();
  
  const [match, setMatch] = useState(null);
  const [board, setBoard] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showOverridePanel, setShowOverridePanel] = useState(false);
  
  // Fetch match data on component mount and when IDs change
  useEffect(() => {
    if (boardId && matchId) {
      fetchMatchData();
    } else if (boardId) {
      fetchBoardData();
    }
  }, [boardId, matchId]);
  
  // Set up socket listeners for real-time updates
  useEffect(() => {
    if (!socket || !matchId) return;
    
    const handleMatchUpdate = (updatedMatch) => {
      if (updatedMatch.id === parseInt(matchId)) {
        setMatch(updatedMatch);
      }
    };
    
    // Listen for match:updated event
    socket.on('match:updated', handleMatchUpdate);
    
    // Listen for gameUpdate event from the backend
    socket.on('gameUpdate', (data) => {
      // Check if this update is for our current match
      if (data.matchId === parseInt(matchId)) {
        // Update match data
        if (data.match) {
          setMatch(prevMatch => ({
            ...prevMatch,
            ...data.match
          }));
        }
        
        // Update player data if present
        if (data.players) {
          setMatch(prevMatch => ({
            ...prevMatch,
            players: data.players.map(updatedPlayer => {
              const existingPlayer = prevMatch.players.find(p => p.id === updatedPlayer.id);
              return existingPlayer ? { ...existingPlayer, ...updatedPlayer } : updatedPlayer;
            })
          }));
        }
        
        // Update throws if present
        if (data.throws) {
          setMatch(prevMatch => {
            const updatedPlayers = [...prevMatch.players];
            
            // Update player throws based on the data
            data.throws.forEach(throwData => {
              const playerIndex = updatedPlayers.findIndex(p => p.id === throwData.playerId);
              if (playerIndex !== -1) {
                if (throwData.isCurrentTurn) {
                  updatedPlayers[playerIndex].currentTurn = throwData.throws || [];
                } else {
                  updatedPlayers[playerIndex].history = throwData.throws || [];
                }
              }
            });
            
            return {
              ...prevMatch,
              players: updatedPlayers
            };
          });
        }
      }
    });
    
    return () => {
      socket.off('match:updated', handleMatchUpdate);
      socket.off('gameUpdate');
    };
  }, [socket, matchId]);
  
  const fetchMatchData = async () => {
    setIsLoading(true);
    setError('');
    
    try {
      const response = await fetch(`/api/games/${matchId}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch match data');
      }
      
      const data = await response.json();
      setMatch(data);
      
      // Also fetch board data
      const boardResponse = await fetch(`/api/boards/${boardId}`);
      
      if (!boardResponse.ok) {
        throw new Error('Failed to fetch board data');
      }
      
      const boardData = await boardResponse.json();
      setBoard(boardData);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };
  
  const fetchBoardData = async () => {
    setIsLoading(true);
    setError('');
    
    try {
      const response = await fetch(`/api/boards/${boardId}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch board data');
      }
      
      const data = await response.json();
      setBoard(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };
  
  const startNewMatch = async () => {
    setIsLoading(true);
    setError('');
    
    try {
      // Get all players
      const playersResponse = await fetch('/api/players');
      
      if (!playersResponse.ok) {
        throw new Error('Failed to fetch players');
      }
      
      const players = await playersResponse.json();
      
      // For demo, we'll just use the first two players
      // In a real app, you'd have a player selection UI
      const selectedPlayers = players.slice(0, 2);
      
      // Get settings
      const settingsResponse = await fetch('/api/settings');
      
      if (!settingsResponse.ok) {
        throw new Error('Failed to fetch settings');
      }
      
      const settings = await settingsResponse.json();
      
      // Create a new match
      const matchResponse = await fetch('/api/games', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          boardId: parseInt(boardId),
          mode: 'x01',
          players: selectedPlayers,
          legsToWin: 3,
          settings: settings.game_defaults.x01
        }),
      });
      
      if (!matchResponse.ok) {
        throw new Error('Failed to create match');
      }
      
      const newMatch = await matchResponse.json();
      
      // Redirect to the new match
      router.push(`/game?boardId=${boardId}&matchId=${newMatch.id}`);
    } catch (err) {
      setError(err.message);
      setIsLoading(false);
    }
  };
  
  const handleCorrection = async (throwId, segment, score) => {
    if (!matchId) return;
    
    try {
      const response = await fetch(`/api/games/${matchId}/throws/${throwId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          segment,
          score
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to correct throw');
      }
    } catch (err) {
      setError(err.message);
    }
  };
  
  const handlePlayerSwitch = async () => {
    if (!matchId) return;
    
    try {
      const response = await fetch(`/api/games/${matchId}/switch-player`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        throw new Error('Failed to switch player');
      }
    } catch (err) {
      setError(err.message);
    }
  };
  
  // Handle match update from override panel
  const handleOverrideUpdate = (updatedMatch) => {
    if (updatedMatch) {
      setMatch(updatedMatch);
    }
  };
  
  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingContainer}>
          <LoadingSpinner size="large" text="Loading match data..." />
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.errorContainer}>
          <div className={styles.errorTitle}>Error</div>
          <div className={styles.errorMessage}>{error}</div>
          <Link href="/overview" className={styles.backButton}>
            Back to Overview
          </Link>
        </div>
      </div>
    );
  }
  
  return (
    <div className={styles.container}>
      <Head>
        <title>
          {match 
            ? `${match.mode} Match - ${match.players.map(p => p.name).join(' vs ')}`
            : 'Dart Scoring System'}
        </title>
        <meta name="description" content="Dart scoring system match view" />
      </Head>
      
      <header className={styles.header}>
        <Link href="/overview" className={styles.backLink}>
          &larr; Back to Overview
        </Link>
        
        <div className={styles.boardInfo}>
          {board && (
            <div className={styles.boardName}>
              {board.name}
              <span className={`${styles.boardStatus} ${styles[board.status]}`}>
                {board.status}
              </span>
            </div>
          )}
        </div>
      </header>
      
      <main className={styles.main}>
        {!isConnected && (
          <div className={styles.connectionWarning}>
            Not connected to server. Match updates may be delayed.
          </div>
        )}
        
        {match ? (
          <>
            {showOverridePanel && (
              <AdminOverridePanel 
                matchId={match.id} 
                players={match.players} 
                onUpdate={handleOverrideUpdate}
              />
            )}
            
            <Scoreboard match={match} />
            
            <div className={styles.actionButtons}>
              <button 
                onClick={handlePlayerSwitch}
                className={styles.actionButton}
                disabled={match.state === 'completed'}
              >
                Manual Player Switch
              </button>
              <button 
                onClick={() => setShowOverridePanel(!showOverridePanel)}
                className={`${styles.actionButton} ${showOverridePanel ? styles.activeButton : ''}`}
                disabled={match.state === 'completed'}
              >
                {showOverridePanel ? 'Hide Override Controls' : 'Show Override Controls'}
              </button>
              <Link 
                href={`/admin?boardId=${boardId}`}
                className={styles.adminButton}
              >
                Admin Options
              </Link>
            </div>
          </>
        ) : (
          <div className={styles.noMatch}>
            <h2>No Active Match</h2>
            {board && board.status === 'online' && (
              <button 
                onClick={startNewMatch}
                className={styles.startButton}
                disabled={isLoading}
              >
                Start New Match
              </button>
            )}
            {board && board.status !== 'online' && (
              <div className={styles.offlineWarning}>
                Board is offline. Please connect the board before starting a match.
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
} 