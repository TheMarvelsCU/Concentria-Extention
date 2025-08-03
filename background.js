import { config } from "./config.js";

const API_URL = "https://concentria-fh4s.onrender.com/api/logs";

// Function to send log to backend with authentication
async function sendLogToBackend(log) {
  try {
    // Get stored auth token
    const result = await new Promise((resolve) => {
      chrome.storage.local.get(
        ["authToken", "userEmail", "isLoggedIn"],
        resolve
      );
    });

    const { authToken, userEmail, isLoggedIn } = result;

    if (!isLoggedIn || !authToken) {
      console.log("[background] User not authenticated, storing locally only");
      return;
    }

    const payload = {
      userEmail,
      type: log.type,
      timestamp: new Date(log.timestamp),
      url: log.url,
      // Only include filename for download events
      ...(log.type === "download" && log.filename
        ? { filename: log.filename }
        : {}),
    };

    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      console.log("[background] Log sent to backend successfully:", payload);

      // Update local user logs cache
      updateLocalUserLogs(log);
    } else if (response.status === 401) {
      // Token expired or invalid
      console.log("[background] Authentication failed, clearing stored auth");
      chrome.storage.local.remove(["authToken", "userEmail", "isLoggedIn"]);
    } else {
      console.error(
        "[background] Failed to send log to backend:",
        response.status
      );
      const errorText = await response.text();
      console.error("[background] Error details:", errorText);
    }
  } catch (error) {
    console.error("[background] Backend request error:", error);
  }
}

// Update local user logs cache
async function updateLocalUserLogs(newLog) {
  try {
    const result = await new Promise((resolve) => {
      chrome.storage.local.get("userLogs", resolve);
    });

    const userLogs = result.userLogs || [];
    userLogs.unshift(newLog); // Add to beginning (newest first)

    // Keep only last 1000 logs to prevent storage overflow
    const trimmedLogs = userLogs.slice(0, 1000);

    await chrome.storage.local.set({ userLogs: trimmedLogs });
    console.log("[background] Updated local user logs cache");
  } catch (error) {
    console.error("[background] Error updating local logs cache:", error);
  }
}

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[background] Received message:", message);

  if (message.action === "logEvent" || message.type) {
    const log = message.log || message;

    // Always store locally as backup
    chrome.storage.local.get({ logs: [] }, (data) => {
      const updated = [...data.logs, log];
      chrome.storage.local.set({ logs: updated }, () => {
        console.log("[background] Log stored locally as backup:", log);
        sendResponse({ status: "ok" });
      });
    });

    // Send to backend if authenticated
    sendLogToBackend(log);

    return true; // Keep message channel open for async response
  }
});

// Handle downloads
chrome.downloads.onCreated.addListener(async (downloadItem) => {
  const log = {
    type: "download",
    timestamp: new Date().toISOString(),
    url: downloadItem.url,
    filename: downloadItem.filename,
  };

  // Store locally as backup
  chrome.storage.local.get({ logs: [] }, (data) => {
    const updated = [...data.logs, log];
    chrome.storage.local.set({ logs: updated }, () => {
      console.log("[background] Download log stored locally:", log);

      // Show emoji in active tab
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].id) {
          chrome.tabs.sendMessage(tabs[0].id, { action: "showDownloadEmoji" });
        }
      });
    });
  });

  // Send to backend if authenticated
  sendLogToBackend(log);
});
