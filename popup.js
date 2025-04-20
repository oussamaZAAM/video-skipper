// Initialize references immediately when script loads
let skipTimeInput, saveBtn, visualToggle;

// Start loading storage data immediately - before DOM is ready
const storageRequest = chrome.storage.local.get(["skipTime", "showVisualFeedback"]);

// Handle DOM ready - keep this as lightweight as possible
document.addEventListener("DOMContentLoaded", function() {
  // Cache DOM elements
  skipTimeInput = document.getElementById("skipTimeInput");
  saveBtn = document.getElementById("saveBtn");
  visualToggle = document.getElementById("visualToggle");
  
  // Apply stored values (which should already be loaded)
  storageRequest.then(result => {
    if (result.skipTime) {
      skipTimeInput.value = result.skipTime;
    }
    // Default to true if not set
    visualToggle.checked = result.showVisualFeedback !== false;
  });
  
  // Use event delegation if possible, but at minimum use a simple click handler
  saveBtn.onclick = saveAndClose;
  
  // Optional: Handle enter key in input field
  skipTimeInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      saveAndClose();
    }
  });
});

// Separate function to handle saving
function saveAndClose() {
  const newSkipTime = parseInt(skipTimeInput.value) || 5; // Default to 5 to match content.js
  const showVisualFeedback = visualToggle.checked;
  
  // Set storage in background - don't wait
  chrome.storage.local.set({ 
    skipTime: newSkipTime,
    showVisualFeedback: showVisualFeedback
  });
  
  // Send message to tab in background - don't wait
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (tabs?.[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, { 
        action: "updateSkipTime", 
        value: newSkipTime,
        showVisualFeedback: showVisualFeedback
      });
    }
    
    // Visual feedback before closing (optional)
    const originalText = saveBtn.textContent;
    saveBtn.textContent = "Saved!";
    saveBtn.style.background = '#4caf50';
    
    // Close popup immediately after a brief visual feedback
    setTimeout(() => {
      window.close();
    }, 300);
  });
}