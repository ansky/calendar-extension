// popup.js

let selectedText = "";

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
  const createEventButton = document.getElementById('createEvent');
  if (!textDisplay) return;
  textDisplay.textContent = `Selected Text: ${text}`;
  createEventButton.disabled = false;
}

//Create calendar event
document.getElementById("createEvent").addEventListener("click", () => {
  if (!selectedText) return;
  createCalendarEvent(selectedText);
});

function createCalendarEvent(text) {
  alert(`Creating Calendar Event with text: ${text}`);
  // Add Google Calendar API Logic Here
  // To add a new calendar event you need to request the required permissions.
}

//Set button to disabled by default
document.addEventListener("DOMContentLoaded", () => {
  const createEventButton = document.getElementById('createEvent');
  console.log("disable button")
  createEventButton.disabled = true;
});
