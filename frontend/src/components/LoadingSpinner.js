import React from 'react';
import styles from '../styles/Components.module.css';

const LoadingSpinner = ({ size = 'medium', text = 'Loading...' }) => {
  const sizeClass = {
    small: styles.spinnerSmall,
    medium: styles.spinnerMedium,
    large: styles.spinnerLarge
  }[size] || styles.spinnerMedium;
  
  return (
    <div className={styles.spinnerContainer}>
      <div className={`${styles.spinner} ${sizeClass}`} />
      {text && <div className={styles.spinnerText}>{text}</div>}
    </div>
  );
};

export default LoadingSpinner; 