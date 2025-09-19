import {
  getCookies,
  setCookie,
  deleteCookie,
  deleteAllCookies,
} from "../utils/cookieUtils.js";

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  console.log("Concentria Extension - Popup loaded");
  updateAuthUI();
  setupEventListeners();
  initializeTabSystem();
});

// Setup all event listeners
function setupEventListeners() {
  // Tab switching
  const tabButtons = document.querySelectorAll(".tab-button");
  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const tabId = button.getAttribute("data-tab");
      switchTab(tabId);
    });
  });

  // Authentication
  const loginBtn = document.getElementById("loginBtn");
  const logoutBtn = document.getElementById("logoutBtn");

  if (loginBtn) loginBtn.addEventListener("click", handleLogin);
  if (logoutBtn) logoutBtn.addEventListener("click", logout);

  // Handle Enter key in login form
  const emailInput = document.getElementById("loginEmail");
  const passwordInput = document.getElementById("loginPassword");

  if (emailInput) emailInput.addEventListener("keypress", handleEnterKey);
  if (passwordInput) passwordInput.addEventListener("keypress", handleEnterKey);

  // Button actions
  setupActionButtons();
}

function setupActionButtons() {
  const actionButtons = [
    { id: "downloadLogs", handler: downloadLogsHandler },
    { id: "clearAllLogs", handler: clearLogsHandler },
    { id: "openDashboard", handler: openDashboardHandler },
    { id: "downloadCookies", handler: downloadCookiesHandler },
    { id: "deleteAllCookies", handler: deleteAllCookiesHandler },
    { id: "refreshLogs", handler: () => fetchUserLogs() },
    { id: "refreshCookies", handler: () => loadCookies() },
  ];

  actionButtons.forEach(({ id, handler }) => {
    const button = document.getElementById(id);
    if (button) {
      button.addEventListener("click", handler);
    }
  });
}

function initializeTabSystem() {
  // Set default active tab
  switchTab("logs");
}

function handleEnterKey(event) {
  if (event.key === "Enter") {
    event.preventDefault();
    handleLogin();
  }
}

async function handleLogin() {
  const emailInput = document.getElementById("loginEmail");
  const passwordInput = document.getElementById("loginPassword");

  if (!emailInput || !passwordInput) {
    showError("Login form elements not found");
    return;
  }

  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();

  console.log("Login attempt:", email);

  if (!email || !password) {
    showError("Please enter both email and password");
    return;
  }

  await login(email, password);
}

function switchTab(tabId) {
  console.log("Switching to tab:", tabId);

  // Only allow tab switching if authenticated
  chrome.storage.local.get(["isLoggedIn"], (result) => {
    if (!result.isLoggedIn) {
      showError("Please login first to access features");
      return;
    }

    // Update tab button states
    const tabButtons = document.querySelectorAll(".tab-button");
    tabButtons.forEach((button) => {
      const buttonTabId = button.getAttribute("data-tab");
      button.classList.toggle("active", buttonTabId === tabId);
    });

    // Update panel visibility
    const tabPanels = document.querySelectorAll(".tab-panel");
    tabPanels.forEach((panel) => {
      const panelTabId = panel.getAttribute("data-tab");
      panel.classList.toggle("active", panelTabId === tabId);
    });

    // Load data based on selected tab
    if (tabId === "cookies") {
      loadCookies();
      updateCurrentDomain();
    } else if (tabId === "logs") {
      fetchUserLogs();
    }
  });
}

// Authentication Functions
async function login(email, password) {
  const loginBtn = document.getElementById("loginBtn");
  const buttonText = loginBtn?.querySelector(".button-text");
  const buttonLoader = loginBtn?.querySelector(".button-loader");

  try {
    // Show loading state
    if (buttonText) buttonText.style.opacity = "0";
    if (buttonLoader) buttonLoader.classList.remove("hidden");
    if (loginBtn) loginBtn.disabled = true;

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
      if (document.getElementById("loginEmail"))
        document.getElementById("loginEmail").value = "";
      if (document.getElementById("loginPassword"))
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
    if (buttonText) buttonText.style.opacity = "1";
    if (buttonLoader) buttonLoader.classList.add("hidden");
    if (loginBtn) loginBtn.disabled = false;
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

    const authSection = document.querySelector(".auth-section");
    const dashboardSection = document.querySelector(".dashboard-section");
    const userEmailDisplay = document.getElementById("userEmailDisplay");
    const statusIndicator = document.querySelector(".status-indicator");

    if (result.isLoggedIn && result.userEmail) {
      // Show authenticated state
      if (authSection) authSection.style.display = "none";
      if (dashboardSection) dashboardSection.style.display = "flex";
      if (userEmailDisplay) userEmailDisplay.textContent = result.userEmail;

      // Update status indicator
      const statusText = statusIndicator?.querySelector(".status-text");
      const statusDot = statusIndicator?.querySelector(".status-dot");

      if (statusText) statusText.textContent = "Connected";
      if (statusDot) {
        statusDot.style.background = "var(--success-primary)";
        statusDot.style.boxShadow = "var(--glow-cyan)";
      }

      // Enable all buttons
      enableButtons();

      // Load initial data
      fetchUserLogs();
      updateStats();

      // Set default tab
      switchTab("logs");
    } else {
      // Show login state
      if (authSection) authSection.style.display = "flex";
      if (dashboardSection) dashboardSection.style.display = "none";

      // Update status indicator
      const statusText = statusIndicator?.querySelector(".status-text");
      const statusDot = statusIndicator?.querySelector(".status-dot");

      if (statusText) statusText.textContent = "Not Connected";
      if (statusDot) {
        statusDot.style.background = "var(--error-primary)";
        statusDot.style.boxShadow = "0 0 8px var(--error-primary)";
      }

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
  const buttons = document.querySelectorAll(".action-button, .tab-button");

  buttons.forEach((btn) => {
    btn.disabled = false;
    btn.style.opacity = "1";
    btn.style.cursor = "pointer";
  });
}

function disableButtons() {
  const buttons = document.querySelectorAll(".action-button, .tab-button");

  buttons.forEach((btn) => {
    btn.disabled = true;
    btn.style.opacity = "0.5";
    btn.style.cursor = "not-allowed";
  });
}

// Enhanced fetchUserLogs function
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

// Enhanced render logs with new structure
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

  const tbody = document.getElementById("logsTableBody");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (logs.length === 0) {
    tbody.innerHTML = `
      <tr class="empty-state">
        <td colspan="3">
          <div class="empty-content">
            <div class="empty-icon">
              <i class="fas fa-search"></i>
              <div class="scanning-animation"></div>
            </div>
            <h4>No activity detected</h4>
            <p>Start browsing to see your activity logs here</p>
          </div>
        </td>
      </tr>`;
    return;
  }

  // Render with grouped icons
  const groupedLogs = groupLogsByType(logs);

  Object.entries(groupedLogs).forEach(([group, groupLogs], index) => {
    const row = document.createElement("tr");
    const latestLog = groupLogs[0]; // Most recent log in group
    const count = groupLogs.length;

    const icon = getLogIcon(latestLog.type);
    const displayUrl =
      latestLog.url && latestLog.url.length > 30
        ? latestLog.url.slice(0, 30) + "..."
        : latestLog.url || "N/A";

    row.style.animationDelay = `${index * 0.05}s`;
    row.style.animation = "slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards";

    row.innerHTML = `
      <td>
        <div style="font-weight: 600; color: var(--text-primary); font-size: 13px;">
          ${new Date(latestLog.timestamp).toLocaleTimeString()}
        </div>
        <div style="font-size: 11px; color: var(--text-secondary); font-weight: 500;">
          ${new Date(latestLog.timestamp).toLocaleDateString()}
        </div>
      </td>
      <td>
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 16px; filter: drop-shadow(0 0 4px currentColor);">${icon}</span>
          <span style="font-weight: 600; color: var(--text-primary);">${group}</span>
          ${
            count > 1
              ? `<span style="background: var(--glass-subtle); color: var(--text-secondary); padding: 3px 8px; border-radius: 12px; font-size: 10px; font-weight: 600; border: 1px solid var(--border-primary);">${count}</span>`
              : ""
          }
        </div>
      </td>
      <td style="font-weight: 500; color: var(--text-secondary); font-size: 12px;" title="${
        latestLog.url || ""
      }">${displayUrl}</td>`;

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
  Object.keys(groups).forEach((group) => {
    groups[group].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  });

  return groups;
}

function getLogGroupName(type) {
  const typeMap = {
    location_request: "Location Access",
    camera_request: "Camera Access",
    microphone_request: "Microphone Access",
    notification_request: "Notifications",
    geolocation: "Location Tracking",
    cookie_access: "Cookie Access",
    local_storage: "Data Storage",
    fingerprinting: "Device Fingerprinting",
    tracking: "User Tracking",
    analytics: "Analytics",
    advertising: "Advertising",
    social_media: "Social Integration",
    third_party: "Third-party Scripts",
    popup: "Pop-ups",
    redirect: "Redirects",
    download: "Downloads",
  };

  return (
    typeMap[type] ||
    type.charAt(0).toUpperCase() + type.slice(1).replace("_", " ")
  );
}

function getLogIcon(type) {
  const iconMap = {
    location_request: "📍",
    camera_request: "📷",
    microphone_request: "🎤",
    notification_request: "🔔",
    geolocation: "🌐",
    cookie_access: "🍪",
    local_storage: "💾",
    fingerprinting: "🔍",
    tracking: "👁️",
    analytics: "📊",
    advertising: "📢",
    social_media: "👥",
    third_party: "🔗",
    popup: "⚠️",
    redirect: "↗️",
    download: "⬇️",
  };

  return iconMap[type] || "📝";
}

// Cookie management functions
async function loadCookies() {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    const domain = new URL(tab.url).hostname;

    const cookies = await getCookies(domain);
    renderCookies(cookies);
    updateCurrentDomain(domain);
  } catch (error) {
    console.error("Error loading cookies:", error);
    showError("Failed to load cookies");
  }
}

function renderCookies(cookies) {
  const tbody = document.getElementById("cookiesTableBody");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!cookies || cookies.length === 0) {
    tbody.innerHTML = `
      <tr class="empty-state">
        <td colspan="4">
          <div class="empty-content">
            <div class="empty-icon">
              <i class="fas fa-cookie-bite"></i>
            </div>
            <h4>No cookies found</h4>
            <p>This site doesn't have any cookies stored</p>
          </div>
        </td>
      </tr>`;
    return;
  }

  cookies.forEach((cookie, index) => {
    const row = document.createElement("tr");
    row.style.animationDelay = `${index * 0.05}s`;
    row.style.animation = "slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards";

    const truncatedValue =
      cookie.value.length > 20
        ? cookie.value.slice(0, 20) + "..."
        : cookie.value;

    row.innerHTML = `
      <td style="font-weight: 600; color: var(--text-primary);">${cookie.name}</td>
      <td style="font-family: 'Monaco', monospace; font-size: 11px; color: var(--text-secondary);" title="${cookie.value}">${truncatedValue}</td>
      <td style="color: var(--text-secondary); font-size: 12px;">${cookie.domain}</td>
      <td>
        <button class="action-button danger" onclick="deleteSingleCookie('${cookie.name}', '${cookie.domain}')" style="padding: 4px 8px; font-size: 11px;">
          <i class="fas fa-trash"></i>
        </button>
      </td>`;

    tbody.appendChild(row);
  });
}

function updateCurrentDomain(domain = null) {
  if (!domain) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        const currentDomain = new URL(tabs[0].url).hostname;
        const domainElement = document.querySelector(".domain-indicator span");
        if (domainElement) {
          domainElement.textContent = currentDomain;
        }
      }
    });
  } else {
    const domainElement = document.querySelector(".domain-indicator span");
    if (domainElement) {
      domainElement.textContent = domain;
    }
  }
}

// Action button handlers
async function downloadLogsHandler() {
  try {
    chrome.storage.local.get(["userLogs", "logs"], (data) => {
      const logs = data.userLogs || data.logs || [];

      if (logs.length === 0) {
        showError("No logs to download");
        return;
      }

      const dataStr = JSON.stringify(logs, null, 2);
      const dataBlob = new Blob([dataStr], { type: "application/json" });

      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `concentria_logs_${
        new Date().toISOString().split("T")[0]
      }.json`;
      link.click();

      URL.revokeObjectURL(url);
      showSuccess(`Downloaded ${logs.length} logs`);
    });
  } catch (error) {
    console.error("Download error:", error);
    showError("Failed to download logs");
  }
}

async function clearLogsHandler() {
  if (
    !confirm(
      "Are you sure you want to clear all logs? This action cannot be undone."
    )
  ) {
    return;
  }

  try {
    await chrome.storage.local.set({ logs: [], userLogs: [] });
    clearLogs();
    updateStats();
    showSuccess("All logs cleared");
  } catch (error) {
    console.error("Clear logs error:", error);
    showError("Failed to clear logs");
  }
}

function clearLogs() {
  const tbody = document.getElementById("logsTableBody");
  if (tbody) {
    tbody.innerHTML = `
      <tr class="empty-state">
        <td colspan="3">
          <div class="empty-content">
            <div class="empty-icon">
              <i class="fas fa-search"></i>
              <div class="scanning-animation"></div>
            </div>
            <h4>No activity detected</h4>
            <p>Start browsing to see your activity logs here</p>
          </div>
        </td>
      </tr>`;
  }
}

function openDashboardHandler() {
  chrome.tabs.create({ url: "https://concentria-fh4s.onrender.com/dashboard" });
}

async function downloadCookiesHandler() {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    const domain = new URL(tab.url).hostname;
    const cookies = await getCookies(domain);

    if (!cookies || cookies.length === 0) {
      showError("No cookies to download");
      return;
    }

    const dataStr = JSON.stringify(cookies, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });

    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${domain}_cookies_${
      new Date().toISOString().split("T")[0]
    }.json`;
    link.click();

    URL.revokeObjectURL(url);
    showSuccess(`Downloaded ${cookies.length} cookies`);
  } catch (error) {
    console.error("Download cookies error:", error);
    showError("Failed to download cookies");
  }
}

async function deleteAllCookiesHandler() {
  if (
    !confirm(
      "Are you sure you want to delete all cookies for this site? This may log you out of the website."
    )
  ) {
    return;
  }

  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    const domain = new URL(tab.url).hostname;

    await deleteAllCookies(domain);
    loadCookies();
    showSuccess("All cookies deleted");
  } catch (error) {
    console.error("Delete all cookies error:", error);
    showError("Failed to delete cookies");
  }
}

// Global function for cookie deletion
window.deleteSingleCookie = async function (name, domain) {
  try {
    await deleteCookie(name, domain);
    loadCookies();
    showSuccess(`Cookie "${name}" deleted`);
  } catch (error) {
    console.error("Delete cookie error:", error);
    showError("Failed to delete cookie");
  }
};

// Notification functions
function showError(message) {
  showNotification(message, "error");
}

function showSuccess(message) {
  showNotification(message, "success");
}

function showNotification(message, type = "info") {
  // Remove existing notifications
  const existingNotifications = document.querySelectorAll(".notification");
  existingNotifications.forEach((n) => n.remove());

  const notification = document.createElement("div");
  notification.className = `notification notification-${type}`;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 16px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    z-index: 10000;
    animation: slideIn 0.3s ease-out;
    max-width: 300px;
    backdrop-filter: blur(10px);
    border: 1px solid var(--border-primary);
    box-shadow: var(--shadow-glass);
  `;

  // Set colors based on type
  switch (type) {
    case "success":
      notification.style.background = "var(--success-bg)";
      notification.style.color = "var(--success-text)";
      notification.style.borderColor = "var(--border-cyan)";
      break;
    case "error":
      notification.style.background = "var(--error-bg)";
      notification.style.color = "var(--error-text)";
      notification.style.borderColor = "var(--border-pink)";
      break;
    default:
      notification.style.background = "var(--info-bg)";
      notification.style.color = "var(--info-text)";
      notification.style.borderColor = "var(--border-blue)";
  }

  notification.textContent = message;
  document.body.appendChild(notification);

  // Auto remove after 3 seconds
  setTimeout(() => {
    notification.style.animation = "fadeOut 0.3s ease-out";
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

function clearError() {
  const existingNotifications = document.querySelectorAll(
    ".notification-error"
  );
  existingNotifications.forEach((n) => n.remove());
}

// Add CSS for notifications
const notificationStyles = document.createElement("style");
notificationStyles.textContent = `
  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateX(100%);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  @keyframes fadeOut {
    from {
      opacity: 1;
      transform: translateX(0);
    }
    to {
      opacity: 0;
      transform: translateX(100%);
    }
  }
`;
document.head.appendChild(notificationStyles);
