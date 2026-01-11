// app.js

let selectedText = "";
let accessToken = null;
let selectedCalendarId = null;
let tokenClient;
let gapiInited = false;
let gisInited = false;

// Configuration
// IMPORTANT: Replace with your Web Application Client ID from Google Cloud Console
// The user (Joel) needs to provide this or update it later.
const clientId = '833320118734-0vm7j08e678m5opgd9mdrlsb6rcv3nm0.apps.googleusercontent.com';
const defaultGeminiApiKey = 'AIzaSyCKXjau5bxuH89kO0L5SytdWweNU1ZWNlY'; // Fallback key
let userGeminiApiKey = null;

// Initialize Google Identity Services
function handleCredentialResponse(response) {
    // This is for Sign In With Google (ID Token), but we need Access Token for Calendar API.
    // We will mostly use the Token Client flow.
    console.log("Credential response", response);
}

// Initialize the Token Client
function initTokenClient() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/calendar',
        callback: (tokenResponse) => {
            if (tokenResponse && tokenResponse.access_token) {
                accessToken = tokenResponse.access_token;
                console.log("Access Token received");
                onSignedIn();
            }
        },
    });
    gisInited = true;
    checkAuth();
}

document.addEventListener('DOMContentLoaded', () => {
    // Register Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('service-worker.js')
            .then((registration) => {
                console.log('Service Worker registered with scope:', registration.scope);
            })
            .catch((error) => {
                console.error('Service Worker registration failed:', error);
            });
    }

    // Load stored API Key
    const storedApiKey = localStorage.getItem('geminiApiKey');
    if (storedApiKey) {
        userGeminiApiKey = storedApiKey;
        const apiKeyInput = document.getElementById('apiKeyInput');
        if (apiKeyInput) {
            apiKeyInput.value = storedApiKey;
        }
    }

    // Check for shared content (Share Target API)
    const params = new URLSearchParams(window.location.search);
    const title = params.get('title');
    const text = params.get('text');
    const url = params.get('url');

    if (title || text || url) {
        // Combine them intelligently
        let combinedText = "";
        if (title) combinedText += `Title: ${title}\n`;
        if (text) combinedText += `${text}\n`;
        if (url) combinedText += `URL: ${url}`;

        selectedText = combinedText.trim();
        const sharedInput = document.getElementById('sharedTextInput');
        if (sharedInput) sharedInput.value = selectedText;
        const createBtn = document.getElementById('createEvent');
        if (createBtn) createBtn.disabled = false;
    }

    // Initialize button listeners
    const signInBtn = document.getElementById('signInButton');
    if (signInBtn) {
        signInBtn.addEventListener('click', () => {
            if (tokenClient) tokenClient.requestAccessToken();
        });
    }

    const signOutBtn = document.getElementById('signOutButton');
    if (signOutBtn) {
        signOutBtn.addEventListener('click', () => {
            const token = accessToken;
            if (token) {
                google.accounts.oauth2.revoke(token, () => {
                    console.log('Revoked: ' + token);
                    accessToken = null;
                    updateUI();
                });
            }
        });
    }

    const saveApiKeyBtn = document.getElementById('saveApiKeyButton');
    if (saveApiKeyBtn) {
        saveApiKeyBtn.addEventListener('click', () => {
            const apiKeyInput = document.getElementById('apiKeyInput');
            const apiKey = apiKeyInput.value.trim();
            const statusDiv = document.getElementById('apiKeyStatus');

            if (apiKey) {
                localStorage.setItem('geminiApiKey', apiKey);
                userGeminiApiKey = apiKey;
                statusDiv.textContent = 'API Key saved!';
                statusDiv.style.color = 'green';
                setTimeout(() => { statusDiv.textContent = ''; }, 3000);
            } else {
                localStorage.removeItem('geminiApiKey');
                userGeminiApiKey = null;
                statusDiv.textContent = 'API Key cleared.';
                statusDiv.style.color = 'blue';
                setTimeout(() => { statusDiv.textContent = ''; }, 3000);
            }
        });
    }

    // Listen for manual text input changes
    const sharedInput = document.getElementById('sharedTextInput');
    if (sharedInput) {
        sharedInput.addEventListener('input', (e) => {
            selectedText = e.target.value;
            const createBtn = document.getElementById('createEvent');
            if (createBtn) createBtn.disabled = !selectedText;
        });
    }

    // Google Identity Services script loaded?
    if (typeof google !== 'undefined') {
        initTokenClient();
    } else {
        setTimeout(() => {
            if (typeof google !== 'undefined') initTokenClient();
        }, 500);
    }
});

function checkAuth() {
    updateUI();
}

async function onSignedIn() {
    updateUI();
    const calendars = await fetchCalendars();
    populateCalendarDropdown(calendars);
}


function updateUI() {
    const signInButton = document.getElementById("signInButton");
    const signOutButton = document.getElementById("signOutButton");
    const createEventButton = document.getElementById("createEvent");
    const apiKeyConfig = document.getElementById("apiKeyConfig");
    // We can hide API key config if we want to declutter, but maybe keep it accessible

    if (accessToken) {
        if (signInButton) signInButton.style.display = "none";
        if (signOutButton) signOutButton.style.display = "block";
        if (createEventButton) createEventButton.disabled = selectedText ? false : true;
        const calContainer = document.getElementById("calendar-select-container");
        if (calContainer) calContainer.style.display = "block";
    } else {
        if (signInButton) signInButton.style.display = "block";
        if (signOutButton) signOutButton.style.display = "none";
        if (createEventButton) createEventButton.disabled = true;
        const calContainer = document.getElementById("calendar-select-container");
        if (calContainer) calContainer.style.display = "none";
    }
}

// Calendar Logic (mostly reused)

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
            if (response.status === 401) {
                // Token expired
                accessToken = null;
                updateUI();
                displayError("Session expired. Please sign in again.");
                return [];
            }
            const error = await response.json();
            throw new Error(error.message);
        }
        const data = await response.json();
        return data.items;
    } catch (error) {
        console.error("Error fetching calendars:", error);
        displayError("Error fetching calendars.");
        return [];
    }
}

function populateCalendarDropdown(calendars) {
    const calendarSelect = document.getElementById("calendar-select");
    if (!calendarSelect) return;
    calendarSelect.innerHTML = "";

    calendars.forEach((calendar) => {
        const option = document.createElement("option");
        option.value = calendar.id;
        option.text = calendar.summary;
        calendarSelect.appendChild(option);
    });

    const lastSelectedCalendarId = localStorage.getItem('lastSelectedCalendarId');

    if (lastSelectedCalendarId && calendars.find(calendar => calendar.id === lastSelectedCalendarId)) {
        calendarSelect.value = lastSelectedCalendarId;
        selectedCalendarId = lastSelectedCalendarId;
    } else {
        const primaryCalendar = calendars.find(calendar => calendar.primary);
        if (primaryCalendar) {
            calendarSelect.value = primaryCalendar.id;
            selectedCalendarId = primaryCalendar.id;
        } else if (calendars.length > 0) {
            selectedCalendarId = calendars[0].id;
        }
    }
}

const calendarSelect = document.getElementById("calendar-select");
if (calendarSelect) {
    calendarSelect.addEventListener("change", (event) => {
        selectedCalendarId = event.target.value;
        localStorage.setItem('lastSelectedCalendarId', selectedCalendarId);
    });
}


// Gemini and Event Creation Logic

const createEventBtn = document.getElementById("createEvent");
if (createEventBtn) {
    createEventBtn.addEventListener("click", () => {
        if (!selectedText) return;

        const createEventButton = document.getElementById("createEvent");
        createEventButton.disabled = true;
        createEventButton.textContent = "Processing...";

        getEventDetailsFromGemini(selectedText)
            .then(eventDetails => {
                populateForm(eventDetails);
                const formContainer = document.getElementById('event-form-container');
                if (formContainer) {
                    formContainer.style.display = 'block';
                    formContainer.scrollIntoView({ behavior: "smooth" });
                }
                createEventButton.textContent = "Create Event";
                createEventButton.disabled = false;
            })
            .catch(error => {
                console.error("Error getting event details from Gemini:", error);
                displayError("Error getting event details. Please try again.");
                createEventButton.disabled = false;
                createEventButton.textContent = "Create Event";
            });
    });
}

// Helper: Populate Form (Identical to extension)
function populateForm(eventDetails) {
    document.getElementById('summary').value = eventDetails.summary || '';
    document.getElementById('start').value = eventDetails.start.slice(0, 16);
    document.getElementById('end').value = eventDetails.end.slice(0, 16);
    document.getElementById('location').value = eventDetails.location || '';
    document.getElementById('description').value = eventDetails.description || '';

    if (eventDetails.recurrence) {
        document.getElementById('frequency').value = eventDetails.recurrence.frequency || '';
        document.getElementById('interval').value = eventDetails.recurrence.interval || 1;
        document.getElementById('count').value = eventDetails.recurrence.count || '';
        const until = document.getElementById('until');
        if (until) until.value = eventDetails.recurrence.until ? eventDetails.recurrence.until.slice(0, 10) : '';
        document.getElementById('byday').value = eventDetails.recurrence.byday || '';
        document.getElementById('bymonthday').value = eventDetails.recurrence.bymonthday || '';
        document.getElementById('recurrence-fields').style.display = 'block';
    } else {
        document.getElementById('recurrence-fields').style.display = 'none';
    }
}

const eventForm = document.getElementById('event-form');
if (eventForm) {
    eventForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const formData = new FormData(event.target);
        const eventDetails = {
            summary: formData.get('summary'),
            start: new Date(formData.get('start')).toISOString(),
            end: new Date(formData.get('end')).toISOString(),
            location: formData.get('location'),
            description: formData.get('description'),
            recurrence: null,
        };

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

        createCalendarEvent(eventDetails);
        document.getElementById('event-form-container').style.display = 'none';
    });
}

const toggleRecurrence = document.getElementById('toggle-recurrence');
if (toggleRecurrence) {
    toggleRecurrence.addEventListener('click', () => {
        const recurrenceFields = document.getElementById('recurrence-fields');
        recurrenceFields.style.display = recurrenceFields.style.display === 'none' ? 'block' : 'none';
    });
}


// Gemini API Call (Identical to extension)
async function getEventDetailsFromGemini(text) {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentDateStr = today.toISOString().split('T')[0];

    const prompt = `You are a calendar event creation assistant. Extract the following information from the text provided and return it ONLY as a single, raw, valid JSON object string. Do NOT include any explanatory text, markdown formatting (like \`\`\`json), or anything else before or after the JSON object.
 
   The current date is ${currentDateStr}. The current year is ${currentYear}.
 
   The JSON object must have these keys:
   - summary: (string) A short title for the event. Be concise.
   - start: (string) The start date and time in ISO 8601 format (YYYY-MM-DDTHH:MM:SS). If no time is specified, assume 9:00 AM. If no date is specified, assume today (${currentDateStr}). If no year is specified, assume the current year (${currentYear}) unless the month/day clearly indicates the following year.
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
 
   Text to parse:
   ${text}
 
   JSON Output:`;

    const requestBody = {
        contents: [{ parts: [{ text: prompt }] }],
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
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(`Gemini API request failed: ${error.error.message}`);
        }

        const data = await response.json();
        let geminiResponse = data.candidates[0].content.parts[0].text;
        geminiResponse = geminiResponse.replace(/^```(json)?\s*/, '').replace(/\s*```$/, '').trim();

        try {
            let eventDetails = JSON.parse(geminiResponse);
            if (eventDetails.recurrence !== null && typeof eventDetails.recurrence !== 'object') {
                eventDetails.recurrence = null;
            }
            return eventDetails;
        } catch (parseError) {
            console.error("Error parsing Gemini response:", parseError);
            return {
                summary: "New Event (Parsing Failed)",
                start: new Date().toISOString(),
                end: new Date(Date.now() + 3600000).toISOString(),
                description: `Failed to parse details from text:\n${text}`,
                recurrence: null
            };
        }
    } catch (error) {
        console.error("Error calling Gemini:", error);
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
        start: { dateTime: eventDetails.start, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
        end: { dateTime: eventDetails.end, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
        location: eventDetails.location,
        description: eventDetails.description,
        recurrence: rrule ? [rrule] : [],
    };

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
            if (response.status === 401) {
                displayError("Session expired. Please sign in again.");
                accessToken = null;
                updateUI();
                return;
            }
            const error = await response.json();
            throw new Error(error.message);
        }

        const data = await response.json();
        displaySuccess(eventDetails, data.htmlLink);
    } catch (error) {
        console.error("Error creating event:", error);
        displayError("Error creating event: " + error.message);
    }
}

// Helpers

function displayError(message) {
    const errorDiv = document.getElementById('error-message');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        setTimeout(() => { errorDiv.style.display = 'none'; }, 5000);
    } else {
        alert(message);
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
    document.getElementById('event-link').textContent = "View in Calendar";

    eventDetailsDiv.style.display = 'block';
    // Scroll to success message
    eventDetailsDiv.scrollIntoView({ behavior: "smooth" });
}

function buildRRule(recurrence) {
    if (!recurrence) return null;
    let rrule = `RRULE:FREQ=${recurrence.frequency}`;
    if (recurrence.interval) rrule += `;INTERVAL=${recurrence.interval}`;
    if (recurrence.count) rrule += `;COUNT=${recurrence.count}`;
    if (recurrence.until) {
        const untilDate = new Date(recurrence.until);
        const formattedUntil = untilDate.toISOString().slice(0, 10).replace(/-/g, '');
        rrule += `;UNTIL=${formattedUntil}`;
    }
    if (recurrence.byday) rrule += `;BYDAY=${recurrence.byday}`;
    if (recurrence.bymonthday) rrule += `;BYMONTHDAY=${recurrence.bymonthday}`;
    return rrule;
}
