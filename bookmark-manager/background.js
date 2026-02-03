// Background service worker

let brokenBookmarks = [];
const MAX_CONCURRENT_REQUESTS = 10;
let isScanning = false;

// Open manager page on icon click
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: 'manager.html' });
});

// Message handling
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'startScan') {
    if (!isScanning) {
      scanBookmarks(request.folderId);
    }
    sendResponse({ success: true, isScanning: true });
  } else if (request.action === 'getStatus') {
    sendResponse({ 
      isScanning, 
      brokenCount: brokenBookmarks.length 
    });
  } else if (request.action === 'getBrokenBookmarks') {
    sendResponse({ bookmarks: brokenBookmarks });
  } else if (request.action === 'removeBookmarks') {
    removeBookmarks(request.ids).then((results) => {
      sendResponse({ success: true, results });
    });
    return true; // Async response
  }
});

async function scanBookmarks(folderId = 'root') {
  isScanning = true;
  brokenBookmarks = [];
  
  try {
    // Notify UI scan started
    broadcastStatus('scan_started');

    // Get bookmarks based on folderId
    let tree;
    if (folderId && folderId !== 'root') {
        tree = await chrome.bookmarks.getSubTree(folderId);
    } else {
        tree = await chrome.bookmarks.getTree();
    }
    
    let allLinks = [];
    extractLinks(tree[0], allLinks);

    // Broadcast total count
    broadcastStatus('scan_progress', { total: allLinks.length, processed: 0, broken: 0 });

    // Process in chunks/concurrently
    let processed = 0;
    
    // Simple concurrency queue
    for (let i = 0; i < allLinks.length; i += MAX_CONCURRENT_REQUESTS) {
      if (!isScanning) break; // Allow cancellation? (Not implemented ui for cancel yet)

      const chunk = allLinks.slice(i, i + MAX_CONCURRENT_REQUESTS);
      const promises = chunk.map(async (link) => {
        const isValid = await checkLink(link.url);
        processed++;
        
        if (!isValid) {
          brokenBookmarks.push(link);
        }
        
        // Update progress every check or every chunk
      });

      await Promise.all(promises);
      
      // Send progress update with details for visualizer
      broadcastStatus('scan_progress', { 
        total: allLinks.length, 
        processed: processed,
        broken: brokenBookmarks.length,
        currentUrls: chunk.map(l => l.url) // Send the batch of URLs just checked
      });
    }

    // Save results
    await chrome.storage.local.set({ brokenBookmarks });
    
  } catch (error) {
    console.error('Scan error:', error);
  } finally {
    isScanning = false;
    broadcastStatus('scan_complete', { brokenCount: brokenBookmarks.length });
  }
}

function extractLinks(node, list) {
  if (node.url) {
    list.push({
      id: node.id,
      title: node.title || 'Untitled',
      url: node.url,
      dateAdded: node.dateAdded
    });
  }
  if (node.children) {
    node.children.forEach(child => extractLinks(child, list));
  }
}

async function checkLink(url) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
    
    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      mode: 'no-cors'
    });
    
    clearTimeout(timeoutId);
    return true;
  } catch (error) {
    // Try GET if HEAD fails (some servers block HEAD)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        mode: 'no-cors'
      });
      clearTimeout(timeoutId);
      return true;
    } catch (e) {
      return false;
    }
  }
}

async function removeBookmarks(ids) {
  const results = { success: [], failed: [] };
  for (const id of ids) {
    try {
      await chrome.bookmarks.remove(id);
      results.success.push(id);
      // Update local cache
      brokenBookmarks = brokenBookmarks.filter(b => b.id !== id);
    } catch (error) {
      results.failed.push(id);
    }
  }
  await chrome.storage.local.set({ brokenBookmarks });
  return results;
}

function broadcastStatus(type, data = {}) {
  chrome.runtime.sendMessage({ type, data }).catch(() => {
    // Ignore error if no listeners (e.g. popup/page closed)
  });
}
