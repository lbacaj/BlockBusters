// This is a debug script to test the SaveScore endpoint

async function testSaveScore() {
  try {
    // Get anti-forgery token
    const tokenElement = document.querySelector('input[name="__RequestVerificationToken"]');
    if (!tokenElement) {
      console.error('Anti-forgery token not found');
      
      // Check all form elements on the page
      const allFormInputs = document.querySelectorAll('input');
      console.log('All form inputs on page:', Array.from(allFormInputs).map(i => `${i.name}=${i.value}`));
      
      return null;
    }
    
    const token = tokenElement.value;
    console.log('Using token:', token);
    
    // Sample data
    const playerName = "TestPlayer";
    const score = 500;
    
    const requestBody = JSON.stringify({
      PlayerName: playerName,
      Score: score
    });
    
    console.log('Request body:', requestBody);
    
    // Make the API call
    console.log('Sending request to /Index?handler=SaveScore');
    const response = await fetch('/Index?handler=SaveScore', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'RequestVerificationToken': token,
      },
      body: requestBody
    });
    
    console.log('Response status:', response.status);
    console.log('Response status text:', response.statusText);
    
    // Try to log response headers
    const responseHeaders = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });
    console.log('Response headers:', responseHeaders);
    
    if (!response.ok) {
      throw new Error(`Error saving score: ${response.status}`);
    }
    
    const result = await response.json();
    console.log('Save score successful!', result);
    return result;
  } catch (error) {
    console.error('Failed to save score:', error);
    return null;
  }
}

// Add a button to the page to trigger the test
function addTestButton() {
  const button = document.createElement('button');
  button.textContent = 'Test Save Score';
  button.style.position = 'fixed';
  button.style.bottom = '10px';
  button.style.right = '10px';
  button.style.zIndex = '9999';
  button.style.padding = '10px';
  button.style.backgroundColor = '#e57373';
  button.style.color = 'white';
  button.style.border = 'none';
  button.style.borderRadius = '5px';
  button.style.cursor = 'pointer';
  
  button.addEventListener('click', async () => {
    console.log('Testing save score...');
    const result = await testSaveScore();
    if (result) {
      alert('Score saved successfully!');
    } else {
      alert('Failed to save score. Check console for details.');
    }
  });
  
  document.body.appendChild(button);
}

// Run when the page loads
document.addEventListener('DOMContentLoaded', addTestButton);
