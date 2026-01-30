const TAG = '[QuickSpeed]';
const DEFAULT_SPEED = 1.5;
const OVERLAY_CLASS = 'quick-speed-overlay';

const OVERLAY_STYLE = `
.${OVERLAY_CLASS} {
  position: absolute;
  top: 10px;
  left: 10px;
  background-color: rgba(0, 0, 0, 0.75);
  color: #fff;
  padding: 5px 12px;
  border-radius: 6px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 16px;
  font-weight: 600;
  z-index: 2147483647; 
  pointer-events: none;
  transition: opacity 0.4s ease;
  opacity: 0;
  text-shadow: 0 1px 2px rgba(0,0,0,0.5);
  display: flex !important;
  align-items: center;
  justify-content: center;
  min-width: 50px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.4);
  border: 1px solid rgba(255,255,255,0.1);
}
.${OVERLAY_CLASS}.visible {
  opacity: 1;
}
.${OVERLAY_CLASS}.fading {
  opacity: 0.2;
}
`;

let settings = {
  defaultSpeed: DEFAULT_SPEED,
  step: 0.25
};

const allVideos = new Set();
const rootsWithStyles = new WeakSet();

// Initialize settings from storage
chrome.storage.sync.get(['defaultSpeed', 'step'], (result) => {
  if (result.defaultSpeed) settings.defaultSpeed = parseFloat(result.defaultSpeed);
  if (result.step) settings.step = parseFloat(result.step);
  scanForVideos();
});

// Watch for storage changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.defaultSpeed) settings.defaultSpeed = parseFloat(changes.defaultSpeed.newValue);
  if (changes.step) settings.step = parseFloat(changes.step.newValue);
});


function injectStyles(root) {
    if (!root || rootsWithStyles.has(root)) return;
    
    // For document, we look for head
    // For shadow roots, we just append
    const style = document.createElement('style');
    style.textContent = OVERLAY_STYLE;
    
    try {
        if (root === document) {
            (document.head || document.documentElement).appendChild(style);
        } else {
            root.appendChild(style);
        }
        rootsWithStyles.add(root);
    } catch (e) {
        console.warn(TAG, 'Failed to inject styles into root:', root, e);
    }
}


function getOverlay(video) {
  return video._qsOverlay;
}

function createOverlay(video) {
  if (video._qsOverlay) return video._qsOverlay;

  // Find the root (document or shadow root)
  let root = video.getRootNode();
  injectStyles(root);

  const overlay = document.createElement('div');
  overlay.className = OVERLAY_CLASS;
  overlay.textContent = `${video.playbackRate.toFixed(1)}x`;
  
  if (video.parentNode) {
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
