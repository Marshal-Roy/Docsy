"use client";
import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { usePdfStore, Annotation } from '@/store/pdfStore';
import { RotateCw, Trash2, Download, MousePointer2, Highlighter, PenLine, MessageSquare, ChevronLeft, ChevronRight, Loader2, Type, Image as ImageIcon, PlusSquare, FilePlus, ImagePlus, FileText, Menu } from 'lucide-react';
import ThumbnailSidebar from './ThumbnailSidebar';
import AnnotationOverlay from './AnnotationOverlay';
import TextLayerOverlay from './TextLayerOverlay';

// Configure the worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

const PdfViewer: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<any>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<{ x: number; y: number }[]>([]);
  const [viewport, setViewport] = useState<any>(null);
  
  const { 
    pdfBytes, pages, currentPageIndex, setCurrentPage, rotatePage, deletePage, exportPdf, 
    isProcessing, pdfProxy, setPdfProxy, activeTool, setTool, activeColor, setColor, addAnnotation,
    addBlankPage, addImagePage, addPages, selectedAnnotationId, setSelectedAnnotationId, deleteAnnotation,
    pendingDelete, setPendingDelete
  } = usePdfStore();
  const [isExporting, setIsExporting] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const toolButtons: { id: any; icon: any; label: string }[] = [
    { id: 'pen', icon: <PenLine size={18} />, label: 'Draw' },
    { id: 'comment', icon: <MessageSquare size={18} />, label: 'Comment' },
    { id: 'image', icon: <ImageIcon size={18} />, label: 'Add Image' },
  ];

  const colors = ['#ffffff', '#000000', '#fbbf24', '#60a5fa', '#f87171', '#4ade80', '#a78bfa'];

  useEffect(() => {
    if (!pdfBytes) return;

    const loadPdf = async () => {
      if (!pdfProxy && pdfBytes) {
        try {
          const loadingTask = pdfjsLib.getDocument({ data: pdfBytes.slice(0) });
          const pdf = await loadingTask.promise;
          setPdfProxy(pdf);
        } catch (error) {
          console.error('Error creating PDF proxy:', error);
        }
      }
    };

    loadPdf();
  }, [pdfBytes, pdfProxy]);

  useEffect(() => {
    if (pdfProxy && pages.length > 0) {
      renderPage();
    }
    return () => {
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }
    };
  }, [pdfProxy, currentPageIndex, pages]);

  // Keyboard arrow navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't navigate if user is typing in an editable element
      const active = document.activeElement;
      if (!active) return;
      const tag = active.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if ((active as HTMLElement).isContentEditable) return;
      // Also skip if a contenteditable span is focused (text editing)
      if (active.getAttribute('contenteditable') === 'true') return;

      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        setCurrentPage(Math.max(0, currentPageIndex - 1));
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        setCurrentPage(Math.min(pages.length - 1, currentPageIndex + 1));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPageIndex, pages.length, setCurrentPage]);

  const renderPage = async () => {
    if (!canvasRef.current || !pdfProxy || pages.length === 0) return;

    const pageInfo = pages[currentPageIndex];
    if (!pageInfo) return;

    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
    }

    try {
      const page = await pdfProxy.getPage(pageInfo.originalIndex + 1);
      const vp = page.getViewport({ 
        scale: 1.5, 
        rotation: pageInfo.rotation 
      });
      
      setViewport(vp);

      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (!context) return;

      const outputScale = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
      
      canvas.width = Math.floor(vp.width * outputScale);
      canvas.height = Math.floor(vp.height * outputScale);
      // Only set CSS width; height:auto (from JSX) maintains aspect ratio on small screens
      canvas.style.width = Math.floor(vp.width) + "px";
      canvas.style.height = 'auto';

      const transform = outputScale !== 1 
        ? [outputScale, 0, 0, outputScale, 0, 0] 
        : undefined;

      const renderTask = page.render({
        canvasContext: context,
        transform: transform,
        viewport: vp,
        canvas: canvas,
      });

      renderTaskRef.current = renderTask;
      await renderTask.promise;

      // ── Re-paint committed text edits on top of the freshly rendered page ──
      const naturalVp = page.getViewport({ scale: 1, rotation: 0 });
      const textAnns  = pageInfo.annotations.filter((a) => a.type === 'text' && a.data);

      if (textAnns.length > 0) {
        context.save();
        const outputScale = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
        if (outputScale !== 1) {
          context.scale(outputScale, outputScale);
        }
        
        for (const ann of textAnns) {
          // ann.points[0].y is the % of the TOP of the text block from the top of natural page
          const pdfX       = (ann.points[0].x / 100) * naturalVp.width;
          const pdfTopYBot = naturalVp.height - (ann.points[0].y / 100) * naturalVp.height;
          // Baseline in PDF space is Top - Height
          const pdfBaselineY = pdfTopYBot - (ann.height || 0) / 100 * naturalVp.height;

          // Convert baseline point to screen coords
          const [sx, sy]   = vp.convertToViewportPoint(pdfX, pdfBaselineY);
          
          const screenFontSize = (ann.fontSize || 12) * vp.scale;
          const origW      = (Math.max(ann.width || 0, ann.originalWidth || 0)) / 100 * naturalVp.width * vp.scale;

          context.save();
          context.translate(sx, sy);
          context.rotate((vp.rotation * Math.PI) / 180);
          
          // Tight white-out — expanded padding to avoid artifacts from ascenders/descenders
          const paddingBottom = screenFontSize * 0.25;
          const paddingTop = screenFontSize * 0.2;
          const paddingX = screenFontSize * 0.05;
          const rectH = (ann.height || 0) / 100 * naturalVp.height * vp.scale;

          context.fillStyle = '#ffffff';
          // Since origin is baseline (0,0), we go UP by (rectH + paddingTop) and DOWN by paddingBottom
          context.fillRect(-paddingX, -rectH - paddingTop, origW + paddingX * 2, rectH + paddingTop + paddingBottom);

          context.textBaseline = 'alphabetic'; // Align perfectly with PDF baseline

          // Draw segments if available, otherwise single text
          const segments = ann.segments;
          if (segments && segments.length > 0) {
            let xOff = 0;
            for (const seg of segments) {
              const segFam = seg.fontFamily || ann.fontFamily || 'Arial, Helvetica, sans-serif';
              const segBold = (seg.fontWeight || ann.fontWeight || 'normal') === 'bold';
              const segItalic = (seg.fontStyle || ann.fontStyle || 'normal') === 'italic';
              const segSize = (seg.fontSize || ann.fontSize || 12) * vp.scale;
              const segColor = seg.color || ann.color || '#000000';

              context.fillStyle = segColor;
              context.font = `${segBold ? 'bold ' : ''}${segItalic ? 'italic ' : ''}${segSize}px ${segFam}`;
              context.fillText(seg.text, xOff, 0);
              xOff += context.measureText(seg.text).width;
            }
          } else {
            // Legacy single-text fallback
            const ff   = ann.fontFamily || 'Arial, Helvetica, sans-serif';
            const isBold = ann.fontWeight === 'bold';
            const isItalic = ann.fontStyle === 'italic';
            context.fillStyle    = ann.color || '#000000';
            context.font         = `${isBold ? 'bold ' : ''}${isItalic ? 'italic ' : ''}${screenFontSize}px ${ff}`;
            context.fillText(ann.data!, 0, 0);
          }

          context.restore();
        }
        context.restore();
      }
    } catch (error: any) {
      if (error.name !== 'RenderingCancelledException') {
        console.error('Main viewer rendering error:', error);
      }
    }
  };

  const getNormalizedPoint = (e: React.MouseEvent) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    
    let clientX = e.clientX - rect.left;
    let clientY = e.clientY - rect.top;
    
    if (viewport) {
      const displayWidth = rect.width;
      const internalWidth = viewport.width;
      const scaleFactor = displayWidth / internalWidth;
      
      if (scaleFactor > 0) {
        clientX = clientX / scaleFactor;
        clientY = clientY / scaleFactor;
      }

      const [pdfX, pdfY] = viewport.convertToPdfPoint(clientX, clientY);
      const naturalW = viewport.viewBox[2];
      const naturalH = viewport.viewBox[3];
      
      const x = (pdfX / naturalW) * 100;
      const y = ((naturalH - pdfY) / naturalH) * 100;
      return { x, y };
    }
    
    return { 
      x: (clientX / rect.width) * 100, 
      y: (clientY / rect.height) * 100 
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    // If tool is select or text, let clicks pass to the text layer
    if (activeTool === 'select' || activeTool === 'text') return;
    
    setIsDrawing(true);
    setCurrentPoints([getNormalizedPoint(e)]);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing) return;
    setCurrentPoints(prev => [...prev, getNormalizedPoint(e)]);
  };

  const handleMouseUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    
    if (currentPoints.length > 0) {
      if (activeTool === 'comment') {
        const first = currentPoints[0];
        const last = currentPoints[currentPoints.length - 1];
        const x = Math.min(first.x, last.x);
        const y = Math.min(first.y, last.y);
        const w = Math.abs(last.x - first.x);
        const h = Math.abs(last.y - first.y);
        
        addAnnotation(currentPageIndex, {
          type: 'comment',
          points: [{ x, y }],
          width: Math.max(w, 5),
          height: Math.max(h, 5),
          color: '#ffffff',
          opacity: 1,
          data: '', // empty text initially
        });
      } else {
        addAnnotation(currentPageIndex, {
          type: activeTool === 'pen' ? 'pen' : 'highlight',
          points: currentPoints,
          color: activeColor,
          opacity: activeTool === 'highlight' ? 0.3 : 1,
        });
      }
    }
    setCurrentPoints([]);
  };

  const imageInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const imagePageInputRef = useRef<HTMLInputElement>(null);
  const [showInsertMenu, setShowInsertMenu] = useState(false);
  const insertMode = useRef<number | undefined>(undefined);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        addAnnotation(currentPageIndex, {
          type: 'image',
          points: [{ x: 10, y: 10 }],
          width: 20,
          height: 20,
          color: 'transparent',
          opacity: 1,
          data: dataUrl
        });
        setTool('select');
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    }
  };

  const handleAddPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const bytes = new Uint8Array(await file.arrayBuffer());
      await addPages(bytes, insertMode.current);
      setShowInsertMenu(false);
      e.target.value = '';
    }
  };

  const handleAddImagePage = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = async (event) => {
        const dataUrl = event.target?.result as string;
        await addImagePage(dataUrl, insertMode.current);
        setShowInsertMenu(false);
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    }
  };

  const handleToolClick = (toolId: any) => {
    if (toolId === 'image') {
      imageInputRef.current?.click();
    } else {
      if (activeTool === toolId) {
        setTool('select');
      } else {
        setTool(toolId);
      }
    }
  };

  const handleDownload = async () => {
    setIsExporting(true);
    try {
      const bytes = await exportPdf();
      const blob = new Blob([bytes as any], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'edited_docsy.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  if (!pdfBytes) return null;

  return (
    <div className="pdf-viewer-container" style={{ display: 'flex', height: '100%', width: '100%', overflow: 'hidden', position: 'relative' }}>
      <ThumbnailSidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', padding: '20px', position: 'relative', overflowY: 'auto' }}>
        {(isProcessing || isExporting) && (
          <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            backdropFilter: 'blur(4px)'
          }}>
            <div style={{ 
              color: 'white', 
              fontSize: '1.2rem', 
              fontWeight: 600,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px'
            }}>
              <Loader2 className="animate-spin" size={32} />
              {isExporting ? 'Exporting PDF...' : 'Processing Page Changes...'}
            </div>
          </div>
        )}

        <div className="glass" style={{ 
          padding: '12px 16px', 
          borderRadius: '16px', 
          display: 'flex', 
          gap: '16px', 
          alignItems: 'center', 
          justifyContent: 'center',
          flexWrap: 'wrap',
          position: 'sticky', 
          top: '12px', 
          zIndex: 50,
          border: '1px solid var(--border-glass)',
          boxShadow: '0 10px 30px -10px rgba(0,0,0,0.3)',
          maxWidth: '850px',
          margin: '0 auto',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button 
              className="glass-interactive mobile-menu-btn" 
              onClick={() => setIsSidebarOpen(true)}
              style={{ width: '32px', height: '32px', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', color: 'white', border: 'none', background: 'rgba(255,255,255,0.1)' }}
            >
              <Menu size={18} />
            </button>
            <button 
              className="glass-interactive" 
              onClick={() => setCurrentPage(Math.max(0, currentPageIndex - 1))} 
              disabled={currentPageIndex === 0} 
              style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', color: 'white', opacity: currentPageIndex === 0 ? 0.3 : 1 }}
            >
              <ChevronLeft size={18} />
            </button>
            <span style={{ fontSize: '0.85rem', minWidth: '80px', textAlign: 'center', fontWeight: 500, color: 'white' }}>
              Page {currentPageIndex + 1} / {pages.length}
            </span>
            <button 
              className="glass-interactive" 
              onClick={() => setCurrentPage(Math.min(pages.length - 1, currentPageIndex + 1))} 
              disabled={currentPageIndex === pages.length - 1} 
              style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', color: 'white', opacity: currentPageIndex === pages.length - 1 ? 0.3 : 1 }}
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="hide-on-mobile" style={{ width: '1px', height: '24px', background: 'var(--border-glass)' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <div style={{ display: 'flex', gap: '4px' }}>
              {toolButtons.map((tool) => (
                <button
                  key={tool.id}
                  onClick={() => handleToolClick(tool.id)}
                  title={tool.label}
                  style={{
                    width: '36px',
                    height: '36px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '8px',
                    border: 'none',
                    background: activeTool === tool.id ? 'var(--accent-primary)' : 'transparent',
                    color: activeTool === tool.id ? 'white' : 'var(--text-primary)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  className={activeTool !== tool.id ? 'hover-glass' : ''}
                >
                  {tool.icon}
                </button>
              ))}
              <input 
                type="file" 
                ref={imageInputRef} 
                style={{ display: 'none' }} 
                accept="image/*" 
                onChange={handleImageSelect} 
              />
            </div>

            <div style={{ display: 'flex', gap: '6px', padding: '0 8px' }}>
              {colors.map((color) => (
                <button
                  key={color}
                  onClick={() => setColor(color)}
                  style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    border: activeColor === color ? '2px solid white' : 'none',
                    background: color,
                    cursor: 'pointer',
                    transition: 'transform 0.2s',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                  }}
                />
              ))}
            </div>
          </div>

          <div className="hide-on-mobile" style={{ width: '1px', height: '24px', background: 'var(--border-glass)' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <div style={{ position: 'relative' }}>
            <button 
              className="glass-interactive" 
              title="Insert Page"
              onClick={() => setShowInsertMenu(!showInsertMenu)}
              style={{ width: 'auto', padding: '0 12px', height: '36px', display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', color: 'var(--accent-primary)', fontWeight: 500, fontSize: '0.9rem' }}
            >
              <PlusSquare size={18} /> Insert Page
            </button>
            
            {showInsertMenu && (
              <div style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                left: 0,
                background: 'white',
                borderRadius: '8px',
                padding: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                boxShadow: '0 10px 25px -5px rgba(0,0,0,0.2)',
                zIndex: 1000,
                minWidth: '200px',
                border: '1px solid var(--border-glass)'
              }}>
                <div style={{ padding: '4px 8px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Insert After</div>
                <button onClick={() => { addBlankPage(currentPageIndex + 1); setShowInsertMenu(false); }} className="menu-item glass-interactive" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', border: 'none', background: 'transparent', width: '100%', textAlign: 'left', cursor: 'pointer', borderRadius: '4px' }}>
                  <FileText size={16} /> Blank Page
                </button>
                <button onClick={() => { insertMode.current = currentPageIndex + 1; pdfInputRef.current?.click(); }} className="menu-item glass-interactive" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', border: 'none', background: 'transparent', width: '100%', textAlign: 'left', cursor: 'pointer', borderRadius: '4px' }}>
                  <FilePlus size={16} /> From PDF
                </button>
                <button onClick={() => { insertMode.current = currentPageIndex + 1; imagePageInputRef.current?.click(); }} className="menu-item glass-interactive" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', border: 'none', background: 'transparent', width: '100%', textAlign: 'left', cursor: 'pointer', borderRadius: '4px' }}>
                  <ImagePlus size={16} /> From Image
                </button>

                <div style={{ height: '1px', background: 'var(--border-glass)', margin: '4px 0' }} />
                
                <div style={{ padding: '4px 8px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Insert Before</div>
                <button onClick={() => { addBlankPage(currentPageIndex); setShowInsertMenu(false); }} className="menu-item glass-interactive" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', border: 'none', background: 'transparent', width: '100%', textAlign: 'left', cursor: 'pointer', borderRadius: '4px' }}>
                  <FileText size={16} /> Blank Page
                </button>
                <button onClick={() => { insertMode.current = currentPageIndex; pdfInputRef.current?.click(); }} className="menu-item glass-interactive" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', border: 'none', background: 'transparent', width: '100%', textAlign: 'left', cursor: 'pointer', borderRadius: '4px' }}>
                  <FilePlus size={16} /> From PDF
                </button>
                <button onClick={() => { insertMode.current = currentPageIndex; imagePageInputRef.current?.click(); }} className="menu-item glass-interactive" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', border: 'none', background: 'transparent', width: '100%', textAlign: 'left', cursor: 'pointer', borderRadius: '4px' }}>
                  <ImagePlus size={16} /> From Image
                </button>
              </div>
            )}
            
            <input type="file" ref={pdfInputRef} style={{ display: 'none' }} accept="application/pdf" onChange={handleAddPdf} />
            <input type="file" ref={imagePageInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleAddImagePage} />
          </div>
            <button 
              className="glass-interactive" 
              title="Rotate Page"
              onClick={() => rotatePage(currentPageIndex, 90)}
              style={{ width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', color: 'var(--accent-primary)' }}
            >
              <RotateCw size={18} />
            </button>
            <button 
              className="glass-interactive" 
              title={selectedAnnotationId ? "Delete Selected Item" : "Delete Page"}
              onClick={() => {
                if (selectedAnnotationId) {
                  const ann = pages[currentPageIndex]?.annotations.find((a: any) => a.id === selectedAnnotationId);
                  const typeName = ann?.type === 'image' ? 'image' : ann?.type === 'text' ? 'text block' : ann?.type === 'comment' ? 'comment' : 'annotation';
                  setPendingDelete({ 
                    type: 'annotation', 
                    pageIndex: currentPageIndex, 
                    annotationId: selectedAnnotationId,
                    message: `Are you sure you want to delete this ${typeName}?`
                  });
                } else {
                  setPendingDelete({ 
                    type: 'page', 
                    pageIndex: currentPageIndex,
                    message: `Are you sure you want to delete Page ${currentPageIndex + 1}?`
                  });
                }
              }}
              disabled={!selectedAnnotationId && pages.length <= 1}
              style={{ width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', color: '#f87171' }}
            >
              <Trash2 size={18} />
            </button>
          {/* No spacer needed */}

          <button 
            className="glass-interactive shadow-accent" 
            onClick={handleDownload}
            disabled={isProcessing}
            style={{ 
              padding: '10px 24px', 
              borderRadius: '10px', 
              background: 'var(--accent-primary)', 
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontWeight: 600,
              border: 'none'
            }}
          >
            {isProcessing ? <Loader2 className="animate-spin" size={18} /> : <Download size={18} />}
            Export PDF
          </button>
          </div>
        </div>
        
        <div 
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className="glass" 
          style={{
            padding: '0',
            borderRadius: '4px',
            maxWidth: '100%',
            background: 'white',
            boxShadow: '0 0 50px rgba(0,0,0,0.3)',
            marginBottom: '40px',
            position: 'relative',
            cursor: activeTool === 'select' ? 'default' : 'crosshair'
          }}
        >
          <canvas ref={canvasRef} style={{ maxWidth: '100%', height: 'auto', display: 'block' }} />
          {viewport && pdfProxy && (
            <>
              <TextLayerOverlay 
                pdfProxy={pdfProxy} 
                pageIndex={currentPageIndex} 
                viewport={viewport}
                canvasRef={canvasRef}
              />
              <AnnotationOverlay 
                annotations={pages[currentPageIndex]?.annotations || []} 
                width={viewport.width} 
                height={viewport.height} 
                viewport={viewport}
                pageIndex={currentPageIndex}
              />
              {isDrawing && (
                <AnnotationOverlay 
                  annotations={[{
                    id: 'temp',
                    type: activeTool === 'pen' ? 'pen' : activeTool === 'highlight' ? 'highlight' : 'comment',
                    points: currentPoints,
                    color: activeColor,
                    opacity: activeTool === 'highlight' ? 0.3 : 0.8
                  }]} 
                  width={viewport.width} 
                  height={viewport.height} 
                  viewport={viewport}
                  pageIndex={currentPageIndex}
                />
              )}
            </>
          )}
        </div>

        {pendingDelete && (
          <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            backdropFilter: 'blur(2px)'
          }}>
            <div className="glass" style={{
              background: 'white',
              padding: '24px',
              borderRadius: '12px',
              maxWidth: '400px',
              width: '90%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
            }}>
              <h3 style={{ marginTop: 0, marginBottom: '12px', fontSize: '1.2rem', color: '#111' }}>Confirm Deletion</h3>
              <p style={{ marginBottom: '24px', color: '#444' }}>
                {pendingDelete.message || `Are you sure you want to delete this ${pendingDelete.type}? This action cannot be undone.`}
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button 
                  className="glass-interactive"
                  onClick={() => setPendingDelete(null)}
                  style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #ccc', background: 'transparent', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button 
                  className="glass-interactive"
                  onClick={() => {
                    if (pendingDelete.type === 'annotation' && pendingDelete.annotationId) {
                      deleteAnnotation(pendingDelete.pageIndex, pendingDelete.annotationId);
                      if (selectedAnnotationId === pendingDelete.annotationId) setSelectedAnnotationId(null);
                    } else if (pendingDelete.type === 'page') {
                      deletePage(pendingDelete.pageIndex);
                    }
                    setPendingDelete(null);
                  }}
                  style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#ef4444', color: 'white', cursor: 'pointer' }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PdfViewer;
