import React from 'react';
import styles from '../styles/Components.module.css';

const CheckoutSuggestion = ({ score, dartsRemaining = 3, showSuggestions = true }) => {
  if (!showSuggestions || score > 170 || score <= 0) {
    return null;
  }

  // Common checkout suggestions (simplified version)
  const getCheckoutSuggestion = (remainingScore, darts) => {
    // Only show suggestion if player can check out with remaining darts
    if (darts === 1) {
      // Only possible checkout with 1 dart is a double
      if (remainingScore <= 40 && remainingScore % 2 === 0) {
        return [`D${remainingScore / 2}`];
      }
      return null;
    }
    
    if (darts === 2) {
      // Common 2-dart checkouts
      const twoPartCheckouts = {
        50: ['Bull'],
        40: ['D20'],
        38: ['D19'],
        36: ['D18'],
        34: ['D17'],
        32: ['D16'],
        30: ['D15'],
        28: ['D14'],
        26: ['D13'],
        24: ['D12'],
        22: ['D11'],
        20: ['D10'],
        18: ['D9'],
        16: ['D8'],
        14: ['D7'],
        12: ['D6'],
        10: ['D5'],
        8: ['D4'],
        6: ['D3'],
        4: ['D2'],
        2: ['D1']
      };
      
      // Check if we have a direct double/bull finish
      if (twoPartCheckouts[remainingScore]) {
        return twoPartCheckouts[remainingScore];
      }
      
      // Calculate a two-dart finish
      if (remainingScore <= 110) {
        for (let i = Math.min(remainingScore - 2, 60); i >= 1; i--) {
          const remaining = remainingScore - i;
          if (remaining % 2 === 0 && remaining <= 40) {
            return [getSegmentForScore(i), `D${remaining / 2}`];
          }
        }
      }
    }
    
    if (darts === 3) {
      // Common 3-dart checkouts for common combinations
      if (remainingScore === 170) return ['T20', 'T20', 'Bull'];
      if (remainingScore === 167) return ['T20', 'T19', 'Bull'];
      if (remainingScore === 164) return ['T20', 'T18', 'Bull'];
      if (remainingScore === 161) return ['T20', 'T17', 'Bull'];
      if (remainingScore === 160) return ['T20', 'T20', 'D20'];
      
      // For other scores, calculate a simple three-dart finish
      // Target large treble first, then adjust
      const firstDart = 'T20'; // Default to T20 as first dart
      const firstDartScore = 60;
      
      // Calculate what's left after first dart
      const remaining = remainingScore - firstDartScore;
      
      // Get 2-dart checkout for remainder
      const twoPartFinish = getCheckoutSuggestion(remaining, 2);
      if (twoPartFinish) {
        return [firstDart, ...twoPartFinish];
      }
    }
    
    return null;
  };
  
  // Helper to get the segment notation for a score
  const getSegmentForScore = (score) => {
    if (score === 50) return 'Bull';
    if (score === 25) return '25';
    
    if (score > 40) {
      // Must be a treble
      return `T${Math.floor(score / 3)}`;
    } else if (score > 20) {
      // Must be a double
      return `D${Math.floor(score / 2)}`;
    } else {
      // Single
      return `${score}`;
    }
  };
  
  const suggestion = getCheckoutSuggestion(score, dartsRemaining);
  
  if (!suggestion) {
    return null;
  }
  
  return (
    <div className={styles.checkoutSuggestion}>
      <h4 className={styles.checkoutTitle}>Checkout Suggestion</h4>
      <div className={styles.checkoutPath}>
        {suggestion.map((dart, index) => (
          <span key={index} className={styles.checkoutDart}>
            {dart}{index < suggestion.length - 1 ? ' → ' : ''}
          </span>
        ))}
      </div>
    </div>
  );
};

export default CheckoutSuggestion; 