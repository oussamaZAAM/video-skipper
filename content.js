// Execute immediately
(function() {
  // Don't run on Spotify
  if (window.location.hostname.includes('spotify.com')) {
    console.log('[Video Skipper] Disabled on Spotify');
    return;
  }
  
  // Check for previous initialization
  if (window.hasVideoSkipperListener) {
    // Remove previous listeners before adding new ones
    document.removeEventListener("keydown", window.videoSkipperKeydownHandler, true);
    document.removeEventListener("keyup", window.videoSkipperKeyupHandler, true);
    
    // Also remove any storage listeners
    if (window.videoSkipperStorageListener) {
      chrome.storage.onChanged.removeListener(window.videoSkipperStorageListener);
    }
    
    // Clean up existing indicators
    cleanupIndicators();
  }
  
  // Default settings
  let skipTime = 5;
  let showVisualFeedback = true;
  
  // Skip indicators state
  const indicators = new Map(); // Map of video elements to their indicators
  let animationTimeouts = new Map(); // Map to track animation timeouts
  let cumulativeSkip = new Map(); // Map to track cumulative skip for stacking
  
  // Format time to show hours, minutes, seconds if needed
  function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    
    // For times less than 1 minute, just show seconds
    if (seconds < 60) {
      return `${seconds} sec`;
    }
    
    // For times less than 1 hour, show minutes and seconds
    if (seconds < 3600) {
      return minutes > 0 ? `${minutes} min ${remainingSeconds} sec` : `${remainingSeconds} sec`;
    }
    
    // For times 1 hour or more, show all components
    let timeString = '';
    if (hours > 0) timeString += `${hours} h `;
    if (minutes > 0) timeString += `${minutes} min `;
    if (remainingSeconds > 0 || (hours === 0 && minutes === 0)) timeString += `${remainingSeconds} sec`;
    
    return timeString.trim();
  }
  
  // Create skip indicator element
  function createSkipIndicator(video, side) {
    const indicator = document.createElement('div');
    indicator.className = `video-skip-indicator-${side}`;
    indicator.style.cssText = `
      position: absolute;
      top: 50%;
      ${side}: 7.5%;
      transform: translateY(-50%);
      padding: 12px 16px;
      background: rgba(0, 0, 0, 0.6);
      color: white;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      border-radius: 10px;
      opacity: 0;
      transition: opacity 0.15s ease-in-out;
      pointer-events: none;
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      min-width: 60px;
    `;
    
    // Add icon based on direction
    const icon = document.createElement('div');
    icon.style.cssText = `
      font-size: 20px;
      line-height: 1;
      color: white;
    `;
    // Use simple arrow SVGs for icons
    const arrowSvg = side === 'left' 
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 17l-5-5 5-5M18 17l-5-5 5-5"/></svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 7l5 5-5 5M6 7l5 5-5 5"/></svg>`;
    icon.innerHTML = arrowSvg;
    indicator.appendChild(icon);
    
    // Add skip time text
    const timeText = document.createElement('div');
    timeText.style.cssText = `
      font-weight: 600;
      font-size: 14px;
      margin-top: 2px;
      text-align: center;
    `;
    timeText.textContent = `${side === 'left' ? '-' : '+'}${formatTime(skipTime)}`;
    indicator.appendChild(timeText);
    
    indicator.timeText = timeText;
    return indicator;
  }
  
  function getOrCreateIndicators(video) {
    if (!showVisualFeedback) return null;
    
    if (!indicators.has(video)) {
      // Create a container that's positioned relative to the video
      const container = document.createElement('div');
      container.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        overflow: hidden;
        z-index: 2147483647;
      `;
      
      const leftIndicator = createSkipIndicator(video, 'left');
      const rightIndicator = createSkipIndicator(video, 'right');
      
      container.appendChild(leftIndicator);
      container.appendChild(rightIndicator);
      
      // Find the best parent to attach to
      const parent = video.parentElement || document.body;
      if (parent !== document.body) {
        // Make parent positioned if it's not
        const parentPosition = window.getComputedStyle(parent).position;
        if (parentPosition === 'static') {
          parent.style.position = 'relative';
        }
      }
      
      parent.appendChild(container);
      
      indicators.set(video, {
        container: container,
        left: leftIndicator,
        right: rightIndicator
      });
      
      // Position the container relative to the video
      function updatePosition() {
        const rect = video.getBoundingClientRect();
        if (parent === document.body) {
          container.style.left = rect.left + 'px';
          container.style.top = rect.top + 'px';
        } else {
          container.style.left = '0';
          container.style.top = '0';
        }
        container.style.width = rect.width + 'px';
        container.style.height = rect.height + 'px';
      }
      
      // Update position on resize, scroll, etc.
      const resizeObserver = new ResizeObserver(updatePosition);
      resizeObserver.observe(video);
      if (parent !== document.body) {
        resizeObserver.observe(parent);
      }
      
      updatePosition();
    }
    
    return indicators.get(video);
  }
  
  function cleanupIndicators() {
    for (const [video, indicator] of indicators) {
      if (indicator.container && indicator.container.parentNode) {
        indicator.container.parentNode.removeChild(indicator.container);
      }
    }
    indicators.clear();
    cumulativeSkip.clear();
    animationTimeouts.clear();
  }
  
  function updateIndicatorWidth(indicator, seconds) {
    // Adjust width based on time length
    if (seconds < 60) {
      indicator.style.minWidth = '60px';
    } else if (seconds < 3600) {
      indicator.style.minWidth = '90px';
    } else {
      indicator.style.minWidth = '120px';
    }
  }
  
  function showSkipIndicator(video, direction) {
    if (!showVisualFeedback) return;
    
    const videoIndicators = getOrCreateIndicators(video);
    if (!videoIndicators) return;
    
    const indicator = direction === 1 ? videoIndicators.right : videoIndicators.left;
    const oppositeIndicator = direction === 1 ? videoIndicators.left : videoIndicators.right;
    
    // Create a unique key for this video and direction
    const timeoutKey = `${video.videoId || ''}-${direction}`;
    const oppositeTimeoutKey = `${video.videoId || ''}-${direction * -1}`;
    
    // Cancel any existing animations for this indicator
    if (animationTimeouts.has(timeoutKey)) {
      clearTimeout(animationTimeouts.get(timeoutKey));
    }
    
    // Hide opposite indicator if it's showing
    if (animationTimeouts.has(oppositeTimeoutKey)) {
      clearTimeout(animationTimeouts.get(oppositeTimeoutKey));
      oppositeIndicator.style.opacity = '0';
      cumulativeSkip.set(oppositeTimeoutKey, 0);
      animationTimeouts.delete(oppositeTimeoutKey);
    }
    
    // Update cumulative skip amount
    const currentCumulative = cumulativeSkip.get(timeoutKey) || 0;
    const newCumulative = currentCumulative + skipTime;
    cumulativeSkip.set(timeoutKey, newCumulative);
    
    // Update indicator width for longer time displays
    updateIndicatorWidth(indicator, newCumulative);
    
    // Update text with cumulative skip
    const sign = direction === 1 ? '+' : '-';
    indicator.timeText.textContent = `${sign}${formatTime(newCumulative)}`;
    
    // Show with animation
    indicator.style.opacity = '1';
    
    // Hide after delay and reset cumulative skip
    const timeout = setTimeout(() => {
      indicator.style.opacity = '0';
      cumulativeSkip.set(timeoutKey, 0);
      animationTimeouts.delete(timeoutKey);
    }, 800);
    
    animationTimeouts.set(timeoutKey, timeout);
  }
  
  // Get settings from storage
  chrome.storage.local.get(['skipTime', 'showVisualFeedback'], function(result) {
    if (result.skipTime) {
      skipTime = result.skipTime;
      console.log('[Video Skipper] Initial skip time:', skipTime);
    }
    if (result.showVisualFeedback !== undefined) {
      showVisualFeedback = result.showVisualFeedback;
      console.log('[Video Skipper] Visual feedback enabled:', showVisualFeedback);
    }
  });
  
  // Basic check for text inputs
  function isTextInput(element) {
    if (!element) return false;
    
    // Input types that use arrow keys for navigation/editing
    if (element.tagName === "INPUT" && 
        ["text", "password", "email", "number", "search", "tel", "url"].includes(element.type.toLowerCase())) {
      return true;
    }
    
    // Other common text editing elements
    if (element.tagName === "TEXTAREA") return true;
    if (element.isContentEditable) return true;
    
    return false;
  }
  
  // Video skip function
  function handleKeyDown(e) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    
    // Skip if we're in a text input
    if (isTextInput(document.activeElement)) {
      return;
    }
    
    // Find all videos on the page
    const videos = document.querySelectorAll("video");
    if (!videos.length) return;
    
    // Find the best video to control
    const targetVideo = findBestVideo(videos);
    if (!targetVideo) return;
    
    // Assign a unique ID to the video if it doesn't have one
    if (!targetVideo.videoId) {
      targetVideo.videoId = `video-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    // Prevent default behavior
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    
    // Apply time change
    const direction = e.key === "ArrowRight" ? 1 : -1;
    const timeChange = direction * skipTime;
    targetVideo.currentTime += timeChange;
    
    // Show appropriate indicator
    showSkipIndicator(targetVideo, direction);
    
    return false;
  }
  
  // Handle keyup to prevent default behavior
  function handleKeyUp(e) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    
    // Skip if we're in a text input
    if (isTextInput(document.activeElement)) {
      return;
    }
    
    // Check if there are any videos on the page
    const videos = document.querySelectorAll("video");
    if (!videos.length) return;
    
    // Prevent default behavior for arrow keys when we're handling media
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    
    return false;
  }
  
  // Find the best video to control based on visibility and playback status
  function findBestVideo(videos) {
    if (!videos.length) return null;
    if (videos.length === 1) return videos[0];
    
    // For multiple videos, find the best candidate
    let bestVideo = null;
    let bestScore = -1;
    
    for (const video of videos) {
      let score = 0;
      
      // Check visibility
      const rect = video.getBoundingClientRect();
      const isVisible = rect.width > 0 && rect.height > 0 &&
                      rect.top < window.innerHeight && 
                      rect.bottom > 0 &&
                      rect.left < window.innerWidth && 
                      rect.right > 0;
      
      if (isVisible) {
        score += 10;
        
        // Add points based on how much of the video is in the viewport
        const visibleArea = Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0);
        const visibleHeight = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
        const visiblePercent = (visibleArea * visibleHeight) / (rect.width * rect.height);
        score += visiblePercent * 10;
      } else {
        continue; // Skip non-visible videos entirely
      }
      
      // Playing videos get priority
      if (!video.paused) {
        score += 20;
      }
      
      // Videos with audio unmuted get priority
      if (!video.muted) {
        score += 10;
      }
      
      if (score > bestScore) {
        bestScore = score;
        bestVideo = video;
      }
    }
    
    // If no good candidate found, just use the first video
    return bestVideo || videos[0];
  }
  
  // Apply aggressive override to video controls
  function applyAggresiveOverride() {
    // Target all video elements directly
    const videos = document.querySelectorAll("video");
    
    videos.forEach(video => {
      if (!video.hasAttribute('data-skipper-processed')) {
        video.setAttribute('data-skipper-processed', 'true');
        
        // Completely override the arrow key events
        video.addEventListener("keydown", function(e) {
          if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            return false;
          }
        }, true);
        
        // Override any existing keyboard shortcuts
        const originalAddEventListener = video.addEventListener;
        video.addEventListener = function(type, listener, options) {
          if (type === 'keydown' || type === 'keyup' || type === 'keypress') {
            // Don't add keyboard event listeners to the video element
            return;
          }
          return originalAddEventListener.call(this, type, listener, options);
        };
      }
    });
    
    // Target common video player elements
    const playerSelectors = [
      '.video-player', '.player', '[class*="player"]', '[id*="player"]',
      '[class*="controls"]', '[id*="controls"]'
    ];
    
    const playerElements = document.querySelectorAll(playerSelectors.join(', '));
    playerElements.forEach(player => {
      player.addEventListener("keydown", function(e) {
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          return false;
        }
      }, true);
    });
  }
  
  // Storage change listener to keep skipTime in sync across tabs
  function handleStorageChange(changes, area) {
    if (area === 'local') {
      if (changes.skipTime) {
        skipTime = changes.skipTime.newValue;
        console.log('[Video Skipper] Skip time updated to:', skipTime);
      }
      if (changes.showVisualFeedback) {
        showVisualFeedback = changes.showVisualFeedback.newValue;
        console.log('[Video Skipper] Visual feedback enabled:', showVisualFeedback);
        
        // Clean up indicators if visual feedback is disabled
        if (!showVisualFeedback) {
          cleanupIndicators();
        }
      }
    }
  }
  
  // Process the page
  function processPage() {
    applyAggresiveOverride();
  }
  
  // Store handlers in window for potential removal later
  window.videoSkipperKeydownHandler = handleKeyDown;
  window.videoSkipperKeyupHandler = handleKeyUp;
  window.videoSkipperStorageListener = handleStorageChange;
  
  // Add global event listeners with capture phase
  document.addEventListener("keydown", window.videoSkipperKeydownHandler, true);
  document.addEventListener("keyup", window.videoSkipperKeyupHandler, true);
  
  // Add storage change listener to keep skipTime in sync
  chrome.storage.onChanged.addListener(window.videoSkipperStorageListener);
  
  // Process page immediately
  processPage();
  
  // Set up mutation observer to detect new videos
  const observer = new MutationObserver(function(mutations) {
    let hasNewNodes = false;
    
    for (const mutation of mutations) {
      if (mutation.addedNodes.length) {
        hasNewNodes = true;
        break;
      }
    }
    
    if (hasNewNodes) {
      setTimeout(processPage, 100);
    }
  });
  
  // Start observing
  observer.observe(document.body, { childList: true, subtree: true });
  
  // Mark as initialized
  window.hasVideoSkipperListener = true;
  
  // Message listener for updates from background
  chrome.runtime.onMessage.addListener(function(msg) {
    if (msg.action === "updateSkipTime") {
      skipTime = msg.value;
      if (msg.showVisualFeedback !== undefined) {
        showVisualFeedback = msg.showVisualFeedback;
        if (!showVisualFeedback) {
          cleanupIndicators();
        }
      }
      console.log('[Video Skipper] Skip time updated via message to:', skipTime);
      console.log('[Video Skipper] Visual feedback enabled:', showVisualFeedback);
    }
  });
})();