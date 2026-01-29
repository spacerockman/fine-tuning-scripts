// Dashboard Controller

let extensions = [];
let rules = {};
let whitelist = [];
let currentEditId = null;

document.addEventListener('DOMContentLoaded', init);

async function init() {
    await refreshData();
    setupNavigation();
    setupSearch();
    setupModal();
}

async function refreshData() {
    const data = await chrome.runtime.sendMessage({ action: 'getData' });
    extensions = data.extensions;
    rules = data.rules;
    whitelist = data.whitelist;
    
    updateStats();
    renderExtensions();
}

// --- Navigation ---
function setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            // nav state
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            item.classList.add('active');
            
            // view state
            const viewId = item.dataset.view;
            document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
            document.getElementById(`view-${viewId}`).classList.add('active');
            
            // title
            document.getElementById('pageTitle').textContent = item.textContent.trim();
        });
    });
}

// --- Stats ---
function updateStats() {
    const total = extensions.length;
    const active = extensions.filter(e => e.enabled).length;
    const managed = Object.keys(rules).length;

    document.getElementById('statTotal').textContent = total;
    document.getElementById('statActive').textContent = active;
    document.getElementById('statManaged').textContent = managed;
}

// --- Extension Grid ---
function renderExtensions(filter = 'all', searchTerm = '') {
    const grid = document.getElementById('extGrid');
    grid.innerHTML = '';

    const sortedExtensions = extensions.sort((a, b) => {
        // Managed extensions first
        const aManaged = !!rules[a.id];
        const bManaged = !!rules[b.id];
        if (aManaged && !bManaged) return -1;
        if (!aManaged && bManaged) return 1;
        return a.name.localeCompare(b.name);
    });

    sortedExtensions.forEach(ext => {
        // Filters
        if (filter === 'enabled' && !ext.enabled) return;
        if (filter === 'disabled' && ext.enabled) return;
        if (searchTerm && !ext.name.toLowerCase().includes(searchTerm.toLowerCase())) return;

        const isManaged = !!rules[ext.id];
        const card = document.createElement('div');
        card.className = 'ext-card';
        
        // Icon
        const iconUrl = ext.icons ? ext.icons[ext.icons.length - 1].url : 'icon48.png';
        
        card.innerHTML = `
            <img src="${iconUrl}" class="ext-icon" alt="icon">
            <div class="ext-info">
                <div class="ext-name" title="${ext.name}">${ext.name}</div>
                <div class="ext-status ${ext.enabled ? 'enabled' : 'disabled'}">
                    ${ext.enabled ? 'Active' : 'Inactive'}
                </div>
                ${isManaged ? '<span style="font-size:10px; color:#3699ff; background:#e1f0ff; padding:2px 4px; border-radius:4px;">AUTO</span>' : ''}
                <div class="ext-actions">
                    <button class="btn-sm toggle-btn" data-id="${ext.id}">
                        ${ext.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button class="btn-sm btn-rule" data-id="${ext.id}">
                        ${isManaged ? 'Edit Rules' : 'Add Rule'}
                    </button>
                </div>
            </div>
        `;

        // Listeners included in HTML generation? No, safer to add manually or delegate
        // Delegate simpler here:
        card.querySelector('.toggle-btn').addEventListener('click', () => toggleExtension(ext.id, !ext.enabled));
        card.querySelector('.btn-rule').addEventListener('click', () => openRuleEditor(ext.id));
        
        grid.appendChild(card);
    });
}

// --- Searching ---
function setupSearch() {
    const input = document.getElementById('globalSearch');
    input.addEventListener('input', (e) => {
        renderExtensions('all', e.target.value);
    });
}

// --- Actions ---
async function toggleExtension(id, enabled) {
    await chrome.runtime.sendMessage({ action: 'toggleExt', id, enabled });
    await refreshData();
}

// --- Rule Modal & Regex Logic ---
const modal = document.getElementById('ruleModal');
let tempRules = []; // Temporary rules for the currently open modal

function setupModal() {
    document.getElementById('closeModal').addEventListener('click', closeModal);
    document.getElementById('cancelModal').addEventListener('click', closeModal);
    
    document.getElementById('addRuleBtn').addEventListener('click', () => {
        const input = document.getElementById('newRuleInput');
        const type = document.getElementById('ruleType').value;
        let value = input.value.trim();

        if (!value) return;

        // Auto-wrap Regex if user selected Regex but didn't wrap it
        if (type === 'regex' && !value.startsWith('/')) {
            value = `/${value}/`;
        }
        
        // Validation
        if (value.startsWith('/')) {
            try {
                new RegExp(value.slice(1, -1));
            } catch(e) {
                alert('Invalid Regex Pattern');
                return;
            }
        }

        tempRules.push(value);
        renderModalRules();
        input.value = '';
    });

    document.getElementById('saveRulesBtn').addEventListener('click', async () => {
        // Save to global rules
        if (currentEditId) {
            if (tempRules.length > 0) {
                rules[currentEditId] = tempRules;
            } else {
                delete rules[currentEditId]; // Empty rules = Remove management
            }
            
            await chrome.runtime.sendMessage({ action: 'saveRules', rules });
            closeModal();
            refreshData();
        }
    });
}

function openRuleEditor(extId) {
    currentEditId = extId;
    const ext = extensions.find(e => e.id === extId);
    tempRules = rules[extId] ? [...rules[extId]] : [];
    
    document.getElementById('modalTitle').textContent = `Config: ${ext.name}`;
    renderModalRules();
    
    modal.classList.remove('hidden');
}

function renderModalRules() {
    const list = document.getElementById('modalRuleList');
    list.innerHTML = '';
    
    if (tempRules.length === 0) {
        list.innerHTML = '<div style="color:#999; text-align:center; padding:20px;">No rules configured. Extension runs manually.</div>';
        return;
    }

    tempRules.forEach((rule, index) => {
        const isRegex = rule.startsWith('/') && rule.endsWith('/');
        const item = document.createElement('div');
        item.className = 'rule-item';
        
        item.innerHTML = `
            <div>
                <span class="tag ${isRegex ? 'regex' : 'domain'}">${isRegex ? 'REGEX' : 'DOMAIN'}</span>
                <code>${isRegex ? rule : rule}</code>
            </div>
            <button class="btn-sm" style="border:none; color:#f64e60" data-idx="${index}">×</button>
        `;
        
        item.querySelector('button').addEventListener('click', () => {
            tempRules.splice(index, 1);
            renderModalRules();
        });
        
        list.appendChild(item);
    });
}

function closeModal() {
    modal.classList.add('hidden');
    currentEditId = null;
    tempRules = [];
}
