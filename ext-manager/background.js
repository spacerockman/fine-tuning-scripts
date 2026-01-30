// Core Automation Engine - Commercial Grade (v2)

// Configuration
// rules structure: { "extensionId": ["google.com", "/^https:\/\/.*\.github\.com/"] }
let rules = {}; 
// whitelist: Extensions that should NEVER be auto-disabled
let whitelist = new Set();
let selfId = chrome.runtime.id;

// Initialize
chrome.runtime.onInstalled.addListener(async () => {
    await loadRules();
    whitelist.add(selfId);
    console.log('Smart Extension Manager Initialized');
    checkTabsAndApplyState();
});

// Load rules from storage
async function loadRules() {
    const data = await chrome.storage.local.get(['rules', 'whitelist']);
    rules = data.rules || {};
    const storedWhitelist = data.whitelist || [];
    whitelist = new Set([...storedWhitelist, selfId]);
}

// Event Listeners: Monitor Tab Activity
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' || changeInfo.url) {
        checkTabsAndApplyState();
    }
});

chrome.tabs.onRemoved.addListener(() => {
    checkTabsAndApplyState();
});

chrome.tabs.onActivated.addListener(() => {
    checkTabsAndApplyState();
});

// --- Logging System ---
async function logAction(action, target, details) {
    const logEntry = {
        time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
        action,
        target,
        details,
        timestamp: Date.now()
    };
    
    const data = await chrome.storage.local.get(['logs']);
    const logs = data.logs || [];
    logs.unshift(logEntry);
    
    // Keep only last 100 logs
    const trimmedLogs = logs.slice(0, 100);
    await chrome.storage.local.set({ logs: trimmedLogs });
}

// Main Logic: The Decision Engine
let debounceTimer;
function checkTabsAndApplyState() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(performCheck, 300); // Faster response
}

async function performCheck() {
    try {
        await loadRules(); 
        
        // 1. Get all open tab URLs (Full URLs for Regex matching)
        const tabs = await chrome.tabs.query({});
        const openUrls = new Set();
        
        tabs.forEach(tab => {
            try {
                if (tab.url && !tab.url.startsWith('chrome://')) {
                    openUrls.add(tab.url);
                }
            } catch (e) {}
        });

        // 2. Identify which extensions need to be ON
        const neededExtensions = new Set();
        
        // Add whitelisted items
        whitelist.forEach(id => neededExtensions.add(id));

        const managedExtensionIds = Object.keys(rules);
        
        managedExtensionIds.forEach(extId => {
            const extRules = rules[extId]; // Array of rule strings
            if (!Array.isArray(extRules)) return;

            // Check if ANY rule matches ANY open tab
            const isActive = extRules.some(ruleStr => {
                // Mode 1: Regex (wrapped in /.../)
                if (ruleStr.startsWith('/') && ruleStr.endsWith('/') && ruleStr.length > 2) {
                    try {
                        const pattern = ruleStr.slice(1, -1);
                        const regex = new RegExp(pattern, 'i');
                        return Array.from(openUrls).some(url => regex.test(url));
                    } catch (e) {
                        return false; 
                    }
                } 
                // Mode 2: Keyword/Hostname Match (Legacy/Simple)
                else {
                    return Array.from(openUrls).some(url => {
                        try {
                            const hostname = new URL(url).hostname;
                            return hostname.includes(ruleStr) || url.includes(ruleStr);
                        } catch(e) { return url.includes(ruleStr); }
                    });
                }
            });

            if (isActive) {
                neededExtensions.add(extId);
            }
        });
        
        // 3. Apply State
        const extensions = await chrome.management.getAll();
        
        extensions.forEach(ext => {
            if (ext.id === selfId) return;

            // Only manage if it has rules (Auto Mode)
            if (rules[ext.id] && rules[ext.id].length > 0) {
                const shouldBeEnabled = neededExtensions.has(ext.id);
                
                if (ext.enabled !== shouldBeEnabled) {
                    const actionType = shouldBeEnabled ? 'WAKE' : 'SLEEP';
                    logAction(actionType, ext.name, `Triggered by active tabs state`);
                    console.log(`[Auto-Toggle] ${ext.name} -> ${shouldBeEnabled ? 'ON' : 'OFF'}`);
                    chrome.management.setEnabled(ext.id, shouldBeEnabled);
                }
            }
        });

    } catch (error) {
        console.error('Error in automation loop:', error);
    }
}

// Interface for Dashboard
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getData') {
        Promise.all([
            chrome.management.getAll(),
            chrome.storage.local.get(['rules', 'whitelist', 'pinned'])
        ]).then(([extensions, data]) => {
            sendResponse({
                extensions,
                rules: data.rules || {},
                whitelist: data.whitelist || [],
                pinned: data.pinned || []
            });
        });
        return true; 
    } 
    else if (request.action === 'saveRules') {
        rules = request.rules;
        chrome.storage.local.set({ rules });
        checkTabsAndApplyState();
        sendResponse({ success: true });
    }
    else if (request.action === 'toggleExt') {
        chrome.management.setEnabled(request.id, request.enabled);
        const actionType = 'MANUAL';
        chrome.management.get(request.id).then(ext => {
            logAction(actionType, ext.name, `User ${request.enabled ? 'enabled' : 'disabled'} extension manually`);
        });
        sendResponse({ success: true });
    }
    else if (request.action === 'getLogs') {
        chrome.storage.local.get(['logs']).then(data => {
            sendResponse({ logs: data.logs || [] });
        });
        return true;
    }
    else if (request.action === 'clearLogs') {
        chrome.storage.local.set({ logs: [] }).then(() => {
            sendResponse({ success: true });
        });
        return true;
    }
    else if (request.action === 'savePinned') {
        chrome.storage.local.set({ pinned: request.pinned }).then(() => {
            sendResponse({ success: true });
        });
        return true;
    }
    else if (request.action === 'uninstallExt') {
        chrome.management.uninstall(request.id, { showConfirmDialog: true });
        sendResponse({ success: true });
    }
});

// Click action opens dashboard
chrome.action.onClicked.addListener(() => {
    chrome.tabs.create({ url: 'dashboard.html' });
});
