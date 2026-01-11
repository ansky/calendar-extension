// popup.js

let selectedText = "";
let accessToken = null;
let selectedCalendarId = null; // Variable to store the selected calendar ID
const clientId = '833320118734-eufl1u5bmtq1v2sj51jk1kuddl7rmujs.apps.googleusercontent.com';
const defaultGeminiApiKey = 'AIzaSyCKXjau5bxuH89kO0L5SytdWweNU1ZWNlY'; // Fallback key
let userGeminiApiKey = null;

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

function populateCalendarDropdown(calendars) {
  const calendarSelect = document.getElementById("calendar-select");
  calendarSelect.innerHTML = ""; // Clear existing options

  calendars.forEach((calendar) => {
    const option = document.createElement("option");
    option.value = calendar.id;
    option.text = calendar.summary;
    calendarSelect.appendChild(option);
  });

  // Retrieve the last selected calendar ID from storage
  chrome.storage.local.get(['lastSelectedCalendarId'], (result) => {
    const lastSelectedCalendarId = result.lastSelectedCalendarId;

    // Set the default selected calendar
    if (lastSelectedCalendarId && calendars.find(calendar => calendar.id === lastSelectedCalendarId)) {
      calendarSelect.value = lastSelectedCalendarId;
      selectedCalendarId = lastSelectedCalendarId;
    } else {
      // Fallback to the primary calendar (or the first calendar)
      const primaryCalendar = calendars.find(calendar => calendar.primary);
      if (primaryCalendar) {
        calendarSelect.value = primaryCalendar.id;
        selectedCalendarId = primaryCalendar.id;
      } else {
        selectedCalendarId = calendars[0].id;
      }
    }
    // Show the calendar select container
    document.getElementById("calendar-select-container").style.display = "block";
  });
}

// Event listener for calendar selection
document.getElementById("calendar-select").addEventListener("change", (event) => {
  selectedCalendarId = event.target.value;
  // Store the selected calendar ID in storage
  chrome.storage.local.set({ lastSelectedCalendarId: selectedCalendarId });
});

// Event listener for API Key saving
document.getElementById('saveApiKeyButton').addEventListener('click', () => {
  const apiKeyInput = document.getElementById('apiKeyInput');
  const apiKey = apiKeyInput.value.trim();
  const statusDiv = document.getElementById('apiKeyStatus');

  if (apiKey) {
    chrome.storage.local.set({ geminiApiKey: apiKey }, () => {
      userGeminiApiKey = apiKey;
      statusDiv.textContent = 'API Key saved!';
      statusDiv.style.color = 'green';
      setTimeout(() => { statusDiv.textContent = ''; }, 3000);
    });
  } else {
    // Clear the key if empty
    chrome.storage.local.remove('geminiApiKey', () => {
      userGeminiApiKey = null;
      statusDiv.textContent = 'API Key cleared.';
      statusDiv.style.color = 'blue';
      setTimeout(() => { statusDiv.textContent = ''; }, 3000);
    });
  }
});

let eventDetailsFromGemini = null; // Store the event details from Gemini

//Create calendar event
document.getElementById("createEvent").addEventListener("click", () => {
  if (!selectedText) return;

  const createEventButton = document.getElementById("createEvent");
  createEventButton.disabled = true;

  // Get the current tab's URL
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentTab = tabs[0];
    const currentUrl = currentTab.url;
    getEventDetailsFromGemini(selectedText)
      .then(eventDetails => {
        // Append the URL to the description
        eventDetails.description = `${eventDetails.description}\n\nSource URL: ${currentUrl}`;
        eventDetailsFromGemini = eventDetails; // Store the details
        populateForm(eventDetails); // Populate the form
        document.getElementById('event-form-container').style.display = 'block'; // Show the form
      })
      .catch(error => {
        console.error("Error getting event details from Gemini:", error);
        displayError("Error getting event details. Please try again.");
        createEventButton.disabled = false; // Re-enable the button on error
      });
  });
});

function populateForm(eventDetails) {
  document.getElementById('summary').value = eventDetails.summary || '';
  document.getElementById('start').value = eventDetails.start.slice(0, 16); // Format for datetime-local
  document.getElementById('end').value = eventDetails.end.slice(0, 16); // Format for datetime-local
  document.getElementById('location').value = eventDetails.location || '';
  document.getElementById('description').value = eventDetails.description || '';

  // Populate recurrence fields if they exist
  if (eventDetails.recurrence) {
    document.getElementById('frequency').value = eventDetails.recurrence.frequency || '';
    document.getElementById('interval').value = eventDetails.recurrence.interval || 1;
    document.getElementById('count').value = eventDetails.recurrence.count || '';
    document.getElementById('until').value = eventDetails.recurrence.until ? eventDetails.recurrence.until.slice(0, 10) : '';
    document.getElementById('byday').value = eventDetails.recurrence.byday || '';
    document.getElementById('bymonthday').value = eventDetails.recurrence.bymonthday || '';
    document.getElementById('recurrence-fields').style.display = 'block';
  } else {
    document.getElementById('recurrence-fields').style.display = 'none';
  }
}

// Event listener for form submission
document.getElementById('event-form').addEventListener('submit', (event) => {
  event.preventDefault(); // Prevent default form submission

  // Get the form data
  const formData = new FormData(event.target);
  const eventDetails = {
    summary: formData.get('summary'),
    start: new Date(formData.get('start')).toISOString(),
    end: new Date(formData.get('end')).toISOString(),
    location: formData.get('location'),
    description: formData.get('description'),
    recurrence: null,
  };

  // Check if recurrence is enabled
  if (document.getElementById('recurrence-fields').style.display === 'block') {
    eventDetails.recurrence = {
      frequency: formData.get('frequency'),
      interval: parseInt(formData.get('interval')),
      count: parseInt(formData.get('count')),
      until: formData.get('until'),
      byday: formData.get('byday'),
      bymonthday: formData.get('bymonthday'),
    };
  }

  // Create the event
  createCalendarEvent(eventDetails);
  document.getElementById('event-form-container').style.display = 'none';
});

// Event listener for toggling recurrence fields
document.getElementById('toggle-recurrence').addEventListener('click', () => {
  const recurrenceFields = document.getElementById('recurrence-fields');
  recurrenceFields.style.display = recurrenceFields.style.display === 'none' ? 'block' : 'none';
});

async function getEventDetailsFromGemini(text) {

  // Get today's date in YYYY-MM-DD format
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentDateStr = today.toISOString().split('T')[0]; // e.g., "2024-07-27"

  const prompt = `You are a calendar event creation assistant. Extract the following information from the text provided and return it ONLY as a single, raw, valid JSON object string. Do NOT include any explanatory text, markdown formatting (like \`\`\`json), or anything else before or after the JSON object.
 
   The current date is ${currentDateStr}. The current year is ${currentYear}.
 
   The JSON object must have these keys:
   - summary: (string) A short title for the event. Be concise.
   - start: (string) The start date and time in ISO 8601 format (YYYY-MM-DDTHH:MM:SS). If no time is specified, assume 9:00 AM. If no date is specified, assume today (${currentDateStr}). If no year is specified, assume the current year (${currentYear}) unless the month/day clearly indicates the following year (e.g., if today is Dec and text says "Jan 10 meeting").
   - end: (string) The end date and time in ISO 8601 format (YYYY-MM-DDTHH:MM:SS). If no time is specified, assume 1 hour after the start time. If no date is specified, assume today (${currentDateStr}). If no year is specified, assume the current year (${currentYear}) unless the month/day clearly indicates the following year. Ensure the end date/time is after the start date/time.
   - location: (string) The location of the event. If none, use an empty string "".
   - description: (string) A detailed description. Include the original selected text here if relevant. If none, use an empty string "".
   - recurrence: (object or null) Describes recurrence. If not recurring, set to null.
     - frequency: (string, e.g., "DAILY", "WEEKLY", "MONTHLY")
     - interval: (number)
     - count: (number)
     - until: (string, YYYY-MM-DD)
     - byday: (string, e.g., "MO,TU,WE,TH,FR")
     - bymonthday: (string, e.g., "1,15,30")
 
   IMPORTANT JSON Formatting Rules:
   1.  Ensure the entire output is ONLY the JSON object string.
   2.  All string values within the JSON (summary, start, end, location, description, etc.) MUST be enclosed in double quotes ("").
   3.  Any literal double quote character (") *inside* a string value MUST be escaped with a backslash (\\"). Example: "Meeting about \\"Project X\\""
   4.  Any literal backslash character (\\) *inside* a string value MUST be escaped with another backslash (\\\\).
   5.  Any newline characters within the description or other string fields MUST be escaped as \\n.
   6.  If an event occurs on multiple days (e.g., "April 4 - 7"), treat it as a DAILY recurrence with the appropriate count (e.g., count: 4).
 
   Text to parse:
   ${text}
 
   JSON Output:`;

  const requestBody = {
    contents: [{
      parts: [{
        text: prompt
      }]
    }],
    generationConfig: {
      maxOutputTokens: 1024,
      temperature: 0.4,
      topP: 1
    }
  };

  try {

    const keyToUse = userGeminiApiKey || defaultGeminiApiKey;
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${keyToUse}`, {
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
    console.log("Raw Gemini Response Data:", JSON.stringify(data, null, 2)); // Log the full response object

    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts || !data.candidates[0].content.parts[0]) {
      console.error("Unexpected Gemini response structure:", data);
      throw new Error("Unexpected response structure from Gemini API.");
    }

    let rawGeminiText = data.candidates[0].content.parts[0].text;
    console.log("Raw Gemini Text Output:", rawGeminiText); // <-- ADD THIS LOG

    let geminiResponse = rawGeminiText;

    // Remove potential markdown code fences and trim whitespace
    geminiResponse = geminiResponse.replace(/^```(json)?\s*/, '').replace(/\s*```$/, '').trim();

    console.log("Cleaned Gemini Response (Attempting Parse):", geminiResponse); // Log before parsing

    // Attempt to parse the cleaned response
    let eventDetails;
    try {
      eventDetails = JSON.parse(geminiResponse);
    } catch (parseError) {
      // Log the specific error and the problematic string
      console.error("Error parsing Gemini response:", parseError.message); // Log specific error message
      console.error("Problematic Gemini Response String:", geminiResponse); // Log the string that failed
      displayError(`Error parsing event details: ${parseError.message}. Please check console.`);
      // Return a default object or re-throw if preferred
      return {
        summary: "New Event (Parsing Failed)",
        start: new Date().toISOString(),
        end: new Date(Date.now() + 3600000).toISOString(),
        location: "",
        description: `Failed to parse details from text:\n${text}`,
        recurrence: null
      };
    }


    // Ensure recurrence is an object or null
    if (eventDetails.recurrence !== null && typeof eventDetails.recurrence !== 'object') {
      eventDetails.recurrence = null;
    }

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

  const rrule = buildRRule(eventDetails.recurrence);

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
    recurrence: rrule ? [rrule] : [], // Add the recurrence rule if it exists
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

function signIn(interactive = true) {
  const scopes = [
    "https://www.googleapis.com/auth/calendar",
  ];

  chrome.identity.getAuthToken({ interactive: interactive, scopes: scopes }, async function (token) {
    if (chrome.runtime.lastError) {
      console.error(chrome.runtime.lastError);
      if (interactive) {
        displayError("Error signing in. Please try again.");
      }
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

function initialize() {
  updateUI();
  // Attempt silent sign-in
  signIn(false);

  // Load stored API Key
  chrome.storage.local.get(['geminiApiKey'], (result) => {
    if (result.geminiApiKey) {
      userGeminiApiKey = result.geminiApiKey;
      const apiKeyInput = document.getElementById('apiKeyInput');
      if (apiKeyInput) {
        apiKeyInput.value = result.geminiApiKey;
      }
    }
  });
}

function updateUI() {
  const signInButton = document.getElementById("signInButton");
  const createEventButton = document.getElementById("createEvent");
  const userEmailDisplay = document.getElementById("userEmailDisplay");

  if (accessToken) {
    signInButton.style.display = "none";
    createEventButton.disabled = selectedText ? false : true;
  } else {
    signInButton.style.display = "block";
    createEventButton.disabled = true;
  }
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
  if (errorDiv) {
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

function buildRRule(recurrence) {
  if (!recurrence) {
    return null;
  }

  let rrule = `RRULE:FREQ=${recurrence.frequency}`;

  if (recurrence.interval) {
    rrule += `;INTERVAL=${recurrence.interval}`;
  }

  if (recurrence.count) {
    rrule += `;COUNT=${recurrence.count}`;
  }

  if (recurrence.until) {
    // Format the date to YYYYMMDD
    const untilDate = new Date(recurrence.until);
    const formattedUntil = untilDate.toISOString().slice(0, 10).replace(/-/g, '');
    rrule += `;UNTIL=${formattedUntil}`;
  }

  if (recurrence.byday) {
    rrule += `;BYDAY=${recurrence.byday}`;
  }

  if (recurrence.bymonthday) {
    rrule += `;BYMONTHDAY=${recurrence.bymonthday}`;
  }

  return rrule;
}
