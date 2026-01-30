document.addEventListener('DOMContentLoaded', () => {
    const defaultSpeedInput = document.getElementById('defaultSpeed');
    const stepInput = document.getElementById('step');

    // Load saved settings (or defaults)
    // Note: defaults must match content.js
    chrome.storage.sync.get(['defaultSpeed', 'step'], (result) => {
        defaultSpeedInput.value = result.defaultSpeed !== undefined ? result.defaultSpeed : 1.5;
        stepInput.value = result.step !== undefined ? result.step : 0.25;
    });

    function saveSettings() {
        const defaultSpeed = parseFloat(defaultSpeedInput.value);
        const step = parseFloat(stepInput.value);
        
        if (isNaN(defaultSpeed) || isNaN(step)) return;

        chrome.storage.sync.set({
            defaultSpeed: defaultSpeed,
            step: step
        });
    }

    defaultSpeedInput.addEventListener('change', saveSettings);
    stepInput.addEventListener('change', saveSettings);
    
    // Also save on input but debounce? For now just onChange to reduce writes
    // Actually, 'input' is smoother for UI but 'change' (blur/enter) is safer for storage limits.
});
