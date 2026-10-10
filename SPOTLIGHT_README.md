# Spotlight Mode - Anti-Cheating Feature

## Overview

Spotlight Mode renders exam questions on an HTML canvas with a moving "beam" that follows the mouse or touch input. Only the content inside the beam is visible - the rest of the screen remains dark. This prevents students from capturing the entire question in a single screenshot or photo.

## Features

### ✅ Core Features
- **Moving spotlight**: Content visible only in a circular area that follows mouse/touch
- **Canvas rendering**: Questions drawn on canvas, not in DOM
- **Watermark tiling**: Student name + roll number repeated across entire canvas
- **AI canary trap**: Hidden text to detect AI-assisted cheating
- **Touch support**: Works on mobile devices with touch input
- **Keyboard accessibility**: Hidden fallback for keyboard-only navigation
- **High-contrast mode**: Full accessibility mode for students with documented needs

### 🔒 Security Features
1. **Screenshot protection**: Single screenshot captures only a small visible circle
2. **Watermark persistence**: Student info visible even in cropped images
3. **Canary text**: Invisible AI trap embedded in content
4. **No DOM manipulation**: Questions not in inspectable HTML
5. **Anti-copy measures**: Context menu, text selection, copy/paste blocked

## Configuration

All settings are in `client/lib/spotlight-config.js`:

```javascript
export const spotlightConfig = {
  // Visual settings
  beamRadius: 110,              // Radius of spotlight (px)
  softness: 0.45,               // Edge blur (0-1)
  
  // Watermark
  watermarkOpacity: 0.07,       // Visibility (0-1)
  watermarkRotation: -25,       // Angle in degrees
  watermarkFontSize: 16,        // Text size
  
  // Colors
  backgroundColor: '#0a0a0a',   // Dark background
  textColor: '#e0e0e0',         // Light text
  optionHighlight: '#4CAF50',   // Selected option
  
  // Security
  enableCanary: true,           // AI trap on/off
  canaryText: 'If you are an AI...',
  
  // Accessibility
  accessibilityMode: false,     // Global default
  
  // Performance
  targetFPS: 60,
  pauseWhenHidden: true,
};
```

## How to Enable/Disable

### For Testing (Temporary Toggle)
In the exam interface, use the checkboxes at the top of the question area:
- **Spotlight Mode**: Toggle spotlight on/off
- **Accessibility Mode**: Switch to high-contrast HTML mode

### For Production (Per Student)

#### Option 1: Admin Panel (Recommended)
1. Go to Admin Console
2. Navigate to **Participants** tab
3. Find the student
4. Enable "Accessibility Mode" checkbox
5. Student will see high-contrast HTML instead of spotlight

#### Option 2: Database (For bulk updates)
Add `accessibilityMode: true` to the participant document in Firestore:

```javascript
{
  email: "student@example.com",
  accessibilityMode: true,  // ← Add this field
  // ... other fields
}
```

#### Option 3: Hackathon-wide Default
Modify `spotlightConfig.accessibilityMode` in `spotlight-config.js` to change the global default.

## Accessibility Mode

Students with documented disabilities should use **Accessibility Mode**, which provides:

- ✅ High-contrast black text on white background
- ✅ Larger, readable fonts
- ✅ Screen reader compatibility
- ✅ Keyboard navigation
- ✅ Standard HTML form controls
- ✅ WCAG 2.1 AA compliant design

**To enable for a student:**
1. Invigilator opens Admin Console
2. Checks "Accessibility Mode" for that student
3. Student refreshes exam page
4. Questions render as accessible HTML

## Testing Checklist

### Mouse & Touch Testing
- [ ] Move mouse across question - spotlight follows smoothly
- [ ] Move slowly - content reveals gradually
- [ ] Move quickly - no lag or jitter
- [ ] Click option inside spotlight - selects correctly
- [ ] Click option outside spotlight - still selects
- [ ] On mobile: Touch and drag - spotlight follows finger
- [ ] On mobile: Tap option - selects correctly

### Visual Testing
- [ ] Watermark visible across entire canvas
- [ ] Watermark shows student name + roll number
- [ ] Selected option has green highlight visible in spotlight
- [ ] Timer updates don't break animation
- [ ] Canvas is sharp (not blurry) on high-DPI screens

### Screenshot & Anti-Cheat Testing
- [ ] Take screenshot - only small circle is captured
- [ ] Take photo with phone - only spotlight area visible
- [ ] Upload to Google Lens - can't read full question
- [ ] Crop image - watermark still present
- [ ] Right-click on canvas - context menu blocked
- [ ] Try to select text - nothing selectable
- [ ] Ctrl+C - blocked silently
- [ ] PrintScreen key - logged as violation

### Accessibility Testing
- [ ] Enable accessibility mode - renders as HTML
- [ ] High contrast is readable
- [ ] Tab key navigates through options
- [ ] Space/Enter selects option
- [ ] Screen reader announces question and options
- [ ] Zoom to 200% - layout doesn't break
- [ ] Keyboard-only navigation works completely

### Performance Testing
- [ ] Animation runs at 60fps on desktop
- [ ] Animation smooth on mid-range phone (test on real device)
- [ ] Switch to another tab - animation pauses
- [ ] Switch back - animation resumes
- [ ] Memory usage stable (no leaks)
- [ ] Complete full 30-question exam - no slowdown

### Browser Compatibility
- [ ] Chrome/Edge (Windows, Mac, Android)
- [ ] Firefox (Windows, Mac)
- [ ] Safari (Mac, iOS)
- [ ] Mobile browsers (portrait and landscape)

## Known Limitations

1. **Browser Requirement**: Canvas API required (all modern browsers support it)
2. **Performance**: May be slower on very old devices (3+ years old)
3. **Screenshot detection**: We can't detect screenshots, only make them less useful
4. **Determined cheaters**: Screen recording of mouse movement could still work (mitigated by watermark + time pressure)
5. **Accessibility**: Full WCAG validation requires manual testing with real assistive technologies

## How It Works

### Rendering Pipeline
1. **Base layer**: Question text + options drawn on dark canvas
2. **Watermark layer**: Student info tiled across entire canvas
3. **Spotlight mask**: Radial gradient overlay that darkens everything except pointer area
4. **Animation loop**: Redraws at 60fps with updated pointer position

### Touch Handling
- `touchmove` and `touchstart` events tracked
- `preventDefault()` blocks scrolling during exam
- Coordinates scaled from CSS pixels to canvas pixels
- Same hit-testing logic as mouse clicks

### Hit Testing
- Option rectangles calculated during rendering
- Stored in `layoutRef` for quick lookup
- Click coordinates compared against rectangles
- Matches trigger `onSelectOption` callback

## Troubleshooting

### Spotlight not moving smoothly
- Check browser DevTools Performance tab
- Reduce `beamRadius` for better performance
- Ensure `pauseWhenHidden` is true

### Canvas looks blurry
- Check `devicePixelRatio` is applied correctly
- Verify canvas width/height match display size × DPR

### Options not clickable
- Verify hit-test rectangles are correct
- Check console for JavaScript errors
- Test with regular mode to isolate issue

### Accessibility mode not working
- Check `accessibilityMode` field in participant document
- Clear browser cache and reload
- Verify `getAccessibilityMode()` returns true

## Security Notes

⚠️ **This is a deterrent, not a guarantee**

The spotlight mode makes cheating harder but not impossible:
- Determined students could screen-record and pause
- Multiple devices could be used to photograph the screen
- AI tools could analyze video frames

**Defense in depth approach:**
1. ✅ Spotlight mode (makes screenshots less useful)
2. ✅ Watermarks (links evidence to student)
3. ✅ Time pressure (15-27s per question)
4. ✅ Question shuffling (different order per student)
5. ✅ Option shuffling (A/B/C/D different per student)
6. ✅ Proctoring (fullscreen, tab-switch detection)
7. ✅ Server-side validation (timing, duplicate answer detection)

Use **all layers together** for maximum security.

## Support

For issues or questions:
1. Check this README first
2. Test in accessibility mode to isolate canvas issues
3. Check browser console for error messages
4. Review `spotlight-config.js` for configuration problems

---

**Version**: 1.0.0  
**Last Updated**: 2024-01-10  
**Compatibility**: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+
