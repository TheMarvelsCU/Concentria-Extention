import {
  getCookies,
  setCookie,
  deleteCookie,
  deleteAllCookies,
} from "../utils/cookieUtils.js";

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  console.log("Popup loaded");
  updateAuthUI();
  setupEventListeners();
});

// Setup all event listeners
function setupEventListeners() {
  // Tab switching
  document.getElementById("logsTab").onclick = () => switchTab("logs");
  document.getElementById("cookiesTab").onclick = () => switchTab("cookies");

  // Authentication
  document.getElementById("loginBtn").onclick = handleLogin;
  document.getElementById("logoutBtn").onclick = logout;

  // Handle Enter key in login form
  document.getElementById("loginEmail").onkeypress = handleEnterKey;
  document.getElementById("loginPassword").onkeypress = handleEnterKey;

  // Button actions (these will be disabled until auth)
  document.getElementById("downloadLogs").onclick = downloadLogsHandler;
  document.getElementById("clearAllLogs").onclick = clearLogsHandler;
  document.getElementById("openDashboard").onclick = openDashboardHandler;
  document.getElementById("downloadCookies").onclick = downloadCookiesHandler;
  document.getElementById("deleteAllCookies").onclick = deleteAllCookiesHandler;
}

function handleEnterKey(event) {
  if (event.key === "Enter") {
    handleLogin();
  }
}

async function handleLogin() {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value.trim();

  console.log("Login attempt:", email);

  if (!email || !password) {
    showError("Please enter both email and password");
    return;
  }

  await login(email, password);
}

function switchTab(tab) {
  // Only allow tab switching if authenticated
  chrome.storage.local.get(["isLoggedIn"], (result) => {
    if (!result.isLoggedIn) {
      showError("Please login first to access features");
      return;
    }

    // Update tab states
    document
      .getElementById("logsTab")
      .classList.toggle("active", tab === "logs");
    document
      .getElementById("cookiesTab")
      .classList.toggle("active", tab === "cookies");

    // Update content visibility
    document
      .getElementById("logsSection")
      .classList.toggle("hidden", tab !== "logs");
    document
      .getElementById("cookiesSection")
      .classList.toggle("hidden", tab !== "cookies");

    // Load data based on selected tab
    if (tab === "cookies") {
      loadCookies();
      updateCurrentDomain();
    } else if (tab === "logs") {
      fetchUserLogs();
    }
  });
}

// Authentication Functions
async function login(email, password) {
  const loginBtn = document.getElementById("loginBtn");
  const buttonText = loginBtn.querySelector(".button-text");
  const buttonLoader = loginBtn.querySelector(".button-loader");

  try {
    // Show loading state
    buttonText.style.opacity = "0";
    buttonLoader.classList.remove("hidden");
    loginBtn.disabled = true;
    clearError();

    console.log("Sending login request...");

    const response = await fetch(
      "https://concentria-fh4s.onrender.com/auth/login",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      }
    );

    console.log("Login response status:", response.status);

    if (response.ok) {
      const data = await response.json();
      console.log("Login response data:", data);

      const token = data.accessToken || data.token;

      if (!token) {
        throw new Error("No token received from server");
      }

      // Store auth info
      await chrome.storage.local.set({
        userEmail: email,
        authToken: token,
        isLoggedIn: true,
      });

      console.log("Auth data stored successfully");

      // Clear form
      document.getElementById("loginEmail").value = "";
      document.getElementById("loginPassword").value = "";

      updateAuthUI();

      // Fetch user-specific data after login
      await fetchUserLogs();
      updateStats();

      showSuccess("Successfully logged in!");
      return true;
    } else {
      const errorData = await response
        .json()
        .catch(() => ({ message: "Login failed" }));
      throw new Error(errorData.message || `HTTP ${response.status}`);
    }
  } catch (error) {
    console.error("Login error:", error);
    showError(error.message);
    return false;
  } finally {
    // Reset button state
    buttonText.style.opacity = "1";
    buttonLoader.classList.add("hidden");
    loginBtn.disabled = false;
  }
}

async function logout() {
  console.log("Logging out...");

  // Clear all stored data
  await chrome.storage.local.clear();

  // Reset UI
  updateAuthUI();
  clearLogs();
  updateStats();

  showSuccess("Successfully logged out!");
}

function updateAuthUI() {
  chrome.storage.local.get(["userEmail", "isLoggedIn"], (result) => {
    console.log("Auth status:", result);

    const loginForm = document.getElementById("loginForm");
    const loggedInSection = document.getElementById("loggedInSection");
    const userEmailDisplay = document.getElementById("userEmailDisplay");
    const mainContent = document.getElementById("mainContent");
    const statusIndicator = document.getElementById("statusIndicator");

    if (result.isLoggedIn && result.userEmail) {
      // Show authenticated state
      loginForm.classList.add("hidden");
      loggedInSection.classList.remove("hidden");
      mainContent.style.display = "flex";
      userEmailDisplay.textContent = result.userEmail;

      // Update status indicator
      statusIndicator.querySelector("span").textContent = "Connected";
      statusIndicator.querySelector(".status-dot").style.background = "#00ff88";

      // Enable all buttons
      enableButtons();

      // Load initial data
      fetchUserLogs();
      updateStats();
    } else {
      // Show login state
      loginForm.classList.remove("hidden");
      loggedInSection.classList.add("hidden");
      mainContent.style.display = "none";

      // Update status indicator
      statusIndicator.querySelector("span").textContent = "Not Connected";
      statusIndicator.querySelector(".status-dot").style.background = "#ff6b6b";

      // Disable all buttons
      disableButtons();

      // Clear data
      clearLogs();
      updateStats();
    }
  });
}

// Enable/Disable button functions
function enableButtons() {
  const buttons = [
    "downloadLogs",
    "clearAllLogs",
    "openDashboard",
    "downloadCookies",
    "deleteAllCookies",
    "logsTab",
    "cookiesTab",
  ];

  buttons.forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.disabled = false;
      btn.style.opacity = "1";
      btn.style.cursor = "pointer";
    }
  });
}

function disableButtons() {
  const buttons = [
    "downloadLogs",
    "clearAllLogs",
    "openDashboard",
    "downloadCookies",
    "deleteAllCookies",
    "logsTab",
    "cookiesTab",
  ];

  buttons.forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.disabled = true;
      btn.style.opacity = "0.5";
      btn.style.cursor = "not-allowed";
    }
  });
}

// Fixed fetchUserLogs function
async function fetchUserLogs() {
  try {
    const result = await new Promise((resolve) => {
      chrome.storage.local.get(
        ["authToken", "userEmail", "isLoggedIn", "logs"],
        resolve
      );
    });

    const { authToken, userEmail, isLoggedIn, logs: localLogs } = result;
    let allLogs = localLogs || [];

    // If authenticated, fetch from backend and merge
    if (isLoggedIn && authToken) {
      try {
        console.log("Fetching logs for user:", userEmail);

        const url = `https://concentria-fh4s.onrender.com/api/logs?userEmail=${encodeURIComponent(
          userEmail
        )}`;

        const response = await fetch(url, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${authToken}`,
            "Content-Type": "application/json",
          },
        });

        if (response.ok) {
          const data = await response.json();
          let backendLogs = [];

          if (data.logs && Array.isArray(data.logs)) {
            backendLogs = data.logs;
          } else if (Array.isArray(data)) {
            backendLogs = data;
          }

          // Merge local and backend logs, remove duplicates
          allLogs = mergeAndDedupeLogs(localLogs || [], backendLogs);

          console.log(
            `Merged ${localLogs?.length || 0} local + ${
              backendLogs.length
            } backend logs = ${allLogs.length} total`
          );

          // Cache merged logs
          await chrome.storage.local.set({ userLogs: allLogs });
        } else if (response.status === 401) {
          console.log("Token expired, logging out");
          await logout();
          showError("Session expired. Please login again.");
          return;
        }
      } catch (error) {
        console.error("Backend fetch failed, using local logs only:", error);
        showError("Using local logs only - network error");
      }
    }

    // Render the logs (local + backend merged)
    renderLogs(allLogs);
    updateStats(allLogs);

    if (isLoggedIn) {
      showSuccess(`Loaded ${allLogs.length} total logs`);
    }
  } catch (error) {
    console.error("Error in fetchUserLogs:", error);
    // Fallback to local logs only
    chrome.storage.local.get("logs", (data) => {
      renderLogs(data.logs || []);
      updateStats(data.logs || []);
    });
  }
}

// Merge and deduplicate logs
function mergeAndDedupeLogs(localLogs, backendLogs) {
  const allLogs = [...(localLogs || []), ...(backendLogs || [])];

  // Remove duplicates based on timestamp + type + url
  const uniqueLogs = allLogs.filter((log, index, arr) => {
    return (
      index ===
      arr.findIndex(
        (l) =>
          l.timestamp === log.timestamp &&
          l.type === log.type &&
          l.url === log.url
      )
    );
  });

  // Sort by timestamp (newest first)
  return uniqueLogs.sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
  );
}

// Update stats display
function updateStats(logs = null) {
  // If logs not provided, get from storage
  if (!logs) {
    chrome.storage.local.get("userLogs", (data) => {
      updateStats(data.userLogs || []);
    });
    return;
  }

  const totalLogs = logs.length;

  // Calculate today's logs
  const today = new Date().toDateString();
  const todayLogs = logs.filter(
    (log) => new Date(log.timestamp).toDateString() === today
  ).length;

  const totalElement = document.getElementById("totalLogs");
  const todayElement = document.getElementById("todayLogs");

  if (totalElement) totalElement.textContent = totalLogs;
  if (todayElement) todayElement.textContent = todayLogs;
}

// Enhanced render logs with backend data
function renderLogs(logs = null) {
  // If no logs provided, get from cache first, then fetch
  if (!logs) {
    chrome.storage.local.get(["userLogs", "logs"], (data) => {
      const cachedLogs = data.userLogs || data.logs || [];
      if (cachedLogs.length > 0) {
        renderLogs(cachedLogs);
        updateStats(cachedLogs);
      } else {
        // No cached logs, try fetching
        fetchUserLogs();
      }
    });
    return;
  }

  const tbody = document.getElementById("logsContent");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (logs.length === 0) {
    tbody.innerHTML = `
      <tr class="empty-state">
        <td colspan="3">
          <div class="empty-content">
            <i class="fas fa-search"></i>
            <h4>No activity detected</h4>
            <p>Start browsing to see your activity logs here</p>
          </div>
        </td>
      </tr>`;
    return;
  }

  // Render with grouped icons as requested
  const groupedLogs = groupLogsByType(logs);

  Object.entries(groupedLogs).forEach(([group, groupLogs], index) => {
    const row = document.createElement("tr");
    const latestLog = groupLogs[0]; // Most recent log in group
    const count = groupLogs.length;

    const icon = getLogIcon(latestLog.type);
    const displayUrl =
      latestLog.url && latestLog.url.length > 25
        ? latestLog.url.slice(0, 25) + "..."
        : latestLog.url || "N/A";

    row.style.animationDelay = `${index * 0.05}s`;
    row.style.animation = "slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards";

    row.innerHTML = `
      <td>
        <div style="font-weight: 500; color: #374151;">
          ${new Date(latestLog.timestamp).toLocaleTimeString()}
        </div>
        <div style="font-size: 11px; color: #64748b;">
          ${new Date(latestLog.timestamp).toLocaleDateString()}
        </div>
      </td>
      <td>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 16px;">${icon}</span>
          <span class="log-type">${group}</span>
          ${
            count > 1
              ? `<span style="background: #f1f5f9; color: #64748b; padding: 2px 6px; border-radius: 10px; font-size: 10px; font-weight: 600;">${count}</span>`
              : ""
          }
        </div>
      </td>
      <td class="url-cell" title="${latestLog.url || ""}">${displayUrl}</td>`;

    // Show all logs in group on click
    row.onclick = () => {
      console.log(`${group} logs (${count}):`, groupLogs);
    };

    tbody.appendChild(row);
  });

  console.log(
    `Rendered ${logs.length} logs in ${Object.keys(groupedLogs).length} groups`
  );
}

// Group logs by type with icons
function groupLogsByType(logs) {
  const groups = {};

  logs.forEach((log) => {
    const groupName = getLogGroupName(log.type);
    if (!groups[groupName]) {
      groups[groupName] = [];
    }
    groups[groupName].push(log);
  });

  // Sort each group by timestamp
  Object.values(groups).forEach((group) => {
    group.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  });

  return groups;
}

// Get group name for log type
function getLogGroupName(type) {
  const groups = {
    clipboard: "Clipboard",
    copy: "Clipboard",
    cut: "Clipboard",
    paste: "Clipboard",
    geolocation: "Location",
    permissions: "Permissions",
    microphone: "Media Access",
    camera: "Media Access",
    deviceOrientation: "Sensors",
    download: "Downloads",
  };
  return groups[type] || type.charAt(0).toUpperCase() + type.slice(1);
}

// Get icon for log type
function getLogIcon(type) {
  const icons = {
    clipboard: "📋",
    copy: "📋",
    cut: "✂️",
    paste: "📥",
    geolocation: "📍",
    permissions: "🔐",
    microphone: "🎤",
    camera: "📷",
    deviceOrientation: "🎮",
    download: "📁",
  };
  return icons[type] || "🛡️";
}

// Clear logs from UI
function clearLogs() {
  const tbody = document.getElementById("logsContent");
  if (tbody) {
    tbody.innerHTML = `
      <tr class="empty-state">
        <td colspan="3">
          <div class="empty-content">
            <i class="fas fa-lock"></i>
            <h4>Please login to view logs</h4>
            <p>Your activity logs will appear here after authentication</p>
          </div>
        </td>
      </tr>`;
  }
}

// Update current domain for cookies section
function updateCurrentDomain() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentDomain = document.getElementById("currentDomain");
    if (currentDomain && tabs[0] && tabs[0].url) {
      const url = new URL(tabs[0].url);
      currentDomain.querySelector("span").textContent = url.hostname;
    } else if (currentDomain) {
      currentDomain.querySelector("span").textContent = "No active tab";
    }
  });
}

// Enhanced cookie loading with auth check
async function loadCookies() {
  // Check if user is authenticated
  const result = await new Promise((resolve) => {
    chrome.storage.local.get(["isLoggedIn"], resolve);
  });

  if (!result.isLoggedIn) {
    const tbody = document.getElementById("cookiesContent");
    if (tbody) {
      tbody.innerHTML = `
        <tr class="empty-state">
          <td colspan="5">
            <div class="empty-content">
              <i class="fas fa-lock"></i>
              <h4>Please login to manage cookies</h4>
              <p>Cookie management requires authentication</p>
            </div>
          </td>
        </tr>`;
    }
    return;
  }

  const cookies = await getDomainCookies();
  const tbody = document.getElementById("cookiesContent");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (cookies.length === 0) {
    tbody.innerHTML = `
      <tr class="empty-state">
        <td colspan="5">
          <div class="empty-content">
            <i class="fas fa-cookie-bite"></i>
            <h4>No cookies found</h4>
            <p>Navigate to a website to view its cookies</p>
          </div>
        </td>
      </tr>`;
    return;
  }

  cookies.forEach((cookie, index) => {
    const row = document.createElement("tr");
    const url =
      (cookie.secure ? "https://" : "http://") +
      cookie.domain.replace(/^\./, "") +
      cookie.path;

    row.style.animationDelay = `${index * 0.03}s`;
    row.style.animation = "slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards";

    row.innerHTML = `
      <td style="font-weight: 500;">${cookie.name}</td>
      <td>
        <input value="${cookie.value}" id="v-${cookie.name}" class="cookie-input" 
               maxlength="100" title="${cookie.value}">
      </td>
      <td style="font-family: monospace; font-size: 12px;">${cookie.domain}</td>
      <td style="font-family: monospace; font-size: 12px;">${cookie.path}</td>
      <td>
        <button onclick="updateCookie('${cookie.name}', '${url}')" class="btn-save" title="Save changes">
          <i class="fas fa-save"></i>
        </button>
        <button onclick="removeCookie('${cookie.name}', '${url}')" class="btn-delete" title="Delete cookie">
          <i class="fas fa-trash"></i>
        </button>
      </td>`;
    tbody.appendChild(row);
  });
}

// Button handlers with auth checks
async function downloadLogsHandler() {
  const result = await new Promise((resolve) => {
    chrome.storage.local.get(["isLoggedIn", "userLogs"], resolve);
  });

  if (!result.isLoggedIn) {
    showError("Please login first");
    return;
  }

  const logs = result.userLogs || [];
  downloadJSON(
    logs,
    `concentria-logs-${new Date().toISOString().split("T")[0]}.json`
  );
  showSuccess("Logs downloaded successfully!");
}

async function clearLogsHandler() {
  const result = await new Promise((resolve) => {
    chrome.storage.local.get(["isLoggedIn", "authToken", "userEmail"], resolve);
  });

  if (!result.isLoggedIn) {
    showError("Please login first");
    return;
  }

  if (
    confirm(
      "Clear all your logs from the server? This action cannot be undone."
    )
  ) {
    try {
      const response = await fetch(
        `https://concentria-fh4s.onrender.com/api/logs?userEmail=${encodeURIComponent(
          result.userEmail
        )}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${result.authToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (response.ok) {
        // Clear local cache
        await chrome.storage.local.set({ userLogs: [] });

        // Re-render empty logs
        renderLogs([]);
        updateStats([]);

        showSuccess("All logs cleared successfully!");
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      console.error("Error clearing logs:", error);
      showError("Failed to clear logs from server");
    }
  }
}

function openDashboardHandler() {
  chrome.storage.local.get(["isLoggedIn"], (result) => {
    if (!result.isLoggedIn) {
      showError("Please login first");
      return;
    }
    chrome.tabs.create({ url: "https://concentria.netlify.app/dashboard/" });
  });
}

async function downloadCookiesHandler() {
  const result = await new Promise((resolve) => {
    chrome.storage.local.get(["isLoggedIn"], resolve);
  });

  if (!result.isLoggedIn) {
    showError("Please login first");
    return;
  }

  const cookies = await getDomainCookies();
  downloadJSON(cookies, `concentria-cookies-${Date.now()}.json`);
  showSuccess("Cookies downloaded successfully!");
}

async function deleteAllCookiesHandler() {
  const result = await new Promise((resolve) => {
    chrome.storage.local.get(["isLoggedIn"], resolve);
  });

  if (!result.isLoggedIn) {
    showError("Please login first");
    return;
  }

  if (
    confirm("Delete all cookies for this domain? This action cannot be undone.")
  ) {
    const cookies = await getDomainCookies();
    await deleteAllCookies(cookies);
    loadCookies();
    showSuccess("All cookies deleted!");
  }
}

// Helper functions
async function getDomainCookies() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return [];
  const url = new URL(tab.url);
  return getCookies(url.hostname);
}

// Global functions for cookie management
window.updateCookie = async (name, url) => {
  try {
    const val = document.getElementById(`v-${name}`).value;
    await setCookie({ url, name, value: val });
    showSuccess("Cookie updated successfully!");
  } catch (error) {
    showError("Failed to update cookie");
  }
};

window.removeCookie = async (name, url) => {
  try {
    await deleteCookie(url, name);
    loadCookies();
    showSuccess("Cookie deleted successfully!");
  } catch (error) {
    showError("Failed to delete cookie");
  }
};

function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// UI feedback functions
function showError(message) {
  const errorElement = document.getElementById("loginError");
  if (errorElement) {
    errorElement.textContent = message;
    setTimeout(clearError, 5000);
  }
}

function clearError() {
  const errorElement = document.getElementById("loginError");
  if (errorElement) {
    errorElement.textContent = "";
  }
}

function showSuccess(message) {
  // Create a temporary success message
  const successDiv = document.createElement("div");
  successDiv.className = "success-message";
  successDiv.textContent = message;

  const authSection = document.getElementById("authSection");
  if (authSection) {
    authSection.appendChild(successDiv);

    setTimeout(() => {
      successDiv.remove();
    }, 3000);
  }
}

// Auto-refresh logs every 30 seconds when visible and authenticated
setInterval(() => {
  chrome.storage.local.get(["isLoggedIn"], (result) => {
    if (
      result.isLoggedIn &&
      !document.getElementById("logsSection").classList.contains("hidden")
    ) {
      fetchUserLogs();
    }
  });
}, 30000);
