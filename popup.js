// Global variable to store the base URL
let baseUrl = 'https://api.pipecdn.app'; // Set fallback as the default

// Function to fetch the base URL
async function fetchBaseUrl() {
  console.log('[INFO] Fetching base URL...');
  try {
    const response = await fetchWithRetry('https://pipe-network-backend.pipecanary.workers.dev/api/getBaseUrl');
    if (!response.ok) throw new Error('Failed to fetch base URL');
    const data = await response.json();
    console.log('[INFO] Fetched base URL successfully:', data.baseUrl);
    return data.baseUrl;
  } catch (error) {
    console.error('[ERROR] Failed to fetch base URL:', error);
    return baseUrl; // Fallback URL
  }
}

// Function to fetch a URL with retry logic
async function fetchWithRetry(url, options = {}, retries = 3, delay = 1000) {
  console.log(`[INFO] Fetching URL with retry logic: ${url}`);
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
      console.log(`[INFO] Request to ${url} succeeded on attempt ${attempt + 1}`);
      return response;
    } catch (error) {
      console.warn(`[WARN] Attempt ${attempt + 1} failed for ${url}:`, error.message);
      if (attempt < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  console.error('[ERROR] All retry attempts failed for URL:', url);
  throw new Error('All retry attempts failed');
}

// Ensure base URL is initialized
async function ensureBaseUrl() {
  if (!baseUrl || baseUrl === 'https://api.pipecdn.app') {
    console.log('[INFO] Initializing base URL...');
    baseUrl = await fetchBaseUrl();
    console.log('[INFO] Base URL initialized to:', baseUrl);
  }
}

// Helper function to retrieve token from storage
async function getToken() {
  console.log('[INFO] Retrieving token...');
  return new Promise((resolve, reject) => {
    chrome.storage.local.get("token", (data) => {
      if (chrome.runtime.lastError) {
        console.error('[ERROR] Failed to retrieve token:', chrome.runtime.lastError);
        return reject(chrome.runtime.lastError);
      }
      console.log('[INFO] Token retrieved:', data.token);
      resolve(data.token);
    });
  });
}

// Function to show the authentication section
function showAuthSection() {
  console.log('[INFO] Switching to authentication section...');
  document.getElementById("login-container").style.display = "block";
  document.getElementById("test-container").style.display = "none";
}

// Function to show the dashboard
function showDashboard() {
  console.log('[INFO] Switching to dashboard...');
  document.getElementById("login-container").style.display = "none";
  document.getElementById("test-container").style.display = "flex";
}

// Logout function
async function logout(e) {
  if (e) e.preventDefault();
  console.log('[INFO] Logging out user...');
  try {
    await new Promise((resolve, reject) => {
      chrome.storage.local.clear(() => {
        if (chrome.runtime.lastError) {
          console.error('[ERROR] Failed to clear storage during logout:', chrome.runtime.lastError);
          return reject(chrome.runtime.lastError);
        }
        resolve();
      });
    });
    showAuthSection();
    console.log('[INFO] User logged out successfully.');
  } catch (error) {
    console.error('[ERROR] Logout failed:', error);
  }
}

// Login function
async function login() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  console.log('[INFO] Logging in user with email:', email);
  try {
    await ensureBaseUrl();
    const response = await fetch(`${baseUrl}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data.token) {
        console.log('[INFO] Login successful. Token received.');
        await chrome.storage.local.set({ token: data.token });
        showDashboard();
        try {
          await fetchPoints();
        } catch (error) {
          console.error('[ERROR] Error fetching points after login:', error);
          alert('Points could not be fetched. Please try again later.');
        }
      } else {
        console.warn('[WARN] Login response did not include a token.');
        alert('Login failed! Please try again.');
      }
    } else if (response.status === 401) {
      console.warn('[WARN] Invalid login credentials.');
      alert('Invalid credentials. Please check your email and password.');
    } else {
      const errorText = await response.text();
      console.error('[ERROR] Login error response:', errorText);
      alert('An unexpected error occurred. Please try again later.');
    }
  } catch (error) {
    console.error('[ERROR] Login failed:', error);
    alert('Network error. Please check your connection and try again.');
  }
}

// Fetch points function
async function fetchPoints() {
  console.log('[INFO] Fetching points...');
  try {
    await ensureBaseUrl();
    const token = await getToken();

    if (!token) {
      console.warn('[WARN] No token found while fetching points.');
      return;
    }

    const response = await fetch(`${baseUrl}/api/points`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.ok) {
      const data = await response.json();
      document.getElementById("points").innerText = data.points;
      console.log('[INFO] Points fetched successfully:', data.points);
    } else {
      console.error(`[ERROR] Failed to fetch points. Status: ${response.status}`);
    }
  } catch (error) {
    console.error('[ERROR] Error fetching points:', error);
  }
}

// Initialization logic on DOMContentLoaded
document.addEventListener("DOMContentLoaded", async () => {
  console.log('[INFO] Initializing application...');
  await ensureBaseUrl();

  chrome.storage.local.get(["token", "username"], (result) => {
    if (result.token) {
      console.log('[INFO] User is logged in. Showing dashboard.');
      showDashboard();
      fetchPoints();
    } else {
      console.log('[INFO] No token found. Showing authentication section.');
      showAuthSection();
    }
  });

  document.getElementById("login-btn").addEventListener("click", login);
  document.getElementById("logout-btn").addEventListener("click", logout);
  console.log('[INFO] Event listeners initialized.');
});
