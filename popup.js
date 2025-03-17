// popup.js

let selectedText = "";
let accessToken = null;
let userEmail = null;
const clientId = '833320118734-eufl1u5bmtq1v2sj51jk1kuddl7rmujs.apps.googleusercontent.com'; // Replace with your client ID

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
    alert("Please sign in first.");
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
    alert(`Event created: ${data.htmlLink}`);
  } catch (error) {
    console.error("Error creating event:", error);
    alert("Error creating event. Please try again.");
  }
}

//Sign in with google
document.getElementById("signInButton").addEventListener("click", () => {
  signIn();
});

function signIn() {
    const redirectUrl = chrome.identity.getRedirectURL();
    console.log("Redirect URL:", redirectUrl);
    const authUrl = `https://accounts.google.com/o/oauth2/auth?client_id=${clientId}&response_type=token&redirect_uri=${redirectUrl}&scope=https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.email&prompt=consent`;
  chrome.identity.launchWebAuthFlow(
    {
      url: authUrl,
      interactive: true,
    },
    function (redirectUrl) {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError);
        alert("Error signing in. Please try again.");
        return;
      }
      const token = new URL(redirectUrl).hash.match(/access_token=([^&]*)/)[1];
      accessToken = token;
      console.log("Access Token:", accessToken);
      fetchUserEmail();
      updateUI();
    }
  );
}

async function fetchUserEmail() {
  try {
    const response = await fetch("https://people.googleapis.com/v1/people/me?personFields=emailAddresses", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message);
    }
    const data = await response.json();
    userEmail = data.emailAddresses[0].value;
    console.log("User Email:", userEmail);
    updateUI();
  } catch (error) {
    console.error("Error getting user email:", error);
    alert("Error getting user email. Please try again.");
  }
}

function updateUI() {
  const signInButton = document.getElementById("signInButton");
  const createEventButton = document.getElementById("createEvent");
  const userEmailDisplay = document.getElementById("userEmailDisplay");

  if (accessToken && userEmail) {
    signInButton.style.display = "none";
    userEmailDisplay.textContent = `Signed in as: ${userEmail}`;
    createEventButton.disabled = selectedText? false : true;
  } else {
    signInButton.style.display = "block";
    userEmailDisplay.textContent = "";
    createEventButton.disabled = true;
  }
}

function initialize(){
  if (accessToken){
    fetchUserEmail();
  }else{
    updateUI();
  }
}

//Set button to disabled by default
document.addEventListener("DOMContentLoaded", () => {
  const createEventButton = document.getElementById('createEvent');
  console.log("disable button")
  createEventButton.disabled = true;
  initialize();
});
