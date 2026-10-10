'use client';
import { useEffect, useRef, useState } from 'react';
import { spotlightConfig } from '../lib/spotlight-config';

/**
 * SpotlightQuestion - Renders a question on canvas with a moving spotlight effect
 * Content is only visible inside a circular beam that follows the mouse/touch
 * 
 * Props:
 * - question: { id, text, options: [{key, text}], marks, subject }
 * - onSelectOption: (optionKey) => void
 * - selectedOption: string | null (A/B/C/D)
 * - studentLabel: string (roll number + name for watermark)
 * - beamRadius: number (optional, default from config)
 * - softness: number (optional, default from config)
 */
export default function SpotlightQuestion({
  question,
  onSelectOption,
  selectedOption,
  studentLabel,
  beamRadius = spotlightConfig.beamRadius,
  softness = spotlightConfig.softness,
}) {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const pointerRef = useRef({ x: 0, y: 0 });
  const layoutRef = useRef({ questionRect: null, optionRects: [] });
  const [canvasReady, setCanvasReady] = useState(false);

  // Handle pointer move (mouse or touch)
  const handlePointerMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if (e.type === 'touchmove' || e.type === 'touchstart') {
      e.preventDefault(); // Prevent scrolling
      const touch = e.touches[0];
      if (touch) {
        pointerRef.current = {
          x: (touch.clientX - rect.left) * scaleX,
          y: (touch.clientY - rect.top) * scaleY,
        };
      }
    } else {
      pointerRef.current = {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    }
  };

  // Handle click/tap to select option
  const handleCanvasClick = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    
    // Get click position in CSS pixels
    let clickX, clickY;
    if (e.type === 'touchend') {
      const touch = e.changedTouches[0];
      clickX = touch.clientX - rect.left;
      clickY = touch.clientY - rect.top;
    } else {
      clickX = e.clientX - rect.left;
      clickY = e.clientY - rect.top;
    }

    // Hit test against option rectangles (coordinates are in CSS pixels, same as click)
    const layout = layoutRef.current;
    if (!layout || !layout.optionRects) return;
    
    for (let i = 0; i < layout.optionRects.length; i++) {
      const r = layout.optionRects[i];
      // Check if click is inside this option's rectangle
      if (clickX >= r.x && clickX <= r.x + r.w && clickY >= r.y && clickY <= r.y + r.h) {
        // Found the clicked option - select it
        const clickedOption = question.options[i];
        console.log('Clicked option:', clickedOption.key, clickedOption.text); // Debug log
        onSelectOption(clickedOption.key);
        break;
      }
    }
  };

  // Word wrapping helper - better wrapping for mobile
  const wrapText = (ctx, text, maxWidth) => {
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine + (currentLine ? ' ' : '') + word;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
  };

  // Draw content on canvas
  const drawContent = (ctx, width, height) => {
    // Responsive sizing based on canvas width
    const isMobile = width < 600;
    const padding = isMobile ? 30 : 40; // More padding on mobile
    const optionPadding = isMobile ? 18 : 20;
    const lineHeight = isMobile ? 35 : 32; // Much more line height for mobile
    const optionHeight = isMobile ? 100 : 70; // Much taller options
    const optionSpacing = isMobile ? 15 : 15;
    const questionFontSize = isMobile ? 24 : 26; // Larger on mobile
    const optionFontSize = isMobile ? 18 : 19;

    // Clear canvas with dark background
    ctx.fillStyle = spotlightConfig.backgroundColor;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = spotlightConfig.textColor;
    ctx.textBaseline = 'top';

    // Draw question text (bold, large, brighter)
    ctx.font = `bold ${questionFontSize}px sans-serif`;
    ctx.fillStyle = '#ffffff'; // Brighter white for question
    const questionMaxWidth = width - padding * 2;
    const questionLines = wrapText(ctx, question.text, questionMaxWidth);
    let y = padding;
    
    // Draw each line of question with proper spacing
    questionLines.forEach((line) => {
      ctx.fillText(line, padding, y);
      y += lineHeight;
    });

    // Add extra space after question
    y += isMobile ? 20 : 15;

    // Draw marks indicator
    ctx.font = `${isMobile ? 15 : 16}px sans-serif`;
    ctx.fillStyle = '#aaa';
    ctx.fillText(`[${question.marks} mark${question.marks > 1 ? 's' : ''}]`, padding, y);
    y += isMobile ? 60 : 50;

    // Draw options in grid (2x2 on desktop, 1 column on mobile)
    const options = question.options;
    const optionRects = [];
    
    const cols = isMobile ? 1 : 2;
    const gridWidth = isMobile ? (width - padding * 2) : (width - padding * 2 - optionSpacing) / 2;

    ctx.font = `${optionFontSize}px sans-serif`;
    for (let i = 0; i < options.length; i++) {
      const opt = options[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = padding + col * (gridWidth + optionSpacing);
      const y_pos = y + row * (optionHeight + optionSpacing);

      // Store rectangle for hit testing
      optionRects.push({ x, y: y_pos, w: gridWidth, h: optionHeight, key: opt.key });

      // Draw option background (brighter)
      ctx.fillStyle = selectedOption === opt.key ? spotlightConfig.optionHighlight : '#2a2a2a';
      ctx.fillRect(x, y_pos, gridWidth, optionHeight);

      // Draw option border (highlight if selected)
      ctx.strokeStyle = selectedOption === opt.key ? '#66bb6a' : '#444';
      ctx.lineWidth = selectedOption === opt.key ? 3 : 2;
      ctx.strokeRect(x, y_pos, gridWidth, optionHeight);

      // Draw option text (brighter)
      ctx.fillStyle = selectedOption === opt.key ? '#ffffff' : '#e8e8e8';
      const optionText = `${opt.key}) ${opt.text}`;
      const optionMaxWidth = gridWidth - optionPadding * 2;
      const optionLines = wrapText(ctx, optionText, optionMaxWidth);
      
      // Draw each line of option text with more spacing
      optionLines.forEach((line, idx) => {
        const lineY = y_pos + optionPadding + idx * (isMobile ? 26 : 24);
        ctx.fillText(line, x + optionPadding, lineY);
      });
    }

    layoutRef.current.optionRects = optionRects;

    // Draw canary (AI trap) - very faint, tiny
    if (spotlightConfig.enableCanary) {
      ctx.font = '8px monospace';
      ctx.fillStyle = 'rgba(128, 128, 128, 0.02)';
      ctx.fillText(spotlightConfig.canaryText, padding, height - 20);
    }
  };

  // Draw watermark tiles
  const drawWatermark = (ctx, width, height) => {
    ctx.save();
    ctx.fillStyle = `rgba(128, 128, 128, ${spotlightConfig.watermarkOpacity})`;
    ctx.font = `${spotlightConfig.watermarkFontSize}px sans-serif`;

    const spacing = spotlightConfig.watermarkSpacing;
    const lineHeight = spotlightConfig.watermarkLineHeight;
    const cols = Math.ceil(width / spacing) + 2;
    const rows = Math.ceil(height / lineHeight) + 2;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = col * spacing;
        const y = row * lineHeight;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate((spotlightConfig.watermarkRotation * Math.PI) / 180);
        ctx.fillText(studentLabel, 0, 0);
        ctx.restore();
      }
    }

    ctx.restore();
  };

  // Animation loop
  const animate = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Step 1: Clear and fill with dark background
    ctx.fillStyle = spotlightConfig.backgroundColor;
    ctx.fillRect(0, 0, width, height);

    // Step 2: Create a clipping region for the spotlight
    const pointer = pointerRef.current;
    ctx.save();
    
    // Create circular clipping path
    ctx.beginPath();
    ctx.arc(pointer.x, pointer.y, beamRadius, 0, Math.PI * 2);
    ctx.clip();
    
    // Step 3: Draw content (only visible inside spotlight due to clip)
    drawContent(ctx, width, height);
    
    // Step 4: Draw soft edge gradient for spotlight
    const edgeGradient = ctx.createRadialGradient(
      pointer.x, pointer.y, beamRadius * (1 - softness),
      pointer.x, pointer.y, beamRadius
    );
    edgeGradient.addColorStop(0, 'rgba(10, 10, 10, 0)');
    edgeGradient.addColorStop(1, spotlightConfig.backgroundColor);
    ctx.fillStyle = edgeGradient;
    ctx.fillRect(0, 0, width, height);
    
    ctx.restore();

    // Step 5: Draw watermark everywhere (visible in dark areas and spotlight)
    drawWatermark(ctx, width, height);

    // Continue animation
    if (spotlightConfig.pauseWhenHidden && document.hidden) {
      // Pause when tab is hidden
      animationRef.current = requestAnimationFrame(animate);
    } else {
      animationRef.current = requestAnimationFrame(animate);
    }
  };

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Set up canvas with device pixel ratio for sharp rendering
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    // Set canvas size based on device - much taller for mobile
    const isMobile = rect.width < 600;
    const canvasHeight = isMobile ? 1400 : 800; // Much taller on mobile
    
    canvas.width = rect.width * dpr;
    canvas.height = canvasHeight * dpr;
    
    // Set CSS height to match
    canvas.style.height = `${canvasHeight}px`;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    // Initialize pointer at center
    pointerRef.current = {
      x: canvas.width / 2,
      y: canvas.height / 2,
    };

    setCanvasReady(true);

    // Handle window resize
    const handleResize = () => {
      const rect = canvas.getBoundingClientRect();
      const isMobile = rect.width < 600;
      const canvasHeight = isMobile ? 1400 : 800;
      
      canvas.width = rect.width * dpr;
      canvas.height = canvasHeight * dpr;
      canvas.style.height = `${canvasHeight}px`;
      
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Start animation loop
  useEffect(() => {
    if (!canvasReady) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Add touch event listeners with passive:false to allow preventDefault
    const touchMoveHandler = (e) => {
      e.preventDefault();
      handlePointerMove(e);
    };

    const touchStartHandler = (e) => {
      e.preventDefault();
      handlePointerMove(e);
    };

    canvas.addEventListener('touchmove', touchMoveHandler, { passive: false });
    canvas.addEventListener('touchstart', touchStartHandler, { passive: false });

    animate();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      canvas.removeEventListener('touchmove', touchMoveHandler);
      canvas.removeEventListener('touchstart', touchStartHandler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasReady, question, selectedOption]);

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <canvas
        ref={canvasRef}
        onMouseMove={handlePointerMove}
        onClick={handleCanvasClick}
        onTouchEnd={handleCanvasClick}
        style={{
          width: '100%',
          height: 'auto',
          display: 'block',
          cursor: 'pointer',
          touchAction: 'none',
          background: spotlightConfig.backgroundColor,
        }}
      />
      
      {/* Visually hidden canary for AI detection */}
      {spotlightConfig.enableCanary && (
        <div
          style={{
            position: 'absolute',
            left: '-9999px',
            width: '1px',
            height: '1px',
            overflow: 'hidden',
          }}
          aria-hidden="true"
        >
          {spotlightConfig.canaryText}
        </div>
      )}

      {/* Accessible fallback for keyboard users (hidden visually) */}
      <div
        style={{
          position: 'absolute',
          left: '-9999px',
          width: '1px',
          height: '1px',
          overflow: 'hidden',
        }}
      >
        <fieldset>
          <legend>{question.text}</legend>
          {question.options.map((opt) => (
            <label key={opt.key} style={{ display: 'block' }}>
              <input
                type="radio"
                name={`q-${question.id}`}
                value={opt.key}
                checked={selectedOption === opt.key}
                onChange={() => onSelectOption(opt.key)}
              />
              {opt.key}) {opt.text}
            </label>
          ))}
        </fieldset>
      </div>
    </div>
  );
}
