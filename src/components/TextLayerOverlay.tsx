"use client";
import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import * as pdfjsLib from 'pdfjs-dist';
import { usePdfStore } from '@/store/pdfStore';
import { Bold, Italic, Type, Palette, Check } from 'lucide-react';

interface Props {
  pdfProxy: any;
  pageIndex: number;
  viewport: any;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

const extractColorFromCanvas = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): string | null => {
  if (w <= 0 || h <= 0) return null;
  try {
    const imgData = ctx.getImageData(x, y, w, h);
    const data = imgData.data;
    let minBrightness = 255;
    let bestR = 0, bestG = 0, bestB = 0;
    let found = false;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
      if (a < 50) continue; 
      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      if (brightness < 240) { // Ignore near-white background
        if (brightness < minBrightness) {
          minBrightness = brightness;
          bestR = r; bestG = g; bestB = b;
          found = true;
        }
      }
    }
    if (found) {
      return `rgb(${bestR}, ${bestG}, ${bestB})`;
    }
  } catch (e) {
    console.warn("Canvas color sampling failed", e);
  }
  return null;
};

interface ActiveEdit {
  span: HTMLSpanElement;
  existingAnn?: any;
  originalStr: string;
  initialTextColor: string;
  pdfFontSize: number;
  natX: number;
  natY: number;
  natW: number;
  natH: number;
  sx: number;
  sy: number;
  bold: boolean;
  italic: boolean;
  ff: string;
  
  // current formatting state
  currentFontFamily: string;
  currentFontSize: number;
  currentFontWeight: string;
  currentFontStyle: string;
  currentColor: string;
}

const FontToolbar = ({ activeEdit, updateActiveSpanStyle, fontFamilies, colors }: any) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  
  const currentFontName = fontFamilies.find((f: any) => f.val === activeEdit.currentFontFamily)?.name || 'Arial';

  // Calculate fixed position from the span's actual screen rect, clamped to viewport
  React.useLayoutEffect(() => {
    const span = activeEdit.span as HTMLSpanElement;
    if (!span || !toolbarRef.current) return;

    const spanRect = span.getBoundingClientRect();
    const toolbarRect = toolbarRef.current.getBoundingClientRect();
    const margin = 8;
    const toolbarH = toolbarRect.height || 45;
    const toolbarW = toolbarRect.width || 400;

    // Try to place above the span
    let top = spanRect.top - toolbarH - 6;
    let left = spanRect.left;

    // If it goes above the viewport, place below the span instead
    if (top < margin) {
      top = spanRect.bottom + 6;
    }
    // If it still goes below viewport, just pin to top
    if (top + toolbarH > window.innerHeight - margin) {
      top = margin;
    }

    // Clamp horizontally
    if (left + toolbarW > window.innerWidth - margin) {
      left = window.innerWidth - toolbarW - margin;
    }
    if (left < margin) {
      left = margin;
    }

    setPos({ top, left });
  }, [activeEdit, activeEdit.currentFontSize, activeEdit.currentFontFamily]);

  // Flip dropdown if it goes off-screen
  React.useLayoutEffect(() => {
    if (showDropdown && dropdownRef.current) {
      const dropdownRect = dropdownRef.current.getBoundingClientRect();
      if (dropdownRect.bottom > window.innerHeight - 10) {
        dropdownRef.current.style.top = 'auto';
        dropdownRef.current.style.bottom = 'calc(100% + 4px)';
      } else {
        dropdownRef.current.style.top = 'calc(100% + 4px)';
        dropdownRef.current.style.bottom = 'auto';
      }
    }
  }, [showDropdown]);

  return (
    <div
      ref={toolbarRef}
      id="text-formatting-toolbar"
      style={{
        position: 'fixed',
        top: `${pos.top}px`,
        left: `${pos.left}px`,
        background: 'rgba(30, 30, 36, 0.95)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '12px',
        padding: '6px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        zIndex: 10000,
        boxShadow: '0 10px 30px -10px rgba(0,0,0,0.5)',
        pointerEvents: 'auto',
      }}
    >
      {/* Font Family Custom Dropdown */}
      <div style={{ position: 'relative' }}>
        <button
          onMouseDown={(e) => { e.preventDefault(); setShowDropdown(!showDropdown); }}
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '6px',
            color: 'var(--text-primary)',
            fontSize: '0.8rem',
            padding: '4px 12px',
            cursor: 'pointer',
            minWidth: '80px',
            textAlign: 'left',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          {currentFontName}
          <span style={{ fontSize: '0.6rem', opacity: 0.5 }}>▼</span>
        </button>

        {showDropdown && (
          <div 
            ref={dropdownRef}
            style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              left: 0,
              background: 'rgba(30, 30, 36, 0.98)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px',
              padding: '4px',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
              minWidth: '160px',
              maxHeight: '200px',
              overflowY: 'auto',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              zIndex: 10001,
            }}
          >
            {fontFamilies.map((f: any) => (
              <button
                key={f.name}
                onMouseDown={(e) => { 
                  e.preventDefault(); 
                  updateActiveSpanStyle(() => ({ currentFontFamily: f.val }));
                  setShowDropdown(false);
                }}
                style={{
                  background: activeEdit.currentFontFamily === f.val ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                  border: 'none',
                  borderRadius: '4px',
                  color: activeEdit.currentFontFamily === f.val ? 'var(--accent-primary)' : 'var(--text-primary)',
                  padding: '6px 12px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontFamily: f.val,
                }}
              >
                {f.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.1)' }} />

      {/* Font Size controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '2px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', padding: '2px' }}>
        <button
          onMouseDown={(e) => { e.preventDefault(); updateActiveSpanStyle((prev: any) => ({ currentFontSize: Math.max(prev.currentFontSize - 1, 4) })); }}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', width: '24px', height: '24px', cursor: 'pointer', borderRadius: '4px' }}
        >-</button>
        <div style={{ width: '32px', textAlign: 'center', fontSize: '0.8rem', fontWeight: 500 }}>
          {activeEdit.currentFontSize}
        </div>
        <button
          onMouseDown={(e) => { e.preventDefault(); updateActiveSpanStyle((prev: any) => ({ currentFontSize: prev.currentFontSize + 1 })); }}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', width: '24px', height: '24px', cursor: 'pointer', borderRadius: '4px' }}
        >+</button>
      </div>

      <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.1)' }} />

      {/* Style toggles */}
      <div style={{ display: 'flex', gap: '4px' }}>
        <button
          onMouseDown={(e) => { e.preventDefault(); updateActiveSpanStyle((prev: any) => ({ currentFontWeight: prev.currentFontWeight === 'bold' ? 'normal' : 'bold' })); }}
          style={{
            background: activeEdit.currentFontWeight === 'bold' ? 'var(--accent-primary)' : 'transparent',
            border: 'none',
            borderRadius: '6px',
            color: 'white',
            width: '28px',
            height: '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'background 0.2s',
          }}
        >
          <Bold size={14} />
        </button>

        <button
          onMouseDown={(e) => { e.preventDefault(); updateActiveSpanStyle((prev: any) => ({ currentFontStyle: prev.currentFontStyle === 'italic' ? 'normal' : 'italic' })); }}
          style={{
            background: activeEdit.currentFontStyle === 'italic' ? 'var(--accent-primary)' : 'transparent',
            border: 'none',
            borderRadius: '6px',
            color: 'white',
            width: '28px',
            height: '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'background 0.2s',
          }}
        >
          <Italic size={14} />
        </button>
      </div>

      <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.1)' }} />

      {/* Colors */}
      <div style={{ display: 'flex', gap: '6px', padding: '0 4px' }}>
        {colors.map((c: string) => (
          <button
            key={c}
            onMouseDown={(e) => { e.preventDefault(); updateActiveSpanStyle(() => ({ currentColor: c })); }}
            style={{
              width: '18px',
              height: '18px',
              borderRadius: '50%',
              background: c,
              border: activeEdit.currentColor === c ? '2px solid white' : '2px solid transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
              transition: 'transform 0.1s',
              transform: activeEdit.currentColor === c ? 'scale(1.1)' : 'scale(1)',
            }}
          />
        ))}
      </div>
    </div>
  );
};

const TextLayerOverlay: React.FC<Props> = ({ pdfProxy, pageIndex, viewport, canvasRef }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeEdit, setActiveEdit] = useState<ActiveEdit | null>(null);
  const [scaleFactor, setScaleFactor] = useState(1);

  useEffect(() => {
    const canvas = canvasRef?.current;
    if (!canvas || !viewport) return;

    const updateScale = () => {
      const displayWidth = canvas.clientWidth;
      const internalWidth = canvas.width || viewport.width;
      if (internalWidth > 0 && displayWidth > 0) {
        setScaleFactor(displayWidth / internalWidth);
      }
    };

    updateScale();

    const observer = new ResizeObserver(() => {
      updateScale();
    });
    observer.observe(canvas);

    window.addEventListener('resize', updateScale);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateScale);
    };
  }, [canvasRef, viewport]);

  useEffect(() => {
    if (!containerRef.current || !pdfProxy || !viewport) return;

    const buildLayer = async () => {
      const container = containerRef.current!;
      container.innerHTML = '';

      try {
        const page = await pdfProxy.getPage(pageIndex + 1);
        const tc = await page.getTextContent();
        const naturalVp = page.getViewport({ scale: 1, rotation: 0 });
        const styles = tc.styles;

        const mapFont = (fontName: string, cssFamily: string): string => {
          const n = (cssFamily || fontName).toLowerCase();
          if (n.includes('times') || (n.includes('serif') && !n.includes('sans')))
            return '"Times New Roman", Times, serif';
          if (n.includes('courier') || n.includes('mono'))
            return '"Courier New", Courier, monospace';
          return 'Arial, Helvetica, sans-serif';
        };

        tc.items.forEach((item: any) => {
          if (!item.str || item.str.trim() === '') return;

          // Try to extract the real, original font name from the PDF document objects
          let realFontName = item.fontName;
          try {
            const fontObj = page.commonObjs.get(item.fontName);
            if (fontObj && fontObj.name) {
              realFontName = fontObj.name.split('+').pop() || fontObj.name; // e.g. "ABCDEF+Garamond-Bold" -> "Garamond-Bold"
            }
          } catch (e) {
            // Ignore if font cannot be loaded synchronously
          }

          const style = styles[item.fontName];
          const mapFont = (fontName: string, cssFamily: string): string => {
            const n = (cssFamily || fontName).toLowerCase();
            if (
              n.includes('times') || 
              n.includes('georgia') || 
              n.includes('garamond') || 
              n.includes('cambria') || 
              n.includes('baskerville') || 
              n.includes('palatino') || 
              n.includes('bookman') || 
              n.includes('minion') || 
              n.includes('century') || 
              (n.includes('serif') && !n.includes('sans'))
            ) {
              return '"Times New Roman", Times, serif';
            }
            if (n.includes('courier') || n.includes('mono')) {
              return '"Courier New", Courier, monospace';
            }
            return 'Arial, Helvetica, sans-serif';
          };
          
          const ff = mapFont(realFontName, style?.fontFamily ?? '');
          const bold = /bold/i.test(realFontName + (style?.fontFamily ?? ''));
          const italic = /italic|oblique/i.test(realFontName + (style?.fontFamily ?? ''));

          // ── 1. Calculate pure PDF coordinates (unrotated, scale=1) ──
          const basePdfFontSize = Math.abs(item.transform[3]);
          
          let pdfFontSize = basePdfFontSize;
          const tempCanvas = document.createElement('canvas');
          const tCtx = tempCanvas.getContext('2d');
          if (tCtx && item.str && item.str.trim().length > 0) {
             tCtx.font = `${bold ? 'bold ' : ''}${italic ? 'italic ' : ''}100px ${ff}`;
             const metrics = tCtx.measureText(item.str);
             if (metrics.width > 0) {
                 const calculatedSize = (item.width / metrics.width) * 100;
                 if (calculatedSize > basePdfFontSize * 0.6 && calculatedSize < basePdfFontSize * 1.5) {
                     pdfFontSize = calculatedSize;
                 }
             }
          }
          
          const pdfX = item.transform[4];
          const pdfBaselineY = item.transform[5];
          const pdfTopY = pdfBaselineY + item.height; 

          // Normalized percentages for storage
          const natX = (pdfX / naturalVp.width) * 100;
          const natY = ((naturalVp.height - pdfTopY) / naturalVp.height) * 100;
          const natW = (item.width / naturalVp.width) * 100;
          const natH = (item.height / naturalVp.height) * 100;

          // ── 2. Check if we have an edit for this text block ──
          const store = usePdfStore.getState();
          const existingAnn = store.pages[pageIndex]?.annotations.find(
            (a) =>
              a.type === 'text' &&
              Math.abs(a.points[0].x - natX) < 0.5 &&
              Math.abs(a.points[0].y - natY) < 0.5
          );

          const originalStr = item.str;
          const displayStr = existingAnn?.data ?? originalStr;

          // ── 3. Screen coordinates for the overlay span ──
          const [sx, sy] = viewport.convertToViewportPoint(pdfX, pdfBaselineY);
          const screenW = (existingAnn ? Math.max(existingAnn.width || 0, natW) : natW) / 100 * naturalVp.width * viewport.scale;
          
          // Use properties from annotation if edit exists
          const currentFont = existingAnn?.fontFamily || ff;
          const currentSize = (existingAnn && existingAnn.fontSize) ? (existingAnn.fontSize * viewport.scale) : (pdfFontSize * viewport.scale);
          const currentWeight = existingAnn?.fontWeight || (bold ? 'bold' : 'normal');
          const currentItalic = existingAnn?.fontStyle || (italic ? 'italic' : 'normal');

          let initialTextColor = '#000000';
          if (item.color && item.color.length >= 3) {
            initialTextColor = `rgb(${item.color[0]}, ${item.color[1]}, ${item.color[2]})`;
          }
          const currentColor = existingAnn?.color || initialTextColor;

          const span = document.createElement('span');
          span.textContent = displayStr;
          span.dataset.original = originalStr;
          span.dataset.textColor = currentColor;

          const displayLeft = sx * scaleFactor;
          const displayTop = (sy - currentSize * 0.8) * scaleFactor;
          const displayWidth = screenW * scaleFactor;
          const displayHeight = (currentSize * 1.2) * scaleFactor;
          const displayFontSize = currentSize * scaleFactor;

          Object.assign(span.style, {
            position:    'absolute',
            left:        `${displayLeft}px`,
            top:         `${displayTop}px`,
            width:       'auto', 
            minWidth:    `${displayWidth}px`,
            height:      `${displayHeight}px`, 
            fontSize:    `${displayFontSize}px`,
            lineHeight:  `${displayFontSize}px`,
            fontFamily:  currentFont,
            fontWeight:  currentWeight,
            fontStyle:   currentItalic,
            whiteSpace:  'pre',
            color:       'transparent',
            background:  'transparent',
            outline:     'none',
            cursor:      'text',
            userSelect:  'text',
            padding:     '0',
            margin:      '0',
            border:      'none',
            boxSizing:   'border-box',
            zIndex:      '2',
            WebkitFontSmoothing: 'antialiased',
            MozOsxFontSmoothing: 'grayscale',
            transform:       `rotate(${viewport.rotation}deg)`,
            transformOrigin: `0 ${displayFontSize * 0.8}px`,
          });

          // ── focus: show editable state ────────────────────────────────
          span.addEventListener('focus', () => {
            if (!span.dataset.colorSampled && !existingAnn && canvasRef?.current) {
              span.dataset.colorSampled = 'true';
              const ctx = canvasRef.current.getContext('2d', { willReadFrequently: true });
              if (ctx) {
                const sampled = extractColorFromCanvas(ctx, sx, sy - currentSize * 0.8, screenW, currentSize * 1.2);
                if (sampled) {
                  span.dataset.textColor = sampled;
                }
              }
            }

            const activeColor = span.dataset.textColor || currentColor;

            Object.assign(span.style, {
              color:      activeColor,
              background: '#ffffff',
              outline:    'none',
              zIndex:     '300',
            });

            // Set active edit formatting values
            setActiveEdit({
              span,
              existingAnn,
              originalStr,
              initialTextColor,
              pdfFontSize,
              natX,
              natY,
              natW,
              natH,
              sx,
              sy,
              bold,
              italic,
              ff,
              currentFontFamily: currentFont,
              currentFontSize: Math.round(currentSize / viewport.scale),
              currentFontWeight: currentWeight,
              currentFontStyle: currentItalic,
              currentColor: activeColor,
            });

          });

          span.addEventListener('mousedown', (e) => e.stopPropagation());
          span.addEventListener('click', (e) => {
            e.stopPropagation();
            span.contentEditable = 'true';
            span.focus();
          });

          // ── blur: commit edit by painting on canvas + baking into PDF ─
          span.addEventListener('blur', async () => {
            // We give a small delay to see if the user clicked on a toolbar button,
            // which will handle its own focus/blur or preventDefault.
            setTimeout(async () => {
              // If activeElement is still pointing to this span, we clear it.
              if (document.activeElement === span) return; 

              span.contentEditable = 'false';
              const newStr = (span.textContent ?? '').replace(/\n/g, '');

              // Restore invisible
              Object.assign(span.style, {
                color:      'transparent',
                background: 'transparent',
                outline:    'none',
                zIndex:     '2',
              });

              // Read final styling from span style properties
              const finalFontFamily = span.style.fontFamily || ff;
              const finalFontSizeStr = span.style.fontSize || '';
              const finalFontSize = parseFloat(finalFontSizeStr) / (viewport.scale * scaleFactor) || pdfFontSize;
              const finalFontWeight = span.style.fontWeight || 'normal';
              const finalFontStyle = span.style.fontStyle || 'normal';
              const finalColor = span.dataset.textColor || currentColor;

              const store = usePdfStore.getState();
              const freshAnn = store.pages[pageIndex]?.annotations.find(
                (a) =>
                  a.type === 'text' &&
                  Math.abs(a.points[0].x - natX) < 0.5 &&
                  Math.abs(a.points[0].y - natY) < 0.5
              );

              // ── 1. Paint white-out + new text directly on the canvas ───
              const canvas = canvasRef?.current;
              if (canvas) {
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  ctx.save();
                  ctx.translate(sx, sy);
                  ctx.rotate((viewport.rotation * Math.PI) / 180);
                  
                  const activeScreenFontSize = finalFontSize * viewport.scale;
                  const newScreenW = span.clientWidth / scaleFactor;
                  const newNatW = (newScreenW / viewport.scale / naturalVp.width) * 100;
                  const finalNatW = Math.max(newNatW, freshAnn?.width || natW);

                  const paddingY = activeScreenFontSize * 0.25;
                  const paddingX = activeScreenFontSize * 0.1;
                  const rectH = (item.height / naturalVp.height) * 100 / 100 * naturalVp.height * viewport.scale;

                  ctx.fillStyle = '#ffffff';
                  const paintW = (finalNatW / 100 * naturalVp.width * viewport.scale);
                  ctx.fillRect(-paddingX, -rectH - paddingY/2, paintW + paddingX * 2, rectH + paddingY * 1.5);
                  
                  ctx.fillStyle = finalColor;
                  ctx.font      = `${finalFontWeight === 'bold' ? 'bold ' : ''}${finalFontStyle === 'italic' ? 'italic ' : ''}${activeScreenFontSize}px ${finalFontFamily}`;
                  ctx.textBaseline = 'alphabetic';
                  ctx.fillText(newStr, 0, 0);
                  ctx.restore();
                }
              }

              const newScreenW = span.clientWidth / scaleFactor;
              const newNatW = (newScreenW / viewport.scale / naturalVp.width) * 100;
              const finalNatW = Math.max(newNatW, freshAnn?.width || natW);

              // ── 2. Save to store ────────────────────────────────────────
              if (freshAnn) {
                store.updateAnnotation(pageIndex, freshAnn.id, {
                  data:  newStr,
                  width: finalNatW,
                  fontFamily: finalFontFamily,
                  fontSize: finalFontSize,
                  fontWeight: finalFontWeight,
                  fontStyle: finalFontStyle,
                  color: finalColor,
                });
              } else {
                store.addAnnotation(pageIndex, {
                  type:          'text',
                  points:        [{ x: natX, y: natY }],
                  width:         finalNatW,
                  height:        natH,
                  originalWidth: natW,
                  color:         finalColor,
                  opacity:       1,
                  data:          newStr,
                  fontSize:      finalFontSize,     
                  fontFamily:    finalFontFamily,
                  fontWeight:    finalFontWeight,
                  fontStyle:     finalFontStyle,
                });
              }

              setActiveEdit(null);
            }, 150);
          });

          container.appendChild(span);
        });
      } catch (err) {
        console.error('TextLayerOverlay:', err);
      }
    };

    buildLayer();
  }, [pdfProxy, pageIndex, viewport, scaleFactor]);

  // Handle toolbar interactions
  const updateActiveSpanStyle = (updater: (edit: ActiveEdit) => Partial<ActiveEdit>) => {
    if (!activeEdit) return;
    const updates = updater(activeEdit);
    const newEdit = { ...activeEdit, ...updates };

    const { span } = newEdit;
    
    span.style.fontFamily = newEdit.currentFontFamily;
    
    const sizeInPx = newEdit.currentFontSize * viewport.scale * scaleFactor;
    span.style.fontSize = `${sizeInPx}px`;
    span.style.lineHeight = `${sizeInPx}px`;
    span.style.top = `${(newEdit.sy - newEdit.currentFontSize * viewport.scale * 0.8) * scaleFactor}px`;

    span.style.fontWeight = newEdit.currentFontWeight;
    span.style.fontStyle = newEdit.currentFontStyle;
    
    span.style.color = newEdit.currentColor;
    span.dataset.textColor = newEdit.currentColor;



    setActiveEdit(newEdit);
    span.focus();
  };

  const fontFamilies = [
    { name: 'Arial', val: 'Arial, Helvetica, sans-serif' },
    { name: 'Times New Roman', val: '"Times New Roman", Times, serif' },
    { name: 'Courier New', val: '"Courier New", Courier, monospace' },
    { name: 'Georgia', val: 'Georgia, serif' },
    { name: 'Verdana', val: 'Verdana, Geneva, sans-serif' },
    { name: 'Helvetica', val: 'Helvetica, Arial, sans-serif' },
    { name: 'Tahoma', val: 'Tahoma, Geneva, sans-serif' },
    { name: 'Trebuchet MS', val: '"Trebuchet MS", Helvetica, sans-serif' },
    { name: 'Impact', val: 'Impact, Charcoal, sans-serif' },
    { name: 'Comic Sans MS', val: '"Comic Sans MS", cursive, sans-serif' },
    { name: 'Garamond', val: 'Garamond, serif' },
    { name: 'Palatino', val: '"Palatino Linotype", "Book Antiqua", Palatino, serif' },
    { name: 'Bookman', val: '"Bookman Old Style", serif' },
    { name: 'Arial Black', val: '"Arial Black", Gadget, sans-serif' },
    { name: 'Century Gothic', val: '"Century Gothic", sans-serif' },
    { name: 'Lucida Sans', val: '"Lucida Sans Unicode", "Lucida Grande", sans-serif' },
    { name: 'Consolas', val: 'Consolas, monospace' },
    { name: 'Monaco', val: 'Monaco, monospace' },
    { name: 'Optima', val: 'Optima, sans-serif' },
    { name: 'Avant Garde', val: '"Avant Garde", sans-serif' },
    { name: 'Didot', val: 'Didot, serif' },
    { name: 'Copperplate', val: 'Copperplate, Fantasy' },
    { name: 'Papyrus', val: 'Papyrus, Fantasy' },
    { name: 'Brush Script MT', val: '"Brush Script MT", cursive' },
    { name: 'Candara', val: 'Candara, Calibri, sans-serif' },
    { name: 'Geneva', val: 'Geneva, Tahoma, sans-serif' },
  ];

  const colors = [
    '#000000', '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6'
  ];

  return (
    <>
      <div
        ref={containerRef}
        style={{
          position:      'absolute',
          top:           0,
          left:          0,
          width:         '100%',
          height:        '100%',
          pointerEvents: 'auto',
          zIndex:        5,
          overflow:      'hidden',
        }}
      />
      {activeEdit && typeof document !== 'undefined' && ReactDOM.createPortal(
        <FontToolbar
          activeEdit={activeEdit}
          updateActiveSpanStyle={updateActiveSpanStyle}
          fontFamilies={fontFamilies}
          colors={colors}
        />,
        document.body
      )}
    </>  
  );
};

export default TextLayerOverlay;
