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

    // Process images - smart sizing based on dimensions
    processImages();

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

  // Smart image processing - classify images by size and wrap in figure if needed
  function processImages() {
    const contentDiv = document.getElementById('reader-article-content');
    if (!contentDiv) return;

    const images = contentDiv.querySelectorAll('img');
    
    images.forEach((img) => {
      // Function to classify and style the image
      const classifyImage = () => {
        const naturalWidth = img.naturalWidth;
        const naturalHeight = img.naturalHeight;
        
        // Skip tiny images (likely icons, spacers, or tracking pixels)
        if (naturalWidth < 50 || naturalHeight < 50) {
          img.style.display = 'none';
          return;
        }
        
        // Determine size class based on image dimensions
        let sizeClass;
        if (naturalWidth >= 600 || (naturalWidth >= 400 && naturalHeight >= 300)) {
          sizeClass = 'img-full';  // Large images - span all columns
        } else if (naturalWidth >= 300 || naturalHeight >= 250) {
          sizeClass = 'img-medium';  // Medium images - span all, smaller width
        } else {
          sizeClass = 'img-small';  // Small images - float within column
        }
        
        // Check if image is already in a figure
        let figure = img.closest('figure');
        
        if (!figure) {
          // Wrap image in figure element
          figure = document.createElement('figure');
          img.parentNode.insertBefore(figure, img);
          figure.appendChild(img);
          
          // Try to find a caption from alt text or nearby text
          const altText = img.alt;
          if (altText && altText.length > 10) {
            const caption = document.createElement('figcaption');
            caption.textContent = altText;
            figure.appendChild(caption);
          }
        }
        
        // Apply size class to figure
        figure.classList.add(sizeClass);
        
        console.log(`Image classified: ${sizeClass} (${naturalWidth}x${naturalHeight})`);
      };

      // If image is already loaded, classify immediately
      if (img.complete && img.naturalWidth > 0) {
        classifyImage();
      } else {
        // Wait for image to load
        img.onload = classifyImage;
        img.onerror = () => {
          // Hide broken images
          img.style.display = 'none';
        };
      }
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
