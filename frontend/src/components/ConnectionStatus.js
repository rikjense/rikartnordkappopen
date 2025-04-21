import React from 'react';
import styles from '../styles/Components.module.css';
import Tooltip from './Tooltip';

const ConnectionStatus = ({ status, errorMessage, onReconnect }) => {
  const getStatusClass = () => {
    switch (status) {
      case 'connected':
        return styles.connected;
      case 'disconnected':
        return styles.disconnected;
      case 'reconnecting':
        return styles.reconnecting;
      case 'error':
        return styles.error;
      case 'failed':
        return styles.failed;
      default:
        return styles.disconnected;
    }
  };

  const getStatusLabel = () => {
    switch (status) {
      case 'connected':
        return 'Connected';
      case 'disconnected':
        return 'Disconnected';
      case 'reconnecting':
        return 'Reconnecting...';
      case 'error':
        return 'Connection Error';
      case 'failed':
        return 'Connection Failed';
      default:
        return 'Disconnected';
    }
  };

  return (
    <div className={styles.connectionStatus}>
      <div className={`${styles.connectionStatusDot} ${getStatusClass()}`}></div>
      <span className={styles.connectionStatusLabel}>{getStatusLabel()}</span>
      
      {errorMessage && status !== 'connected' && (
        <div className={styles.tooltipContainer}>
          <div className={styles.connectionError}>!</div>
          <Tooltip text={errorMessage} />
        </div>
      )}
      
      {status === 'disconnected' && onReconnect && (
        <button 
          className={styles.reconnectButton}
          onClick={onReconnect}
        >
          Reconnect
        </button>
      )}
    </div>
  );
};

export default ConnectionStatus; 