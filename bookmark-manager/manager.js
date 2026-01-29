// State
let allBroken = [];
let selectedIds = new Set();
let isScanning = false;

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize
  await refreshStatus();
  
  // Event Listeners
  document.getElementById('scanBtn').addEventListener('click', startScan);
  document.getElementById('selectAll').addEventListener('change', toggleSelectAll);
  document.getElementById('deleteSelectedBtn').addEventListener('click', deleteSelected);
  
  // Message Listener
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'scan_started') {
      setScanningState(true);
    } else if (message.type === 'scan_progress') {
      updateProgress(message.data);
    } else if (message.type === 'scan_complete') {
      setScanningState(false);
      loadResults();
    }
  });
});

async function refreshStatus() {
  const status = await chrome.runtime.sendMessage({ action: 'getStatus' });
  if (status.isScanning) {
    setScanningState(true);
  } else {
    loadResults();
  }
}

function setScanningState(scanning) {
  isScanning = scanning;
  const scanBtn = document.getElementById('scanBtn');
  const emptyState = document.getElementById('emptyState');
  const scanningState = document.getElementById('scanningState');
  const listState = document.getElementById('bookmarkList');
  const progressBox = document.getElementById('scanProgressBox');

  if (scanning) {
    scanBtn.disabled = true;
    scanBtn.innerHTML = '<span class="loader-xs"></span> 扫描中...';
    emptyState.classList.add('hidden');
    listState.classList.add('hidden');
    scanningState.classList.remove('hidden');
    progressBox.classList.remove('hidden');
  } else {
    scanBtn.disabled = false;
    scanBtn.innerHTML = '<span class="btn-icon">🔍</span> 全面扫描';
    scanningState.classList.add('hidden');
  }
}

function updateProgress(data) {
  const box = document.getElementById('scanProgressBox');
  const bar = document.getElementById('progressBar');
  const text = document.getElementById('progressText');
  const brokenCount = document.getElementById('brokenCount');
  
  // Update sidebar stats
  box.classList.remove('hidden');
  const percent = Math.round((data.processed / data.total) * 100);
  bar.style.width = `${percent}%`;
  text.textContent = `${data.processed} / ${data.total}`;
  brokenCount.textContent = data.broken;

  // Update Visualizer
  const scanPercent = document.getElementById('scanPercent');
  if (scanPercent) {
    scanPercent.textContent = `${percent}%`;
  }

  // Update Terminal Log
  if (data.currentUrls && data.currentUrls.length > 0) {
    const logContainer = document.getElementById('terminalLog');
    if (logContainer) {
      data.currentUrls.forEach(url => {
        const line = document.createElement('div');
        line.className = 'log-line url';
        line.textContent = `> CHECKING: ${url}`;
        logContainer.appendChild(line);
      });

      // Keep only last 50 lines
      while (logContainer.children.length > 50) {
        logContainer.removeChild(logContainer.firstChild);
      }
    }
  }
}

async function startScan() {
  setScanningState(true);
  await chrome.runtime.sendMessage({ action: 'startScan' });
}

async function loadResults() {
  const response = await chrome.runtime.sendMessage({ action: 'getBrokenBookmarks' });
  allBroken = response.bookmarks || [];
  
  renderList();
  updateStats();
}

function renderList() {
  const list = document.getElementById('bookmarkList');
  const emptyState = document.getElementById('emptyState');
  
  list.innerHTML = '';
  selectedIds.clear();
  updateSelectionUI();

  if (allBroken.length === 0) {
    list.classList.add('hidden');
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  list.classList.remove('hidden');

  allBroken.forEach(item => {
    const card = document.createElement('div');
    card.className = 'bookmark-card';
    card.dataset.id = item.id;
    
    card.innerHTML = `
      <label class="checkbox-container card-checkbox">
        <input type="checkbox" value="${item.id}">
        <span class="checkmark"></span>
      </label>
      <div class="card-content">
        <div class="card-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
        <div class="card-url" title="${escapeHtml(item.url)}">${escapeHtml(item.url)}</div>
      </div>
      <div class="card-actions">
        <button class="icon-btn edit-btn" title="编辑">✏️</button>
      </div>
    `;

    // Listeners
    const checkbox = card.querySelector('input');
    checkbox.addEventListener('change', (e) => toggleSelection(item.id, e.target.checked));
    
    const editBtn = card.querySelector('.edit-btn');
    editBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: `chrome://bookmarks/?id=${item.id}` });
    });

    list.appendChild(card);
  });
}

function toggleSelection(id, isSelected) {
  if (isSelected) {
    selectedIds.add(id);
    document.querySelector(`.bookmark-card[data-id="${id}"]`).classList.add('selected');
  } else {
    selectedIds.delete(id);
    document.querySelector(`.bookmark-card[data-id="${id}"]`).classList.remove('selected');
  }
  updateSelectionUI();
}

function toggleSelectAll(e) {
  const isChecked = e.target.checked;
  const checkboxes = document.querySelectorAll('.card-checkbox input');
  
  checkboxes.forEach(cb => {
    cb.checked = isChecked;
    const card = cb.closest('.bookmark-card');
    const id = card.dataset.id;
    toggleSelection(id, isChecked);
  });
}

function updateSelectionUI() {
  const countSpan = document.getElementById('selectedCount');
  const deleteBtn = document.getElementById('deleteSelectedBtn');
  const selectAll = document.getElementById('selectAll');
  
  countSpan.textContent = selectedIds.size;
  deleteBtn.disabled = selectedIds.size === 0;
  
  // Update Select All checkbox state partial/full
  if (selectedIds.size === 0) {
    selectAll.checked = false;
    selectAll.indeterminate = false;
  } else if (selectedIds.size === allBroken.length) {
    selectAll.checked = true;
    selectAll.indeterminate = false;
  } else {
    selectAll.checked = false;
    selectAll.indeterminate = true;
  }
}

async function deleteSelected() {
  if (selectedIds.size === 0) return;
  
  if (!confirm(`确定要删除选中的 ${selectedIds.size} 个书签吗？`)) return;

  const idsToDelete = Array.from(selectedIds);
  const deleteBtn = document.getElementById('deleteSelectedBtn');
  deleteBtn.innerHTML = '删除中...';
  deleteBtn.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({ 
      action: 'removeBookmarks', 
      ids: idsToDelete 
    });

    if (response.success) {
      showToast('删除成功');
      loadResults(); // Reload
    }
  } catch (error) {
    console.error(error);
    showToast('删除遇到错误');
  }
}

function updateStats() {
  document.getElementById('brokenCount').textContent = allBroken.length;
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
