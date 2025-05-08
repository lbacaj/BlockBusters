// Simple script to test the leaderboard functionality
function forceGameOver() {
  // Make sure we have access to the game functions
  if (typeof window.score === 'undefined') {
    console.log('Making global variables accessible...');
    window.score = 500;
    if (typeof window.toggleGameOverOverlay === 'undefined') {
      // Find the game over overlay element
      const gameOverOverlay = document.getElementById('gameOverOverlay');
      if (gameOverOverlay) {
        gameOverOverlay.style.display = 'flex';
        
        // Update the score display
        const finalScoreElement = document.getElementById('finalScore');
        if (finalScoreElement) {
          finalScoreElement.textContent = `Final Score: 500`;
        }
        
        // Create visual effects
        if (typeof window.createGameOverEffect === 'function') {
          window.createGameOverEffect();
        }
      } else {
        console.error('Game over overlay not found');
      }
    } else {
      // Call the game's function directly
      window.toggleGameOverOverlay(true);
    }
  } else {
    // The game variables are accessible
    window.score = 500;
    window.toggleGameOverOverlay(true);
  }
  
  console.log('Test: Game over triggered with score 500');
}
