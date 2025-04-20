// Initialize skip time
let skipTime = 5;

// Update badge whenever the extension starts
chrome.runtime.onStartup.addListener(() => {
  loadAndUpdateBadge();
});

// When the extension is installed or updated
chrome.runtime.onInstalled.addListener(() => {
  loadAndUpdateBadge();
});

// Function to load from storage and update badge
function loadAndUpdateBadge() {
  chrome.storage.local.get(['skipTime'], function(result) {
    if (result.skipTime) {
      skipTime = result.skipTime;
    } else {
      // Set default if not exists
      chrome.storage.local.set({ skipTime: skipTime });
    }
    // Update badge with current value
    updateBadge();
  });
}

// Listen for storage changes to update badge
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.skipTime) {
    skipTime = changes.skipTime.newValue;
    updateBadge();
  }
});

// Update badge to show current skip time
function updateBadge() {
  // Convert to string explicitly
  const badgeText = skipTime.toString();
  console.log("Setting badge text to:", badgeText);
  
  // Set badge text
  chrome.action.setBadgeText({ text: badgeText });
  
  // Make badge readable with a good background color
  chrome.action.setBadgeBackgroundColor({ color: '#4285F4' });
}

// Increment skip time when icon is clicked
chrome.action.onClicked.addListener(() => {
  console.log("Extension icon clicked");
  
  // Cycle through common values: 5, 10, 15, 30, 60, 5, ...
  const values = [5, 10, 15, 30, 60];
  const currentIndex = values.indexOf(parseInt(skipTime));
  
  // Find next value or start from beginning
  const nextIndex = (currentIndex === -1 || currentIndex === values.length - 1) ? 0 : currentIndex + 1;
  skipTime = values[nextIndex];
  
  console.log("New skip time:", skipTime);
  
  // Save the new value - this will trigger the storage listener
  chrome.storage.local.set({ skipTime: skipTime }, () => {
    // Also notify any active content scripts
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs && tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, { 
          action: "updateSkipTime", 
          value: skipTime 
        });
      }
    });
  });
});