# AWS Codeathon 2K26 Theme Applied ✅

## Theme Overview

The application now features the AWS Codeathon 2K26 branding with:
- **Cream graph-paper background** with orange gradient blobs in corners
- **Black brush-marker headlines** with yellow highlighter swipes
- **Orange-to-red gradient buttons** with 3D press effect
- **White cards** with orange borders and soft shadows
- **Handwritten taglines** and ribbons

## Files Updated

### 1. `apps/web/app/layout.js`
- Updated metadata: "AWS Codeathon 2K26"
- Description: "AWS Club GIST · Learn | Build | Innovate on the cloud"
- Theme color: `#ff8a1f` (orange)
- Added Google Fonts:
  - **Permanent Marker** - Headlines and timer
  - **Caveat** (weight 700) - Handwritten taglines
  - **Nunito** (400, 600, 800) - Body text

### 2. `apps/web/app/globals.css` (Complete replacement)

#### Color Palette:
```css
--bg: #fdf9f0     /* Cream background */
--card: #fff       /* White cards */
--tx: #17140f      /* Dark text */
--mu: #6b5f52      /* Muted text */
--bd: #ffd3a3      /* Orange borders */
--pr: #f26a1b      /* Primary orange */
--pr-h: #e8501a    /* Primary hover (darker) */
--or: #ff8a1f      /* Bright orange */
--yl: #ffd23f      /* Yellow highlighter */
--er: #d92d20      /* Error red */
--ok: #12803c      /* Success green */
```

#### New CSS Classes:
- `.hl` - Yellow highlighter swipe effect
- `.ribbon` - Orange gradient ribbon with rotation
- `.tagline` - Handwritten tagline style
- `.eyebrow` - Small handwritten label
- `.brand` - Logo + ribbon layout
- `.steps` - Numbered instruction cards

#### Background Effects:
- Graph-paper grid (28px × 28px)
- 4 radial gradient blobs in corners:
  - Top-left: Orange (55% opacity)
  - Top-right: Orange (45% opacity)
  - Bottom-right: Red-orange (45% opacity)
  - Bottom-left: Yellow-orange (40% opacity)

#### Button Effects:
- Orange-to-red gradient
- 4px shadow that compresses on click
- 3D press animation
- Yellow outline on focus

#### Card Style:
- 2px orange border
- 22px border radius
- 6px orange shadow underneath
- Soft ambient shadow

### 3. `apps/web/components/Login.js`
- Added AWS logo (from external URL)
- Added "AWS CLUB | GIST" ribbon
- Updated headline: "<span className="hl">AWS Codeathon</span> 2K26"
- Added tagline: "Learn | Build | Innovate on the cloud"
- Changed button text: "Sign in →"

### 4. `apps/web/components/Participant.js`
- Instructions screen:
  - Added "AWS CLUB | GIST" ribbon
  - Headline with highlighter: "<span className="hl">{me.hackathon}</span>"
  - Converted bullet list to `.steps` (numbered cards)
  - Updated button text: "Enter fullscreen & begin →"
- Submitted screen:
  - Added highlighter to "Exam submitted"

## Visual Features

### Typography Hierarchy:
1. **Headlines (h1)**: Permanent Marker, 26px
2. **Subheads (h2)**: Permanent Marker, 17px  
3. **Taglines**: Caveat Bold, 19px, uppercase
4. **Body**: Nunito, 15px
5. **Timer**: Permanent Marker, 18px (in exam bar)

### Interactive Elements:
- **Buttons**: Press down 4px on click
- **Cards**: Lift with shadow on hover
- **Inputs**: Yellow outline on focus
- **Tabs**: Yellow background when active

### Accessibility:
- All fonts have fallbacks (Impact, Segoe UI, system fonts)
- Reduced motion supported
- Keyboard navigation with visible focus states
- Semantic HTML structure maintained

## Theme Comparison

| Element | Before | After |
|---------|--------|-------|
| Background | Gray/dark | Cream with orange blobs + grid |
| Cards | Simple border | Orange border + 3D shadow |
| Headlines | Regular font | Marker font + highlighter |
| Buttons | Flat blue | 3D orange gradient with press |
| Instructions | Plain bullets | Numbered dashed cards |
| Overall feel | Professional/corporate | Fun/energetic/event |

## Brand Elements

### AWS Logo:
Loaded from: `https://aws-codeathon-at-gist-site.vercel.app/assets/aws-logo.png`
- 30px height
- Appears on login screen with ribbon

### Ribbons:
```css
background: linear-gradient(100deg, var(--or), var(--pr-h));
transform: rotate(-2deg);
```
Used for: "AWS CLUB | GIST" badges

### Highlighter Effect:
```css
background: linear-gradient(transparent 52%, var(--yl) 52%, var(--yl) 92%, transparent 92%);
```
Used on: "AWS Codeathon", exam titles, "Exam submitted"

## Performance Notes

- Google Fonts load asynchronously with preconnect
- CSS gradients are GPU-accelerated
- Animations use transform (not position) for smooth 60fps
- `prefers-reduced-motion` disables transitions for accessibility

## Browser Compatibility

- Modern browsers (Chrome, Firefox, Safari, Edge)
- Fallback fonts for offline/blocked Google Fonts
- CSS Grid for layout (IE11 not supported)

## Next Steps

If you need to adjust:
1. **Colors**: Edit `:root` variables in `globals.css`
2. **Fonts**: Update Google Fonts link in `layout.js`
3. **Logo**: Replace URL in `Login.js` or add to `public/` folder
4. **Copy**: Edit text in `Login.js` and `Participant.js`

## Testing Checklist

- [x] Login screen displays correctly
- [x] Instructions screen shows numbered cards
- [x] Buttons have 3D press effect
- [x] Highlighter appears on headlines
- [x] Orange blobs visible in corners
- [ ] Test on actual exam flow
- [ ] Verify on mobile devices
- [ ] Check with screen reader
- [ ] Test with reduced motion

---

**Theme Status**: ✅ Applied and ready for testing

**Dev Server**: Running on http://localhost:3000 (auto-reloading)

Refresh your browser to see the new AWS Codeathon 2K26 theme!
