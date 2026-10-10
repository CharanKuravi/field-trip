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
      pointerRef.current = {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY,
      };
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
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    let clickX, clickY;
    if (e.type === 'touchend') {
      const touch = e.changedTouches[0];
      clickX = (touch.clientX - rect.left) * scaleX;
      clickY = (touch.clientY - rect.top) * scaleY;
    } else {
      clickX = (e.clientX - rect.left) * scaleX;
      clickY = (e.clientY - rect.top) * scaleY;
    }

    // Hit test against option rectangles
    const layout = layoutRef.current;
    for (let i = 0; i < layout.optionRects.length; i++) {
      const r = layout.optionRects[i];
      if (clickX >= r.x && clickX <= r.x + r.w && clickY >= r.y && clickY <= r.y + r.h) {
        onSelectOption(question.options[i].key);
        break;
      }
    }
  };

  // Word wrapping helper
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
    const padding = 40;
    const optionPadding = 20;
    const lineHeight = 30;
    const optionHeight = 60;
    const optionSpacing = 15;

    // Clear canvas
    ctx.fillStyle = spotlightConfig.backgroundColor;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = spotlightConfig.textColor;
    ctx.textBaseline = 'top';

    // Draw question text (bold, large)
    ctx.font = 'bold 24px sans-serif';
    const questionLines = wrapText(ctx, question.text, width - padding * 2);
    let y = padding;
    questionLines.forEach((line) => {
      ctx.fillText(line, padding, y);
      y += lineHeight;
    });

    // Draw marks indicator
    ctx.font = '16px sans-serif';
    ctx.fillStyle = '#888';
    ctx.fillText(`[${question.marks} mark${question.marks > 1 ? 's' : ''}]`, padding, y + 10);
    y += 50;

    // Draw options in 2x2 grid
    const gridWidth = (width - padding * 2 - optionSpacing) / 2;
    const options = question.options;
    const optionRects = [];

    ctx.font = '18px sans-serif';
    for (let i = 0; i < options.length; i++) {
      const opt = options[i];
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = padding + col * (gridWidth + optionSpacing);
      const y_pos = y + row * (optionHeight + optionSpacing);

      // Store rectangle for hit testing
      optionRects.push({ x, y: y_pos, w: gridWidth, h: optionHeight, key: opt.key });

      // Draw option background
      ctx.fillStyle = selectedOption === opt.key ? spotlightConfig.optionHighlight : '#1a1a1a';
      ctx.fillRect(x, y_pos, gridWidth, optionHeight);

      // Draw option border (highlight if selected)
      if (selectedOption === opt.key) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y_pos, gridWidth, optionHeight);
      }

      // Draw option text
      ctx.fillStyle = spotlightConfig.textColor;
      const optionText = `${opt.key}) ${opt.text}`;
      const optionLines = wrapText(ctx, optionText, gridWidth - optionPadding * 2);
      optionLines.forEach((line, idx) => {
        ctx.fillText(line, x + optionPadding, y_pos + optionPadding + idx * 22);
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

  // Draw spotlight overlay
  const drawSpotlight = (ctx, width, height) => {
    const pointer = pointerRef.current;

    // Create radial gradient for spotlight effect
    const gradient = ctx.createRadialGradient(
      pointer.x,
      pointer.y,
      0,
      pointer.x,
      pointer.y,
      beamRadius
    );

    // Center is transparent (visible)
    gradient.addColorStop(0, 'rgba(10, 10, 10, 0)');
    // Edge transitions to fully dark
    gradient.addColorStop(1 - softness, 'rgba(10, 10, 10, 0)');
    gradient.addColorStop(1, spotlightConfig.backgroundColor);

    // Fill entire canvas with dark overlay, except spotlight area
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Add full dark overlay everywhere except spotlight
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = spotlightConfig.backgroundColor;
    
    // Draw dark mask with hole for spotlight
    ctx.save();
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'destination-out';
    
    const spotGradient = ctx.createRadialGradient(
      pointer.x,
      pointer.y,
      0,
      pointer.x,
      pointer.y,
      beamRadius
    );
    spotGradient.addColorStop(0, 'rgba(0, 0, 0, 1)');
    spotGradient.addColorStop(1 - softness, `rgba(0, 0, 0, ${1 - softness})`);
    spotGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    
    ctx.fillStyle = spotGradient;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  };

  // Animation loop
  const animate = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Draw base content
    drawContent(ctx, width, height);

    // Draw watermark on top
    drawWatermark(ctx, width, height);

    // Draw spotlight overlay
    drawSpotlight(ctx, width, height);

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
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

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
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
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

    animate();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasReady, question, selectedOption]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '600px' }}>
      <canvas
        ref={canvasRef}
        onMouseMove={handlePointerMove}
        onTouchMove={handlePointerMove}
        onTouchStart={handlePointerMove}
        onClick={handleCanvasClick}
        onTouchEnd={handleCanvasClick}
        style={{
          width: '100%',
          height: '100%',
          cursor: 'pointer',
          touchAction: 'none', // Prevent default touch behaviors
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
