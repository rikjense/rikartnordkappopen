import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useSocket } from '../context/SocketContext';
import OverviewGrid from '../components/OverviewGrid';
import LoadingSpinner from '../components/LoadingSpinner';
import styles from '../styles/Overview.module.css';

export default function OverviewPage() {
  const { socket, isConnected } = useSocket();
  const [boards, setBoards] = useState([]);
  const [matches, setMatches] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Fetch data on component mount
  useEffect(() => {
    fetchData();
    
    const intervalId = setInterval(() => {
      if (!isConnected) {
        fetchData();
      }
    }, 30000); // Refresh every 30 seconds if socket is disconnected
    
    return () => clearInterval(intervalId);
  }, [isConnected]);
  
  // Set up socket listeners for real-time updates
  useEffect(() => {
    if (!socket) return;
    
    const handleBoardUpdated = (updatedBoard) => {
      setBoards(prev => 
        prev.map(board => board.id === updatedBoard.id ? updatedBoard : board)
      );
    };
    
    const handleBoardCreated = (newBoard) => {
      setBoards(prev => [...prev, newBoard]);
    };
    
    const handleBoardDeleted = (boardId) => {
      setBoards(prev => prev.filter(board => board.id !== boardId));
    };
    
    const handleMatchUpdated = (updatedMatch) => {
      setMatches(prev => {
        const exists = prev.some(match => match.id === updatedMatch.id);
        
        if (exists) {
          return prev.map(match => 
            match.id === updatedMatch.id ? updatedMatch : match
          );
        } else {
          return [...prev, updatedMatch];
        }
      });
    };
    
    const handleMatchCreated = (newMatch) => {
      setMatches(prev => [...prev, newMatch]);
    };
    
    const handleMatchDeleted = (matchId) => {
      setMatches(prev => prev.filter(match => match.id !== matchId));
    };
    
    // Listen for gameUpdate events
    const handleGameUpdate = (data) => {
      if (data.matchId) {
        // Find the existing match
        setMatches(prev => {
          const matchIndex = prev.findIndex(m => m.id === data.matchId);
          
          // If match exists, update it
          if (matchIndex !== -1) {
            const updatedMatches = [...prev];
            
            // Update match data if present
            if (data.match) {
              updatedMatches[matchIndex] = {
                ...updatedMatches[matchIndex],
                ...data.match
              };
            }
            
            // Update player data if present
            if (data.players) {
              updatedMatches[matchIndex] = {
                ...updatedMatches[matchIndex],
                players: data.players.map(updatedPlayer => {
                  const existingPlayer = updatedMatches[matchIndex].players.find(p => p.id === updatedPlayer.id);
                  return existingPlayer ? { ...existingPlayer, ...updatedPlayer } : updatedPlayer;
                })
              };
            }
            
            return updatedMatches;
          }
          
          return prev;
        });
      }
    };
    
    socket.on('board:updated', handleBoardUpdated);
    socket.on('board:created', handleBoardCreated);
    socket.on('board:deleted', handleBoardDeleted);
    socket.on('match:updated', handleMatchUpdated);
    socket.on('match:created', handleMatchCreated);
    socket.on('match:deleted', handleMatchDeleted);
    socket.on('gameUpdate', handleGameUpdate);
    
    return () => {
      socket.off('board:updated', handleBoardUpdated);
      socket.off('board:created', handleBoardCreated);
      socket.off('board:deleted', handleBoardDeleted);
      socket.off('match:updated', handleMatchUpdated);
      socket.off('match:created', handleMatchCreated);
      socket.off('match:deleted', handleMatchDeleted);
      socket.off('gameUpdate', handleGameUpdate);
    };
  }, [socket]);
  
  const fetchData = async () => {
    setIsLoading(true);
    setError('');
    
    try {
      // Fetch boards
      const boardsResponse = await fetch('/api/boards');
      
      if (!boardsResponse.ok) {
        throw new Error('Failed to fetch boards');
      }
      
      const boardsData = await boardsResponse.json();
      setBoards(boardsData);
      
      // Fetch active matches
      const matchesResponse = await fetch('/api/games?state=active,pending,warmup,playing');
      
      if (!matchesResponse.ok) {
        throw new Error('Failed to fetch matches');
      }
      
      const matchesData = await matchesResponse.json();
      setMatches(matchesData);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <div className={styles.container}>
      <Head>
        <title>Overview | Dart Scoring System</title>
        <meta name="description" content="Overview of all dart boards and matches" />
      </Head>
      
      <header className={styles.header}>
        <h1 className={styles.title}>Boards Overview</h1>
        
        <div className={styles.actions}>
          <Link href="/admin" className={styles.adminLink}>
            Admin Dashboard
          </Link>
          <Link href="/stream" className={styles.streamLink} target="_blank">
            Open Stream View
          </Link>
        </div>
      </header>
      
      <main className={styles.main}>
        {!isConnected && (
          <div className={styles.connectionWarning}>
            Not connected to server. Updates may be delayed.
          </div>
        )}
        
        {error && (
          <div className={styles.error}>
            Error: {error}
            <button onClick={fetchData} className={styles.retryButton}>
              Retry
            </button>
          </div>
        )}
        
        {isLoading ? (
          <div className={styles.loadingContainer}>
            <LoadingSpinner size="large" text="Loading boards..." />
          </div>
        ) : boards.length === 0 ? (
          <div className={styles.noBoards}>
            <p>No boards added yet.</p>
            <Link href="/admin" className={styles.addBoardLink}>
              Go to Admin Dashboard to add boards
            </Link>
          </div>
        ) : (
          <OverviewGrid boards={boards} matches={matches} />
        )}
      </main>
    </div>
  );
} 