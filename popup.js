// popup.js

let selectedText = "";
let accessToken = null;
const clientId = '833320118734-eufl1u5bmtq1v2sj51jk1kuddl7rmujs.apps.googleusercontent.com';

//Inject content.js
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const activeTab = tabs[0];
  console.log('activeTab', activeTab)
  if (activeTab) {
    chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      files: ['content.js']
    }).then(() => {
      console.log("content.js injected");
      chrome.tabs.sendMessage(activeTab.id, { action: "startContent" });
    }).catch((err) => {
      console.error("content.js not injected", err);
    })
  }
});

// Listen for messages from content.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message received:', request);
  if (request.action === 'sendSelectedText') {
    selectedText = request.text;
    displaySelectedText(selectedText);
  }
});

function displaySelectedText(text) {
  console.log("displaySelectedText");
  const textDisplay = document.getElementById('selectedText');
  if (!textDisplay) return;
  textDisplay.textContent = `Selected Text: ${text}`;
  updateUI();
}

//Create calendar event
document.getElementById("createEvent").addEventListener("click", () => {
  if (!selectedText) return;
  createCalendarEvent(selectedText);
});

async function createCalendarEvent(text) {
  if (!accessToken) {
    displayError("Please sign in first.");
    return;
  }
  const startDate = new Date();
  const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // 1 hour later
  const event = {
    summary: text,
    start: {
      dateTime: startDate.toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    end: {
      dateTime: endDate.toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  };
  try {
    const response = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message);
    }

    const data = await response.json();
    displaySuccess(`Event created: ${data.htmlLink}`);
  } catch (error) {
    console.error("Error creating event:", error);
    displayError("Error creating event. Please try again.");
  }
}

//Sign in with google
document.getElementById("signInButton").addEventListener("click", () => {
  signIn();
});

function signIn() {
    const scopes = [
        "https://www.googleapis.com/auth/calendar",
        // "https://www.googleapis.com/auth/userinfo.email" // Removed this scope
    ];

    chrome.identity.getAuthToken({ interactive: true, scopes: scopes }, function (token) {
        if (chrome.runtime.lastError) {
            console.error(chrome.runtime.lastError);
            displayError("Error signing in. Please try again.");
            return;
        }
        accessToken = token;
        console.log("Access Token:", accessToken);
        updateUI();
    });
}

function updateUI() {
  const signInButton = document.getElementById("signInButton");
  const createEventButton = document.getElementById("createEvent");
  const userEmailDisplay = document.getElementById("userEmailDisplay");

  if (accessToken) {
    signInButton.style.display = "none";
    // userEmailDisplay.textContent = `Signed in as: ${userEmail}`; // Removed this line
    createEventButton.disabled = selectedText? false : true;
  } else {
    signInButton.style.display = "block";
    // userEmailDisplay.textContent = ""; // Removed this line
    createEventButton.disabled = true;
  }
}

function initialize(){
  updateUI();
}

//Set button to disabled by default
document.addEventListener("DOMContentLoaded", () => {
  const createEventButton = document.getElementById('createEvent');
  console.log("disable button")
  createEventButton.disabled = true;
  initialize();
});

// Helper functions for UI feedback
function displayError(message) {
  alert(`Error: ${message}`);
}

function displaySuccess(message) {
  alert(`Success: ${message}`);
}
