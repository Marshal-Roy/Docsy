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

const extractBgColorFromCanvas = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): string => {
  if (w <= 0 || h <= 0) return '#ffffff';
  try {
    // Expand the sample area slightly to ensure we capture background
    const pad = 4;
    const imgData = ctx.getImageData(x - pad, y - pad, w + pad * 2, h + pad * 2);
    const data = imgData.data;
    let rSum = 0, gSum = 0, bSum = 0, count = 0;
    
    // Sample only the outer perimeter of the expanded box
    const isPerimeter = (i: number) => {
      const px = (i / 4) % (w + pad * 2);
      const py = Math.floor((i / 4) / (w + pad * 2));
      return px < pad || px >= w + pad || py < pad || py >= h + pad;
    };

    for (let i = 0; i < data.length; i += 4) {
      if (isPerimeter(i)) {
        const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        if (a > 50 && brightness > 200) { // Only sample light colors (typical background)
          rSum += r; gSum += g; bSum += b; count++;
        }
      }
    }
    if (count > 0) {
      return `rgb(${Math.round(rSum/count)}, ${Math.round(gSum/count)}, ${Math.round(bSum/count)})`;
    }
  } catch (e) {
    console.warn("Canvas bg color sampling failed", e);
  }
  return '#ffffff';
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
    // Center horizontally over the span
    let left = spanRect.left + (spanRect.width / 2) - (toolbarW / 2);

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
        padding: '4px 8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexWrap: 'wrap',
        maxWidth: 'calc(100vw - 16px)',
        gap: '8px',
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
            fontSize: '0.75rem',
            padding: '2px 8px',
            cursor: 'pointer',
            minWidth: '60px',
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

      <div style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.1)' }} />

      {/* Font Size controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '2px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', padding: '2px' }}>
        <button
          onMouseDown={(e) => { e.preventDefault(); updateActiveSpanStyle((prev: any) => ({ currentFontSize: Math.max(prev.currentFontSize - 1, 4) })); }}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', width: '20px', height: '20px', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >-</button>
        <div style={{ width: '24px', textAlign: 'center', fontSize: '0.75rem', fontWeight: 500 }}>
          {activeEdit.currentFontSize}
        </div>
        <button
          onMouseDown={(e) => { e.preventDefault(); updateActiveSpanStyle((prev: any) => ({ currentFontSize: prev.currentFontSize + 1 })); }}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', width: '20px', height: '20px', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >+</button>
      </div>

      <div style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.1)' }} />

      {/* Style toggles */}
      <div style={{ display: 'flex', gap: '2px' }}>
        <button
          onMouseDown={(e) => { e.preventDefault(); updateActiveSpanStyle((prev: any) => ({ currentFontWeight: prev.currentFontWeight === 'bold' ? 'normal' : 'bold' })); }}
          style={{
            background: activeEdit.currentFontWeight === 'bold' ? 'var(--accent-primary)' : 'transparent',
            border: 'none',
            borderRadius: '6px',
            color: 'white',
            width: '24px',
            height: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'background 0.2s',
          }}
        >
          <Bold size={12} />
        </button>

        <button
          onMouseDown={(e) => { e.preventDefault(); updateActiveSpanStyle((prev: any) => ({ currentFontStyle: prev.currentFontStyle === 'italic' ? 'normal' : 'italic' })); }}
          style={{
            background: activeEdit.currentFontStyle === 'italic' ? 'var(--accent-primary)' : 'transparent',
            border: 'none',
            borderRadius: '6px',
            color: 'white',
            width: '24px',
            height: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'background 0.2s',
          }}
        >
          <Italic size={12} />
        </button>
      </div>

      <div style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.1)' }} />

      {/* Colors */}
      <div style={{ display: 'flex', gap: '4px', padding: '0 2px', flexWrap: 'wrap', justifyContent: 'center' }}>
        {colors.map((c: string) => (
          <button
            key={c}
            onMouseDown={(e) => { e.preventDefault(); updateActiveSpanStyle(() => ({ currentColor: c })); }}
            style={{
              width: '16px',
              height: '16px',
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
  const isOcrRunning = usePdfStore((state) => state.isOcrRunning);

  useEffect(() => {
    const canvas = canvasRef?.current;
    if (!canvas || !viewport) return;

    const updateScale = () => {
      const displayWidth = canvas.clientWidth;
      const logicalWidth = viewport.width;
      if (logicalWidth > 0 && displayWidth > 0) {
        setScaleFactor(displayWidth / logicalWidth);
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

        const store = usePdfStore.getState();
        const matchedAnnIds = new Set<string>();
        
        // Pass 1: find matched annotations to isolate unmatched (like OCR)
        tc.items.forEach((item: any) => {
          const pdfX = item.transform[4];
          const pdfBaselineY = item.transform[5];
          const pdfTopY = pdfBaselineY + item.height; 
          const natX = (pdfX / naturalVp.width) * 100;
          const natY = ((naturalVp.height - pdfTopY) / naturalVp.height) * 100;
          
          const existingAnn = store.pages[pageIndex]?.annotations.find(
             (a) =>
               a.type === 'text' &&
               Math.abs(a.points[0].x - natX) < 0.01 &&
               Math.abs(a.points[0].y - natY) < 0.01
          );
          if (existingAnn) matchedAnnIds.add(existingAnn.id);
        });

        // Add unmatched text annotations to tc.items so they get rendered
        const textAnns = store.pages[pageIndex]?.annotations.filter(a => a.type === 'text') || [];
        const unmatchedAnns = textAnns.filter(a => !matchedAnnIds.has(a.id));
        
        console.log(`TextLayerOverlay [Page ${pageIndex}]: total textAnns=${textAnns.length}, matched=${matchedAnnIds.size}, unmatched=${unmatchedAnns.length}`);

        unmatchedAnns.forEach(ann => {
          // OCR annotations: points[0].y is percent-from-top (Tesseract origin, top-down).
          // We need to reconstruct pdfBaselineY in PDF coordinate space (bottom-up).
          // ann.points[0].y = (pdfY_topdown / naturalVp.height) * 100
          // where pdfY_topdown = distance from the top of the page.
          // In PDF space: pdfTopY = naturalVp.height - (percY / 100 * naturalVp.height)
          //               pdfBaselineY = pdfTopY - pdfHeight
          // BUT: for the text overlay we store percY as top-down percent directly,
          // so we reconstruct the PDF-space coords for the faux item transform.
          const percY = ann.points[0].y;
          const pdfX = (ann.points[0].x / 100) * naturalVp.width;
          const pdfHeight_ann = (ann.height || 0) / 100 * naturalVp.height;
          // pdfY_topdown: distance from page top in natural pt space
          const pdfY_topdown = (percY / 100) * naturalVp.height;
          // In PDF coords (bottom-up): top of text block
          const pdfTopY_ann = naturalVp.height - pdfY_topdown;
          // baseline = pdfTopY - height (since item.height is the ascent above baseline)
          const pdfBaselineY_ann = pdfTopY_ann - pdfHeight_ann;
          const width = (ann.originalWidth || ann.width || 0) / 100 * naturalVp.width;
          
          let color = [0,0,0];
          if (ann.color?.startsWith('#')) {
             color = [
               parseInt(ann.color.slice(1,3), 16),
               parseInt(ann.color.slice(3,5), 16),
               parseInt(ann.color.slice(5,7), 16)
             ];
          }
          
          console.log('Injecting faux item for OCR text:', ann.data, 'at', { pdfX, pdfBaselineY_ann, width, pdfHeight_ann });

          tc.items.push({
            str: ann.data || '',
            fontName: ann.fontFamily || 'Arial, Helvetica, sans-serif',
            transform: [1, 0, 0, ann.fontSize || pdfHeight_ann, pdfX, pdfBaselineY_ann],
            width: width,
            height: pdfHeight_ann,
            color: color,
            _isOcrFaux: true, // Flag to skip canvas-measurement rescaling
          });
        });

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
          // Use canvas-measurement to find the perfect font size to fit the width
          const tempCanvas = document.createElement('canvas');
          const tCtx = tempCanvas.getContext('2d');
          if (tCtx && item.str && item.str.trim().length > 0) {
             tCtx.font = `${bold ? 'bold ' : ''}${italic ? 'italic ' : ''}100px ${ff}`;
             const metrics = tCtx.measureText(item.str);
             if (metrics.width > 0) {
                 const calculatedSize = (item.width / metrics.width) * 100;
                 if (item._isOcrFaux) {
                     // For OCR, trust the width-based calculation completely
                     pdfFontSize = calculatedSize;
                 } else if (calculatedSize > basePdfFontSize * 0.6 && calculatedSize < basePdfFontSize * 1.5) {
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
          const existingAnn = store.pages[pageIndex]?.annotations.find(
            (a) =>
              a.type === 'text' &&
              Math.abs(a.points[0].x - natX) < 0.01 &&
              Math.abs(a.points[0].y - natY) < 0.01
          );

          const originalStr = item.str;
          const displayStr = existingAnn?.data ?? originalStr;

          // ── 3. Screen coordinates for the overlay span ──
          const [sx, sy] = viewport.convertToViewportPoint(pdfX, pdfBaselineY);
          const screenW = (existingAnn ? Math.max(existingAnn.width || 0, natW) : natW) / 100 * naturalVp.width * viewport.scale;
          
          // Use properties from annotation if edit exists and has been committed
          const isCommitted = existingAnn?.isCommitted;
          const currentFont = existingAnn?.fontFamily || ff;
          const currentSize = (existingAnn && isCommitted && existingAnn.fontSize) ? (existingAnn.fontSize * viewport.scale) : (pdfFontSize * viewport.scale);
          const currentWeight = existingAnn?.fontWeight || (bold ? 'bold' : 'normal');
          const currentItalic = existingAnn?.fontStyle || (italic ? 'italic' : 'normal');

          let initialTextColor = '#000000';
          if (item.color && item.color.length >= 3) {
            initialTextColor = `rgb(${item.color[0]}, ${item.color[1]}, ${item.color[2]})`;
          }
          const currentColor = existingAnn?.color || initialTextColor;

          const span = document.createElement('span');
          // Reconstruct inner styled spans if annotation has segments
          const annSegments = existingAnn?.segments;
          if (annSegments && annSegments.length > 0) {
            span.textContent = '';
            for (const seg of annSegments) {
              const inner = document.createElement('span');
              inner.textContent = seg.text;
              if (seg.color) inner.style.color = 'transparent';
              if (seg.fontWeight) inner.style.fontWeight = seg.fontWeight;
              if (seg.fontStyle) inner.style.fontStyle = seg.fontStyle;
              if (seg.fontFamily) inner.style.fontFamily = seg.fontFamily;
              // seg.fontSize is in PDF pts; convert to display px via viewport.scale * scaleFactor
              if (seg.fontSize) inner.style.fontSize = `${seg.fontSize * viewport.scale * scaleFactor}px`;
              inner.dataset.segColor = seg.color || currentColor;
              span.appendChild(inner);
            }
          } else {
            span.textContent = displayStr;
          }
          span.dataset.original = originalStr;
          span.dataset.textColor = currentColor;

          // Convert viewport-space coords (sx,sy,screenW,currentSize) to display-space
          // by multiplying by scaleFactor = canvas.clientWidth / viewport.width
          const displayLeft     = sx * scaleFactor;
          const displayFontSize = currentSize * scaleFactor;
          const displayTop      = (sy * scaleFactor) - (displayFontSize * 0.8);
          const displayWidth    = screenW * scaleFactor;
          const displayHeight   = displayFontSize * 1.2;

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
                const outputScale = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
                // Canvas buffer coords = viewport coords * outputScale
                const sampled = extractColorFromCanvas(
                  ctx,
                  sx * outputScale,
                  (sy - currentSize * 0.8) * outputScale,
                  screenW * outputScale,
                  (currentSize * 1.2) * outputScale
                );
                if (sampled) {
                  span.dataset.textColor = sampled;
                }
              }
            }
            
            if (!span.dataset.bgColorSampled && canvasRef?.current) {
              const ctx = canvasRef.current.getContext('2d', { willReadFrequently: true });
              if (ctx) {
                const outputScale = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
                const cw = (span.clientWidth || displayWidth) * outputScale;
                const ch = (span.clientHeight || displayHeight) * outputScale;
                const cx = displayLeft * outputScale;
                const cy = displayTop * outputScale;
                const bgSampled = extractBgColorFromCanvas(ctx, cx, cy, cw, ch);
                span.dataset.bgColor = bgSampled;
                span.dataset.bgColorSampled = 'true';
              }
            }

            const activeColor = span.dataset.textColor || currentColor;
            const activeBgColor = span.dataset.bgColor || existingAnn?.bgColor || '#ffffff';

            Object.assign(span.style, {
              color:      activeColor,
              background: activeBgColor,
              boxShadow:  `0 0 0 6px ${activeBgColor}`,
              outline:    'none',
              zIndex:     '300',
              borderRadius: '2px',
            });

            // Make inner styled spans visible with their actual colors
            const innerSpans = span.querySelectorAll('span');
            innerSpans.forEach(s => {
              const segCol = s.dataset.segColor || activeColor;
              s.style.color = segCol;
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
          span.addEventListener('input', () => {
            span.dataset.isDirty = 'true';
          });

          // ── blur: commit edit by painting on canvas + baking into PDF ─
          span.addEventListener('blur', async () => {
            // We give a small delay to see if the user clicked on a toolbar button,
            // which will handle its own focus/blur or preventDefault.
            setTimeout(async () => {
              // If activeElement is still pointing to this span, we clear it.
              if (document.activeElement === span) return; 
              // Also check if focus moved to toolbar
              const toolbar = document.getElementById('text-formatting-toolbar');
              if (toolbar && toolbar.contains(document.activeElement)) return;

              span.contentEditable = 'false';
              const newStr = (span.textContent ?? '').replace(/\n/g, '');

              // Read final styling from span style properties (defaults)
              const finalFontFamily = span.style.fontFamily || ff;
              const finalFontSizeStr = span.style.fontSize || '';
              // span fontSize is in display px = pdfPt * viewport.scale * scaleFactor
              const finalFontSize = parseFloat(finalFontSizeStr) / (viewport.scale * scaleFactor) || pdfFontSize;
              const finalFontWeight = span.style.fontWeight || 'normal';
              const finalFontStyle = span.style.fontStyle || 'normal';
              const finalColor = span.dataset.textColor || currentColor;
              const finalBgColor = span.dataset.bgColor || existingAnn?.bgColor || '#ffffff';

              // ── Restore invisible state first (always) ──
              Object.assign(span.style, {
                color:      'transparent',
                background: 'transparent',
                boxShadow:  'none',
                outline:    'none',
                zIndex:     '2',
              });
              const innerSpans = span.querySelectorAll('span');
              innerSpans.forEach(s => { s.style.color = 'transparent'; });

              // Exit early if nothing changed — avoids artifacts from spurious canvas paints
              if (span.dataset.isDirty !== 'true') {
                const isAnotherSpanEarly = document.activeElement && document.activeElement.tagName === 'SPAN' && (document.activeElement as HTMLElement).isContentEditable;
                if (!isAnotherSpanEarly) setActiveEdit(null);
                return;
              }

              // Extract per-word segments before hiding
              const segments = extractSegmentsFromSpan(span, {
                ff: finalFontFamily,
                fontSize: finalFontSize,
                fontWeight: finalFontWeight,
                fontStyle: finalFontStyle,
                color: finalColor,
              });
              const hasSegments = segments.length > 1 || (segments.length === 1 && segments.some(s =>
                s.color !== finalColor || s.fontWeight !== finalFontWeight ||
                s.fontStyle !== finalFontStyle || s.fontFamily !== finalFontFamily
              ));

              const store = usePdfStore.getState();
              const freshAnn = store.pages[pageIndex]?.annotations.find(
                (a) =>
                  a.type === 'text' &&
                  Math.abs(a.points[0].x - natX) < 0.01 &&
                  Math.abs(a.points[0].y - natY) < 0.01
              );

              // ── 1. Paint white-out + new text directly on the canvas ───
              // span.clientWidth is in display px; divide by scaleFactor to get viewport px
              const spanViewportW = span.clientWidth / scaleFactor;
              const newNatW_blur = (spanViewportW / viewport.scale / naturalVp.width) * 100;
              const finalNatW = Math.max(newNatW_blur, freshAnn?.width || natW);

              const canvas = canvasRef?.current;
              if (canvas) {
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  ctx.save();

                  // The canvas buffer is viewport-px * devicePixelRatio, so we scale
                  const outputScale = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
                  if (outputScale !== 1) {
                    ctx.scale(outputScale, outputScale);
                  }

                  ctx.translate(sx, sy);
                  ctx.rotate((viewport.rotation * Math.PI) / 180);

                  const activeScreenFontSize = finalFontSize * viewport.scale;
                  // Increase padding to fully cover ascenders/descenders (overshoots)
                  const paddingBottom = activeScreenFontSize * 0.25;
                  const paddingTop = activeScreenFontSize * 0.2;
                  const paddingX = activeScreenFontSize * 0.05;
                  // item.height is in PDF pts; convert to canvas (viewport) px
                  const rectH = item.height * viewport.scale;

                  ctx.fillStyle = finalBgColor;
                  const paintW = finalNatW / 100 * naturalVp.width * viewport.scale;
                  // Y-axis goes down in canvas. We start at -rectH (up from baseline) minus paddingTop,
                  // and the total height is rectH + paddingTop + paddingBottom
                  ctx.fillRect(-paddingX, -rectH - paddingTop, paintW + paddingX * 2, rectH + paddingTop + paddingBottom);

                  ctx.textBaseline = 'alphabetic';

                  // Draw segments if available
                  if (hasSegments && segments.length > 0) {
                    let xOff = 0;
                    for (const seg of segments) {
                      const segFam = seg.fontFamily || finalFontFamily;
                      const segBold = (seg.fontWeight || 'normal') === 'bold';
                      const segItalic = (seg.fontStyle || 'normal') === 'italic';
                      const segSize = (seg.fontSize || finalFontSize) * viewport.scale;
                      ctx.fillStyle = seg.color || finalColor;
                      ctx.font = `${segBold ? 'bold ' : ''}${segItalic ? 'italic ' : ''}${segSize}px ${segFam}`;
                      ctx.fillText(seg.text, xOff, 0);
                      xOff += ctx.measureText(seg.text).width;
                    }
                  } else {
                    ctx.fillStyle = finalColor;
                    ctx.font = `${finalFontWeight === 'bold' ? 'bold ' : ''}${finalFontStyle === 'italic' ? 'italic ' : ''}${activeScreenFontSize}px ${finalFontFamily}`;
                    ctx.fillText(newStr, 0, 0);
                  }
                  ctx.restore();
                }
              }

              // ── 2. Save to store (with segments) ─────────────────────────
              const annData: any = {
                data:  newStr,
                width: finalNatW,
                fontFamily: finalFontFamily,
                fontSize: finalFontSize,
                fontWeight: finalFontWeight,
                fontStyle: finalFontStyle,
                color: finalColor,
                bgColor: finalBgColor,
                segments: hasSegments ? segments : undefined,
                isCommitted: true, // Mark as committed so renderPage re-paints it on canvas refresh
              };

              if (freshAnn) {
                store.updateAnnotation(pageIndex, freshAnn.id, annData);
              } else {
                store.addAnnotation(pageIndex, {
                  type:          'text',
                  points:        [{ x: natX, y: natY }],
                  height:        natH,
                  originalWidth: natW,
                  opacity:       1,
                  ...annData,
                });
              }
              const isAnotherSpan = document.activeElement && document.activeElement.tagName === 'SPAN' && (document.activeElement as HTMLElement).isContentEditable;
              if (!isAnotherSpan) {
                setActiveEdit(null);
              }
            }, 150);
          });

          container.appendChild(span);
        });
      } catch (err) {
        console.error('TextLayerOverlay:', err);
      }
    };

    buildLayer();
  }, [pdfProxy, pageIndex, viewport, scaleFactor, isOcrRunning]);

  // Helper: extract segments from span's child nodes for per-word formatting
  const extractSegmentsFromSpan = (span: HTMLSpanElement, defaults: { ff: string; fontSize: number; fontWeight: string; fontStyle: string; color: string }) => {
    const segments: { text: string; color?: string; fontWeight?: string; fontStyle?: string; fontFamily?: string; fontSize?: number }[] = [];
    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || '';
        if (text.length > 0) {
          // Inherit styles from closest styled parent (inner span) or use defaults
          let el = node.parentElement;
          // If parent is the outer span itself, use defaults
          if (el === span) {
            segments.push({
              text,
              color: defaults.color,
              fontWeight: defaults.fontWeight,
              fontStyle: defaults.fontStyle,
              fontFamily: defaults.ff,
              fontSize: defaults.fontSize,
            });
          } else if (el) {
            segments.push({
              text,
              color: el.style.color || defaults.color,
              fontWeight: el.style.fontWeight || defaults.fontWeight,
              fontStyle: el.style.fontStyle || defaults.fontStyle,
              fontFamily: el.style.fontFamily || defaults.ff,
              fontSize: el.style.fontSize ? parseFloat(el.style.fontSize) / (viewport.scale * scaleFactor) : defaults.fontSize,
            });
          }
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        for (const child of Array.from(node.childNodes)) {
          walk(child);
        }
      }
    };
    for (const child of Array.from(span.childNodes)) {
      walk(child);
    }
    return segments;
  };

  // Handle toolbar interactions — applies formatting to selected text only
  const updateActiveSpanStyle = (updater: (edit: ActiveEdit) => Partial<ActiveEdit>) => {
    if (!activeEdit) return;
    const updates = updater(activeEdit);
    const newEdit = { ...activeEdit, ...updates };
    const { span } = newEdit;

    // Check if there's a text selection within the span
    const sel = window.getSelection();
    const hasSelection = sel && sel.rangeCount > 0 && !sel.isCollapsed && span.contains(sel.anchorNode) && span.contains(sel.focusNode);

    if (hasSelection && sel) {
      span.dataset.isDirty = 'true';
      // Apply formatting ONLY to the selected range
      const range = sel.getRangeAt(0);
      const selectedText = range.toString();
      if (selectedText.length > 0) {
        // Create a styled wrapper span for the selection
        const wrapper = document.createElement('span');
        // Copy current formatting from the updates
        if ('currentColor' in updates) {
          wrapper.style.color = newEdit.currentColor;
        }
        if ('currentFontWeight' in updates) {
          wrapper.style.fontWeight = newEdit.currentFontWeight;
        }
        if ('currentFontStyle' in updates) {
          wrapper.style.fontStyle = newEdit.currentFontStyle;
        }
        if ('currentFontFamily' in updates) {
          wrapper.style.fontFamily = newEdit.currentFontFamily;
        }
        if ('currentFontSize' in updates) {
          // Display px = pdfFontSize * viewport.scale * scaleFactor
          const sizeInPx = newEdit.currentFontSize * viewport.scale * scaleFactor;
          wrapper.style.fontSize = `${sizeInPx}px`;
        }

        try {
          range.surroundContents(wrapper);
        } catch (e) {
          // surroundContents fails if selection crosses element boundaries
          // Fall back: extract contents, wrap, and re-insert
          const fragment = range.extractContents();
          wrapper.appendChild(fragment);
          range.insertNode(wrapper);
        }

        // Clear selection after applying
        sel.removeAllRanges();
      }
    } else {
      // No selection — apply to entire span (legacy behavior)
      span.style.fontFamily = newEdit.currentFontFamily;

      // Display px = pdfFontSize * viewport.scale * scaleFactor
      const sizeInPx = newEdit.currentFontSize * viewport.scale * scaleFactor;
      span.style.fontSize = `${sizeInPx}px`;
      span.style.lineHeight = `${sizeInPx}px`;
      span.style.top = `${(newEdit.sy * scaleFactor) - sizeInPx * 0.8}px`;

      span.style.fontWeight = newEdit.currentFontWeight;
      span.style.fontStyle = newEdit.currentFontStyle;
      span.style.color = newEdit.currentColor;
      span.dataset.textColor = newEdit.currentColor;
      span.dataset.isDirty = 'true';
    }

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
