const TAG = '[QuickSpeed]';
const DEFAULT_SPEED = 1.5;
const OVERLAY_CLASS = 'quick-speed-overlay';

let settings = {
  defaultSpeed: DEFAULT_SPEED,
  step: 0.25
};

const allVideos = new Set();

// Initialize settings from storage
chrome.storage.sync.get(['defaultSpeed', 'step'], (result) => {
  if (result.defaultSpeed) settings.defaultSpeed = parseFloat(result.defaultSpeed);
  if (result.step) settings.step = parseFloat(result.step);
  
  // Initial scan
  scanForVideos();
});

// Watch for storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (changes.defaultSpeed) settings.defaultSpeed = parseFloat(changes.defaultSpeed.newValue);
  if (changes.step) settings.step = parseFloat(changes.step.newValue);
});


function getOverlay(video) {
  return video._qsOverlay;
}

function createOverlay(video) {
  if (video._qsOverlay) return video._qsOverlay;

  const overlay = document.createElement('div');
  overlay.className = OVERLAY_CLASS;
  overlay.textContent = `${video.playbackRate.toFixed(1)}x`;
  
  // Insert overlay into the parent of the video
  if (video.parentNode) {
      // Ensure parent is positioned so absolute positioning works
      const parentStyle = window.getComputedStyle(video.parentNode);
      if (parentStyle.position === 'static') {
          video.parentNode.style.position = 'relative';
      }
      video.parentNode.appendChild(overlay);
  }
  
  video._qsOverlay = overlay;
  return overlay;
}

function updateOverlay(video) {
  const overlay = getOverlay(video);
  if (overlay) {
      overlay.textContent = `${video.playbackRate.toFixed(1)}x`;
      
      // Reset classes
      overlay.classList.remove('fading');
      overlay.classList.add('visible');

      // Clear existing timeout if any
      if (overlay._qsTimeout) clearTimeout(overlay._qsTimeout);
      if (overlay._qsFadeTimeout) clearTimeout(overlay._qsFadeTimeout);

      // 1.5 seconds later, start fading (almost transparent)
      overlay._qsFadeTimeout = setTimeout(() => {
          overlay.classList.remove('visible');
          overlay.classList.add('fading');
      }, 1500);

      // 5 seconds later, hide completely to avoid any visual clutter
      overlay._qsTimeout = setTimeout(() => {
          overlay.classList.remove('fading');
      }, 5000);
  }
}

function removeOverlay(video) {
    const overlay = getOverlay(video);
    if (overlay && overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
    }
    video._qsOverlay = null; // Clear reference
}

function handleVideo(video) {
    if (allVideos.has(video)) return;
    
    allVideos.add(video);
    createOverlay(video);

    // Enforce default speed if near 1.0 (assuming unmodified)
    if (Math.abs(video.playbackRate - 1.0) < 0.1) {
        video.playbackRate = settings.defaultSpeed;
    }
    updateOverlay(video);

    video.addEventListener('ratechange', () => {
        updateOverlay(video);
    });
    
    video.addEventListener('emptied', () => {
         // Video source cleared
         updateOverlay(video);
    });
}

function handleRemovedVideo(video) {
    if (allVideos.has(video)) {
        removeOverlay(video);
        allVideos.delete(video);
    }
}

// Deep traversal for Shadow DOM
function scanRoot(root) {
    if (!root) return;

    // 1. Check current root for videos
    const videos = root.querySelectorAll ? root.querySelectorAll('video') : [];
    videos.forEach(handleVideo);

    // 2. Check all children for shadow roots
    const allNodes = root.querySelectorAll ? root.querySelectorAll('*') : [];
    allNodes.forEach(node => {
        if (node.shadowRoot) {
            scanRoot(node.shadowRoot);
        }
    });
}

function scanForVideos() {
    scanRoot(document);
}

// MutationObserver for adding/removing videos
const observer = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
        // Handle added nodes
        mutation.addedNodes.forEach(node => {
            if (node.nodeName === 'VIDEO') {
                handleVideo(node);
            } else if (node.querySelectorAll) {
                // Check if node itself has shadow root? 
                scanRoot(node); 
            }
        });

        // Handle removed nodes
        mutation.removedNodes.forEach(node => {
            if (node.nodeName === 'VIDEO') {
                handleRemovedVideo(node);
            } else if (node.querySelectorAll) {
                const videos = node.querySelectorAll('video');
                videos.forEach(handleRemovedVideo);
            }
        });
    });
});

observer.observe(document.documentElement || document.body, { 
    childList: true, 
    subtree: true 
});


// Keyboard Listeners
document.addEventListener('keydown', (e) => {
    // Ignore inputs
    const target = e.target;
    const isInput = target.tagName === 'INPUT' || 
                    target.tagName === 'TEXTAREA' || 
                    target.isContentEditable;
    if (isInput) return;
    
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const key = e.key.toLowerCase();
    
    if (key === 's' || key === 'd' || key === 'r') {
        if (allVideos.size === 0) return;
        
        allVideos.forEach(video => {
            let newSpeed = video.playbackRate;
            if (key === 's') {
                newSpeed = Math.max(0.1, newSpeed - settings.step);
            } else if (key === 'd') {
                newSpeed = Math.min(16.0, newSpeed + settings.step);
            } else if (key === 'r') {
                newSpeed = 1.0;
            }
            video.playbackRate = newSpeed;
        });
    }
});

// Periodic scan to catch anything missed (e.g. rapid DOM changes or deep weirdness)
setInterval(scanForVideos, 2000);
