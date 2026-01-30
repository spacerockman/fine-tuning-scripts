# QuickSpeed - Universal Video Speed Controller

QuickSpeed is a professional-grade Chrome extension that gives you precise control over video playback speed on any website.

## Features

- **Universal Compatibility**: Works on YouTube, Netflix, Vimeo, and almost any site with HTML5 videos.
- **Shadow DOM Support**: Detects videos inside shadow roots (e.g., custom web components).
- **Default Speed**: Automatically sets videos to 1.5x speed (configurable).
- **Keyboard Shortcuts**:
  - `s`: Decrease speed (-0.25x)
  - `d`: Increase speed (+0.25x)
  - `r`: Reset speed to 1.0x
- **Visual Feedback**: Sleek, auto-hiding overlay in the top-left corner.
  - Appears on change.
  - Fades to 10% opacity after 1.5s.
  - Fully hides after 5s of inactivity.
- **Smart Logic**:
  - Does not interfere when typing in search bars or comments.
  - Persists your preferred default speed and step size.

## Installation

1. Open Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** in the top right corner.
3. Click **Load unpacked**.
4. Select the `video-speed-controller` folder.
5. The extension is now active on all tabs!

## Configuration

Click the extension icon in the toolbar to:

- Change the default playback speed (default: 1.5x).
- Adjust the speed change step (default: 0.25x).

## Development

- `content.js`: Handles video detection, speed control, and overlay injection.
- `popup.html/js`: Settings interface.
