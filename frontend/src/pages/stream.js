import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useSocket } from '../context/SocketContext';
import StreamOverlay from '../components/StreamOverlay';
import LoadingSpinner from '../components/LoadingSpinner';
import styles from '../styles/Stream.module.css';

export default function StreamPage() {
  const router = useRouter();
  const { transparent } = router.query;
  const { socket, isConnected } = useSocket();
  
  const [matches, setMatches] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Fetch matches on component mount
  useEffect(() => {
    fetchMatches();
    
    const intervalId = setInterval(() => {
      if (!isConnected) {
        fetchMatches();
      }
    }, 5000); // Refresh every 5 seconds if socket is disconnected
    
    return () => clearInterval(intervalId);
  }, [isConnected]);
  
  // Set up socket listeners for real-time updates
  useEffect(() => {
    if (!socket) return;
    
    const handleMatchUpdated = (updatedMatch) => {
      setMatches(prev => {
        const exists = prev.some(match => match.id === updatedMatch.id);
        
        if (exists) {
          return prev.map(match => 
            match.id === updatedMatch.id ? updatedMatch : match
          );
        } else if (updatedMatch.state !== 'completed' && updatedMatch.state !== 'finished') {
          return [...prev, updatedMatch].slice(0, 4); // Keep up to 4 matches
        } else {
          return prev;
        }
      });
    };
    
    const handleMatchCreated = (newMatch) => {
      setMatches(prev => {
        if (prev.length >= 4) {
          return [newMatch, ...prev.slice(0, 3)]; // Replace oldest match
        } else {
          return [...prev, newMatch];
        }
      });
    };
    
    const handleMatchDeleted = (matchId) => {
      setMatches(prev => prev.filter(match => match.id !== matchId));
    };
    
    // Handle real-time game updates
    const handleGameUpdate = (data) => {
      if (data.matchId) {
        setMatches(prev => {
          // Find if we're already showing this match
          const matchIndex = prev.findIndex(m => m.id === data.matchId);
          
          // If we have this match, update it
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
    
    socket.on('match:updated', handleMatchUpdated);
    socket.on('match:created', handleMatchCreated);
    socket.on('match:deleted', handleMatchDeleted);
    socket.on('gameUpdate', handleGameUpdate);
    
    return () => {
      socket.off('match:updated', handleMatchUpdated);
      socket.off('match:created', handleMatchCreated);
      socket.off('match:deleted', handleMatchDeleted);
      socket.off('gameUpdate', handleGameUpdate);
    };
  }, [socket]);
  
  const fetchMatches = async () => {
    setIsLoading(true);
    
    try {
      // Fetch active matches
      const response = await fetch('/api/games?state=active,playing&limit=4');
      
      if (!response.ok) {
        throw new Error('Failed to fetch matches');
      }
      
      const data = await response.json();
      setMatches(data);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };
  
  const containerClasses = [
    styles.streamPageContainer,
    transparent === 'true' ? styles.transparentBg : ''
  ].filter(Boolean).join(' ');
  
  return (
    <div className={containerClasses}>
      <Head>
        <title>Stream View | Dart Scoring System</title>
        <meta name="description" content="Stream overlay for dart scoring" />
      </Head>
      
      {isLoading && matches.length === 0 ? (
        <div className={styles.loadingContainer}>
          <LoadingSpinner size="medium" text="Loading matches..." />
        </div>
      ) : error ? (
        <div className={styles.errorContainer}>
          <div className={styles.errorText}>Error: {error}</div>
        </div>
      ) : matches.length === 0 ? (
        <div className={styles.noMatchesContainer}>
          <div className={styles.noMatchesText}>No active matches</div>
        </div>
      ) : (
        <StreamOverlay matches={matches} />
      )}
    </div>
  );
} 