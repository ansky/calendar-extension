// popup.js

let selectedText = "";
let accessToken = null;
const clientId = '833320118734-eufl1u5bmtq1v2sj51jk1kuddl7rmujs.apps.googleusercontent.com';
const geminiApiKey = 'AIzaSyCKXjau5bxuH89kO0L5SytdWweNU1ZWNlY'; // Replace with your actual Gemini API key

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
  getEventDetailsFromGemini(selectedText)
    .then(eventDetails => {
      createCalendarEvent(eventDetails);
    })
    .catch(error => {
      console.error("Error getting event details from Gemini:", error);
      displayError("Error getting event details. Please try again.");
    });
});

async function getEventDetailsFromGemini(text) {
  const prompt = `Extract the following information from the text provided and return it as a JSON object:
  - summary: A short title for the event.
  - start: The start date and time of the event in ISO 8601 format (YYYY-MM-DDTHH:MM:SS). If no time is specified, assume 9:00 AM. If no date is specified, assume today.
  - end: The end date and time of the event in ISO 8601 format (YYYY-MM-DDTHH:MM:SS). If no time is specified, assume 10:00 AM. If no date is specified, assume today.
  - location: The location of the event.
  - description: A more detailed description of the event.

  Text: ${text}
  `;

  const requestBody = {
    contents: [{
      parts: [{
        text: prompt
      }]
    }],
    generationConfig: {
      maxOutputTokens: 200,
      temperature: 0.4,
      topP: 1
    }
  };

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Gemini API request failed with status ${response.status}: ${error.error.message}`);
    }

    const data = await response.json();
    console.log("Gemini Response:", data);
    let geminiResponse = data.candidates[0].content.parts[0].text;
    geminiResponse = geminiResponse.replace(/```(json)?/g, '').trim();
    const eventDetails = JSON.parse(geminiResponse);
    return eventDetails;
  } catch (error) {
    console.error("Error getting event details from Gemini:", error);
    throw error;
  }
}

async function createCalendarEvent(eventDetails) {
  if (!accessToken) {
    displayError("Please sign in first.");
    return;
  }

  const event = {
    summary: eventDetails.summary,
    start: {
      dateTime: eventDetails.start,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    end: {
      dateTime: eventDetails.end,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    location: eventDetails.location,
    description: eventDetails.description,
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
