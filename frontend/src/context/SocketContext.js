import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import io from 'socket.io-client';

const SocketContext = createContext();

export function useSocket() {
  return useContext(SocketContext);
}

export function SocketProvider({ children }) {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [connectionError, setConnectionError] = useState(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [lastEventTimestamp, setLastEventTimestamp] = useState(0);
  const [missedEvents, setMissedEvents] = useState([]);

  // Initialize socket connection
  useEffect(() => {
    // Create socket connection
    const socketIo = io({
      path: '/api/socket',
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });

    setSocket(socketIo);

    // Set up event listeners
    socketIo.on('connect', () => {
      setIsConnected(true);
      setConnectionStatus('connected');
      setConnectionError(null);
      setReconnectAttempts(0);
      console.log('Socket connected with ID:', socketIo.id);
      
      // Check for missed events if reconnecting
      if (lastEventTimestamp > 0) {
        socketIo.emit('get_missed_events', { since: lastEventTimestamp });
      }
    });

    socketIo.on('disconnect', (reason) => {
      setIsConnected(false);
      setConnectionStatus('disconnected');
      console.log('Socket disconnected:', reason);
    });

    socketIo.on('connect_error', (error) => {
      setIsConnected(false);
      setConnectionStatus('error');
      setConnectionError(error.message);
      setReconnectAttempts((prev) => prev + 1);
      console.error('Socket connection error:', error);
    });

    socketIo.on('reconnect_attempt', (attemptNumber) => {
      setConnectionStatus('reconnecting');
      setReconnectAttempts(attemptNumber);
      console.log('Socket reconnection attempt:', attemptNumber);
    });

    socketIo.on('error', (error) => {
      console.error('Socket error:', error);
    });

    // Handle missed events
    socketIo.on('missed_events', (events) => {
      setMissedEvents(events);
      // Process missed events
      events.forEach(event => {
        if (event.type === 'game_state' && event.gameId) {
          socketIo.emit('join_game', { gameId: event.gameId });
        }
      });
    });

    // Update timestamp for tracking events
    const updateTimestamp = (event) => {
      setLastEventTimestamp(Date.now());
    };

    socketIo.on('game_state', updateTimestamp);
    socketIo.on('match:updated', updateTimestamp);
    socketIo.on('match:created', updateTimestamp);
    socketIo.on('match:deleted', updateTimestamp);
    socketIo.on('board:event', updateTimestamp);
    socketIo.on('gameUpdate', updateTimestamp);

    // Clean up on unmount
    return () => {
      socketIo.disconnect();
      socketIo.off('connect');
      socketIo.off('disconnect');
      socketIo.off('connect_error');
      socketIo.off('reconnect_attempt');
      socketIo.off('error');
      socketIo.off('missed_events');
      socketIo.off('game_state');
      socketIo.off('match:updated');
      socketIo.off('match:created');
      socketIo.off('match:deleted');
      socketIo.off('board:event');
      socketIo.off('gameUpdate');
    };
  }, [lastEventTimestamp]);

  // Handle reconnection manually
  const reconnect = useCallback(() => {
    if (socket) {
      socket.connect();
      setConnectionStatus('reconnecting');
    }
  }, [socket]);

  // Authenticate with the server
  const authenticate = useCallback((userId) => {
    if (socket && isConnected) {
      socket.emit('authenticate', { userId });
    }
  }, [socket, isConnected]);

  // Join a game room
  const joinGame = useCallback((gameId) => {
    if (socket && isConnected) {
      socket.emit('join_game', { gameId });
    }
  }, [socket, isConnected]);

  // Send a throw
  const sendThrow = useCallback((gameId, playerId, score, darts) => {
    if (socket && isConnected) {
      socket.emit('process_throw', { gameId, playerId, score, darts });
    }
  }, [socket, isConnected]);

  // Start a warmup
  const startWarmup = useCallback((gameId) => {
    if (socket && isConnected) {
      socket.emit('start_warmup', { gameId });
    }
  }, [socket, isConnected]);

  // Complete a warmup
  const completeWarmup = useCallback((gameId) => {
    if (socket && isConnected) {
      socket.emit('complete_warmup', { gameId });
    }
  }, [socket, isConnected]);

  // Set bull winner
  const setBullWinner = useCallback((gameId, winnerId) => {
    if (socket && isConnected) {
      socket.emit('set_bull_winner', { gameId, winnerId });
    }
  }, [socket, isConnected]);

  // Override a throw
  const overrideThrow = useCallback((gameId, throwId, score, darts, adminId) => {
    if (socket && isConnected) {
      socket.emit('override_throw', { gameId, throwId, score, darts, adminId });
    }
  }, [socket, isConnected]);

  // Get player stats
  const getPlayerStats = useCallback((gameId, playerId) => {
    if (socket && isConnected) {
      socket.emit('get_player_stats', { gameId, playerId });
    }
  }, [socket, isConnected]);

  // Force update game state
  const refreshGameState = useCallback((gameId) => {
    if (socket && isConnected) {
      socket.emit('get_game_state', { gameId });
    }
  }, [socket, isConnected]);

  // Listen for events
  const onGameState = useCallback((callback) => {
    if (socket) {
      socket.on('game_state', callback);
      return () => socket.off('game_state', callback);
    }
    return () => {};
  }, [socket]);

  const onPlayerStats = useCallback((callback) => {
    if (socket) {
      socket.on('player_stats', callback);
      return () => socket.off('player_stats', callback);
    }
    return () => {};
  }, [socket]);

  const onError = useCallback((callback) => {
    if (socket) {
      socket.on('error', callback);
      return () => socket.off('error', callback);
    }
    return () => {};
  }, [socket]);

  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
        connectionStatus,
        connectionError,
        reconnectAttempts,
        missedEvents,
        reconnect,
        authenticate,
        joinGame,
        sendThrow,
        startWarmup,
        completeWarmup,
        setBullWinner,
        overrideThrow,
        getPlayerStats,
        refreshGameState,
        onGameState,
        onPlayerStats,
        onError
      }}
    >
      {children}
    </SocketContext.Provider>
  );
}

export default SocketContext; 