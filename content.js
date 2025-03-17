console.log('content.js loaded (but not active yet)');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "startContent") {
    console.log("start content");
    startContent();
  }
});

function startContent() {
  console.log("content started");

  // Check for existing selection immediately
  const initialSelectedText = window.getSelection().toString().trim();
  if (initialSelectedText.length > 0) {
    console.log('Sending initial selected text:', initialSelectedText);
    chrome.runtime.sendMessage({ action: 'sendSelectedText', text: initialSelectedText });
  }

  // Add the mouseup listener for future selections
  document.addEventListener('mouseup', (event) => {
    console.log("mouse up event")
    const selectedText = window.getSelection().toString().trim();

    if (selectedText.length > 0) {
      console.log('Sending selected text:', selectedText);
      chrome.runtime.sendMessage({ action: 'sendSelectedText', text: selectedText });
    }
  });
}
