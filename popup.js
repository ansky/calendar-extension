// popup.js

let selectedText = "";
let accessToken = null;
let selectedCalendarId = null; // Variable to store the selected calendar ID
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
      displayError("Error injecting content script.");
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

// Function to fetch the user's calendars
async function fetchCalendars() {
  try {
    const response = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message);
    }
    const data = await response.json();
    const calendars = data.items;
    return calendars;
  } catch (error) {
    console.error("Error fetching calendars:", error);
    displayError("Error fetching calendars.");
    return [];
  }
}

// Function to populate the calendar dropdown
function populateCalendarDropdown(calendars) {
  const calendarSelect = document.getElementById("calendar-select");
  calendarSelect.innerHTML = ""; // Clear existing options

  calendars.forEach((calendar) => {
    const option = document.createElement("option");
    option.value = calendar.id;
    option.text = calendar.summary;
    calendarSelect.appendChild(option);
  });

  // Set the default selected calendar (e.g., the primary calendar)
  const primaryCalendar = calendars.find(calendar => calendar.primary);
  if (primaryCalendar) {
    calendarSelect.value = primaryCalendar.id;
    selectedCalendarId = primaryCalendar.id;
  } else {
    selectedCalendarId = calendars[0].id;
  }

  // Show the calendar select container
  document.getElementById("calendar-select-container").style.display = "block";
}

// Event listener for calendar selection
document.getElementById("calendar-select").addEventListener("change", (event) => {
  selectedCalendarId = event.target.value;
});

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
  const prompt = `You are a calendar event creation assistant. Extract the following information from the text provided and return it as a JSON object:
  - summary: A short title for the event. Be concise.
  - start: The start date and time of the event in ISO 8601 format (YYYY-MM-DDTHH:MM:SS). If no time is specified, assume 9:00 AM. If no date is specified, assume today.
  - end: The end date and time of the event in ISO 8601 format (YYYY-MM-DDTHH:MM:SS). If no time is specified, assume 10:00 AM. If no date is specified, assume today.
  - location: The location of the event. If no location is specified, set it to an empty string.
  - description: A more detailed description of the event. If no description is specified, set it to an empty string.

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

  if (!selectedCalendarId) {
    displayError("No calendar selected.");
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

  // Log the event details before sending them to the API
  console.log("Event details being sent to Google Calendar API:", event);

  try {
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${selectedCalendarId}/events`, {
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
    // Log the response from the API
    console.log("Google Calendar API Response:", data);
    displaySuccess(eventDetails, data.htmlLink);
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
    ];

    chrome.identity.getAuthToken({ interactive: true, scopes: scopes }, async function (token) {
        if (chrome.runtime.lastError) {
            console.error(chrome.runtime.lastError);
            displayError("Error signing in. Please try again.");
            return;
        }
        accessToken = token;
        console.log("Access Token:", accessToken);
        // Fetch and display calendars
        const calendars = await fetchCalendars();
        populateCalendarDropdown(calendars);
        updateUI();
    });
}

function updateUI() {
  const signInButton = document.getElementById("signInButton");
  const createEventButton = document.getElementById("createEvent");
  const userEmailDisplay = document.getElementById("userEmailDisplay");

  if (accessToken) {
    signInButton.style.display = "none";
    createEventButton.disabled = selectedText? false : true;
  } else {
    signInButton.style.display = "block";
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
  const errorDiv = document.getElementById('error-message');
  if(errorDiv){
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    setTimeout(() => {
      errorDiv.style.display = 'none';
    }, 5000);
  } else {
    alert(`Error: ${message}`);
  }
}

function displaySuccess(eventDetails, eventLink) {
  const eventDetailsDiv = document.getElementById('event-details');
  if (!eventDetailsDiv) return;

  document.getElementById('event-summary').textContent = eventDetails.summary;
  document.getElementById('event-start').textContent = eventDetails.start;
  document.getElementById('event-end').textContent = eventDetails.end;
  document.getElementById('event-location').textContent = eventDetails.location;
  document.getElementById('event-description').textContent = eventDetails.description;
  document.getElementById('event-link').href = eventLink;
  document.getElementById('event-link').textContent = eventLink;

  eventDetailsDiv.style.display = 'block';
}
