(function() {
  let readerActive = false;
  let overlay = null;

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "toggle-reader-view") {
      toggleReader();
    }
  });

  function toggleReader() {
    if (readerActive) {
      removeOverlay();
    } else {
      showOverlay();
    }
  }

  function showOverlay() {
    console.log("The Daily Reader: Extracting content...");
    
    // Clone document to avoid modifying the original page
    const documentClone = document.cloneNode(true);
    
    // Clean up visibility some sites hide content until scroll
    const reader = new Readability(documentClone);
    const article = reader.parse();

    if (!article || !article.content) {
      alert("抱歉，此页面无法转换成阅读模式。内容提取失败。");
      return;
    }

    readerActive = true;
    
    overlay = document.createElement('div');
    overlay.id = 'daily-reader-overlay';
    
    const today = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric', 
      weekday: 'long' 
    });

    overlay.innerHTML = `
      <div id="daily-reader-controls">
        <button id="font-dec">Smaller</button>
        <button id="font-inc">Larger</button>
        <button id="reader-close-btn" style="background: var(--newspaper-accent); color: white; border: none;">EXIT READER</button>
      </div>
      <div class="container">
        <div class="masthead">
          <div style="font-family: 'Old Standard TT', serif; font-size: 0.8rem; text-transform: uppercase; display: flex; justify-content: space-between; margin-bottom: 5px;">
            <span>Weather: Fair & Clear</span>
            <span>London, Saturday Edition</span>
            <span>Established 1851</span>
          </div>
          <h1>The Daily Chronicle</h1>
          <div class="metadata">
            <span>VOL. CLXXIV ... No. 60,342</span>
            <span>${today}</span>
            <span>Price: Two Cents</span>
          </div>
        </div>
        <h2 class="article-title">${article.title}</h2>
        <div class="article-byline">
          By our ${article.byline || 'Special Correspondent'} — Reported from ${article.siteName || new URL(window.location.href).hostname}
        </div>
        <div class="article-content" id="reader-article-content">
          ${article.content}
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    // Event Listeners
    document.getElementById('reader-close-btn').onclick = removeOverlay;
    
    let fontSize = 1.1;
    const contentDiv = document.getElementById('reader-article-content');
    
    document.getElementById('font-inc').onclick = () => {
      fontSize += 0.1;
      contentDiv.style.fontSize = fontSize + 'rem';
    };
    document.getElementById('font-dec').onclick = () => {
      fontSize = Math.max(0.8, fontSize - 0.1);
      contentDiv.style.fontSize = fontSize + 'rem';
    };
    
    // Smooth fade in
    overlay.style.opacity = '0';
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
    });
  }

  function removeOverlay() {
    if (overlay) {
      overlay.style.opacity = '0';
      setTimeout(() => {
        overlay.remove();
        overlay = null;
        document.body.style.overflow = '';
        readerActive = false;
      }, 300);
    }
  }
})();
