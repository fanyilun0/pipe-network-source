// Global variable to store the base URL
let baseUrl = null; // Initially null so ensureBaseUrl() will fetch it.

// Function to fetch the base URL from the backend
async function fetchBaseUrl() {
  try {
    const response = await fetchWithRetry('https://pipe-network-backend.pipecanary.workers.dev/api/getBaseUrl');
    const data = await response.json();
    if (data && data.baseUrl) {
      return data.baseUrl;
    } else {
      console.warn('No baseUrl provided by backend, using fallback.');
      return 'https://api.pipecdn.app';
    }
  } catch (error) {
    console.error('Error fetching base URL:', error);
    return 'https://api.pipecdn.app'; // Fallback URL
  }
}

// Ensure base URL is initialized
async function ensureBaseUrl() {
  if (!baseUrl) {
    baseUrl = await fetchBaseUrl();
    console.log('Base URL set to:', baseUrl);
  }
}

// Function to fetch a URL with retry logic
async function fetchWithRetry(url, options = {}, retries = 3, delay = 1000) {
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

// Token retrieval helper
async function getToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["token"], (data) => {
      resolve(data.token || null);
    });
  });
}

// Function to perform node testing
async function runNodeTests() {
  await ensureBaseUrl();
  try {
    const response = await fetchWithRetry(`${baseUrl}/api/nodes`);
    const nodes = await response.json();

    for (const node of nodes) {
      const latency = await testNodeLatency(node);
      console.log(`Node ${node.node_id} (${node.ip}) latency: ${latency}ms`);
      await reportTestResult(node, latency);
    }

    console.log("All node tests completed.");
  } catch (error) {
    console.error("Error running node tests:", error);
  }
}

// Function to test the latency of a single node
async function testNodeLatency(node) {
  const start = Date.now();
  const timeout = 5000;

  try {
    await Promise.race([
      fetch(`http://${node.ip}`, { mode: 'no-cors' }), // Simple connectivity check
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeout)),
    ]);
    return Date.now() - start;
  } catch (error) {
    console.error(`Node ${node.node_id} latency test failed:`, error);
    return -1;
  }
}

// Function to report a node's test result to the backend
async function reportTestResult(node, latency) {
  const token = await getToken();
  if (!token) {
    console.warn("No token found. Skipping result reporting.");
    return;
  }

  try {
    const response = await fetch(`${baseUrl}/api/test`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        node_id: node.node_id,
        ip: node.ip,
        latency: latency,
        status: latency > 0 ? "online" : "offline"
      })
    });

    if (response.ok) {
      console.log(`Reported result for node ${node.node_id}.`);
    } else {
      console.error(`Failed to report result for node ${node.node_id}:`, response.status);
    }
  } catch (error) {
    console.error(`Error reporting result for node ${node.node_id}:`, error);
  }
}

// Function to check for rewards and notify the user
async function checkForRewards() {
  await ensureBaseUrl();
  const token = await getToken();
  if (!token) {
    console.warn("No token found. Skipping rewards check.");
    return;
  }

  try {
    const response = await fetch(`${baseUrl}/api/rewards`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.ok) {
      const data = await response.json();
      if (Object.keys(data).length > 0) {
        showNotification(`Earn more rewards points! Visit: ${data.link}`, data.link);
      } else {
        console.log("No rewards available at the moment.");
      }
    } else {
      console.warn("Failed to fetch rewards data.");
    }
  } catch (error) {
    console.error("Error checking for rewards:", error);
  }
}

// Map to store notification links
const notificationLinks = {};

// Function to show notifications with interaction
function showNotification(message, link) {
  const notificationOptions = {
    type: "basic",
    iconUrl: "icons/icon48.png",
    title: "Pipe Network Guardian Node",
    message: message,
    buttons: [{ title: "Earn Rewards" }],
  };

  chrome.notifications.create("rewardsNotification", notificationOptions, (notificationId) => {
    notificationLinks[notificationId] = link;
  });
}

// Listen for button clicks on notifications
chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  if (notificationLinks[notificationId] && buttonIndex === 0) {
    chrome.tabs.create({ url: notificationLinks[notificationId] });
    delete notificationLinks[notificationId]; // Clean up
  }
});

// Fetch IP and Geo-location data
async function getGeoLocation() {
  try {
    const response = await fetch('https://ipapi.co/json/');
    if (!response.ok) throw new Error('Failed to fetch Geo-location data');
    const data = await response.json();
    return {
      ip: data.ip,
      location: `${data.city}, ${data.region}, ${data.country_name}`,
    };
  } catch (error) {
    console.error('Geo-location error:', error);
    return { ip: '0.0.0.0', location: 'Unknown Location' };
  }
}

// Function to handle periodic heartbeats
async function startHeartbeat() {
  await ensureBaseUrl();
  const token = await getToken();
  if (!token) {
    console.warn("No token found. Skipping heartbeat.");
    return;
  }

  setInterval(async () => {
    try {
      const geoInfo = await getGeoLocation();
      const response = await fetch(`${baseUrl}/api/heartbeat`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ip: geoInfo.ip,
          location: geoInfo.location,
          timestamp: Date.now(),
        }),
      });

      if (response.ok) {
        console.log("Heartbeat sent successfully.");
      } else {
        console.error("Heartbeat failed:", await response.text());
      }
    } catch (error) {
      console.error("Error during heartbeat:", error);
    }
  }, 6 * 60 * 60 * 1000); // 6 hours
}

// Consolidated alarm listener
chrome.alarms.onAlarm.addListener(async (alarm) => {
  switch (alarm.name) {
    case "nodeTestAlarm":
      console.log("Running node tests...");
      await runNodeTests();
      break;
    case "dailyRewardsCheck":
      console.log("Checking for rewards...");
      await checkForRewards();
      break;
    default:
      console.warn(`Unknown alarm triggered: ${alarm.name}`);
  }
});

// Set up alarms for periodic tasks
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("nodeTestAlarm", { periodInMinutes: 30 });
  chrome.alarms.create("dailyRewardsCheck", { periodInMinutes: 1440 }); // 24 hours
  startHeartbeat();
});

// Refresh the base URL periodically
setInterval(async () => {
  baseUrl = await fetchBaseUrl();
  console.log('Base URL refreshed:', baseUrl);
}, 60 * 60 * 1000); // Every 60 minutes
