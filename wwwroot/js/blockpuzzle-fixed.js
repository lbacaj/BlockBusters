// Function to save score to server
async function saveScore(playerName, score) {
  try {
    // Get anti-forgery token
    const tokenElement = document.querySelector('input[name="__RequestVerificationToken"]');
    if (!tokenElement) {
      console.error('Anti-forgery token not found');
      return null;
    }
    
    const token = tokenElement.value;
    console.log('Saving score with token:', token);
    
    const response = await fetch('/Index?handler=SaveScore', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'RequestVerificationToken': token
      },
      body: JSON.stringify({
        PlayerName: playerName,
        Score: score
      })
    });
    
    if (!response.ok) {
      throw new Error(`Error saving score: ${response.status}`);
    }
    
    // Parse and return updated leaderboard
    const updatedLeaderboard = await response.json();
    leaderboardData = updatedLeaderboard;
    return updatedLeaderboard;
  } catch (error) {
    console.error('Failed to save score:', error);
    return null;
  }
}
