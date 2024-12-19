export async function fetchBaseUrl() {
  try {
    const response = await fetch('https://new-backend-api.com/getBaseUrl');
    if (!response.ok) throw new Error('Failed to fetch base URL');
    const data = await response.json();
    return data.baseUrl;
  } catch (error) {
    console.error('Error fetching base URL:', error);
    return 'https://api.pipecdn.app'; // Fallback URL
  }
}

// Function to fetch a URL with retry logic
export async function fetchWithRetry(url, options = {}, retries = 3, delay = 1000) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
      return response;
    } catch (error) {
      console.error(`Attempt ${attempt + 1} failed:`, error);
      if (attempt < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw new Error('All retry attempts failed');
} 