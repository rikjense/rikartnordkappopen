import React from 'react';
import { useSocket } from '../context/SocketContext';
import ConnectionStatus from './ConnectionStatus';

const SocketConnectionStatus = () => {
  const { 
    connectionStatus, 
    connectionError, 
    reconnect 
  } = useSocket();

  return (
    <ConnectionStatus 
      status={connectionStatus}
      errorMessage={connectionError}
      onReconnect={reconnect}
    />
  );
};

export default SocketConnectionStatus; 