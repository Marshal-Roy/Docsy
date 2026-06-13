import React, { useState, useEffect, useRef } from 'react';
import { Annotation, usePdfStore } from '@/store/pdfStore';

interface Props {
  annotations: Annotation[];
  width: number; // canvas width (rotated)
  height: number; // canvas height (rotated)
  viewport?: any;
  pageIndex?: number;
}

const InteractiveImage: React.FC<{ ann: Annotation, width: number, height: number, viewport?: any, pageIndex?: number, scaleFactor: number }> = ({ ann, width, height, viewport, pageIndex, scaleFactor }) => {
  const { updateAnnotation, selectedAnnotationId, setSelectedAnnotationId, deleteAnnotation } = usePdfStore();
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<string | null>(null);
  const lastX = useRef(0);
  const lastY = useRef(0);
  
  // localPos stores unrotated percentages
  const [localPos, setLocalPos] = useState({ 
    x: ann.points[0]?.x || 0, 
    y: ann.points[0]?.y || 0, 
    w: ann.width || 20, 
    h: ann.height || 20 
  });
  
  const isSelected = selectedAnnotationId === ann.id;

  useEffect(() => {
    if (!isDragging && !isResizing) {
      setLocalPos({ 
        x: ann.points[0]?.x || 0, 
        y: ann.points[0]?.y || 0, 
        w: ann.width || 20, 
        h: ann.height || 20 
      });
    }
  }, [ann, isDragging, isResizing]);

  useEffect(() => {
    const handleGlobalClick = () => setSelectedAnnotationId(null);
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, [setSelectedAnnotationId]);

  useEffect(() => {
    if (!isSelected || pageIndex === undefined) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const tag = document.activeElement?.tagName.toLowerCase();
        if (tag === 'textarea' || tag === 'input') return;
        usePdfStore.getState().deleteAnnotation(pageIndex, ann.id);
        setSelectedAnnotationId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSelected, ann.id, pageIndex, setSelectedAnnotationId]);

  const handleDragStart = (clientX: number, clientY: number) => {
    setIsDragging(true);
    lastX.current = clientX;
    lastY.current = clientY;
  };

  const handleResizeStart = (clientX: number, clientY: number, handle: string) => {
    setIsResizing(handle);
    lastX.current = clientX;
    lastY.current = clientY;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedAnnotationId(ann.id);
    handleDragStart(e.clientX, e.clientY);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    setSelectedAnnotationId(ann.id);
    const touch = e.touches[0];
    if (touch) {
      handleDragStart(touch.clientX, touch.clientY);
    }
  };

  const handleMouseDownResize = (e: React.MouseEvent, handle: string) => {
    e.stopPropagation();
    setSelectedAnnotationId(ann.id);
    handleResizeStart(e.clientX, e.clientY, handle);
  };

  const handleTouchStartResize = (e: React.TouchEvent, handle: string) => {
    e.stopPropagation();
    setSelectedAnnotationId(ann.id);
    const touch = e.touches[0];
    if (touch) {
      handleResizeStart(touch.clientX, touch.clientY, handle);
    }
  };

  useEffect(() => {
    if (!isDragging && !isResizing) return;

    const handleMove = (clientX: number, clientY: number) => {
      const deltaX = clientX - lastX.current;
      const deltaY = clientY - lastY.current;

      lastX.current = clientX;
      lastY.current = clientY;

      let unrotDx = deltaX;
      let unrotDy = deltaY;
      
      let scaleX = width;
      let scaleY = height;

      if (viewport) {
        const rad = (-viewport.rotation * Math.PI) / 180;
        unrotDx = deltaX * Math.cos(rad) - deltaY * Math.sin(rad);
        unrotDy = deltaX * Math.sin(rad) + deltaY * Math.cos(rad);
        
        const naturalW = viewport.viewBox[2];
        const naturalH = viewport.viewBox[3];
        scaleX = naturalW * viewport.scale * scaleFactor;
        scaleY = naturalH * viewport.scale * scaleFactor;
      } else {
        scaleX = width * scaleFactor;
        scaleY = height * scaleFactor;
      }

      const dx = (unrotDx / scaleX) * 100;
      const dy = (unrotDy / scaleY) * 100;

      if (isDragging) {
        setLocalPos(prev => ({
          ...prev,
          x: prev.x + dx,
          y: prev.y + dy
        }));
      } else if (isResizing) {
        setLocalPos(prev => {
          let { x, y, w, h } = prev;
          if (isResizing.includes('e')) w += dx;
          if (isResizing.includes('s')) h += dy;
          if (isResizing.includes('w')) { x += dx; w -= dx; }
          if (isResizing.includes('n')) { y += dy; h -= dy; }
          
          w = Math.max(w, 2);
          h = Math.max(h, 2);
          return { x, y, w, h };
        });
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      e.stopPropagation();
      handleMove(e.clientX, e.clientY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.stopPropagation();
      if (e.cancelable) {
        e.preventDefault();
      }
      const touch = e.touches[0];
      if (touch) {
        handleMove(touch.clientX, touch.clientY);
      }
    };

    const handleUp = () => {
      setIsDragging(false);
      setIsResizing(null);
      if (pageIndex !== undefined) {
        setLocalPos(prev => {
          updateAnnotation(pageIndex, ann.id, {
            points: [{ x: prev.x, y: prev.y }],
            width: prev.w,
            height: prev.h
          });
          return prev;
        });
      }
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: false });
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleUp);
    };
  }, [isDragging, isResizing, width, height, viewport, pageIndex, ann.id, updateAnnotation, scaleFactor]);

  let sx = (localPos.x * width) / 100;
  let sy = (localPos.y * height) / 100;
  let scaledW = (localPos.w * width) / 100;
  let scaledH = (localPos.h * height) / 100;
  let rot = 0;

  if (viewport) {
    const naturalW = viewport.viewBox[2];
    const naturalH = viewport.viewBox[3];
    const pdfX = (localPos.x / 100) * naturalW;
    const pdfY = naturalH - (localPos.y / 100) * naturalH;
    
    const pt = viewport.convertToViewportPoint(pdfX, pdfY);
    sx = pt[0];
    sy = pt[1];
    
    scaledW = (localPos.w / 100) * naturalW * viewport.scale;
    scaledH = (localPos.h / 100) * naturalH * viewport.scale;
    rot = viewport.rotation;
  }

  const handles = [
    { id: 'nw', x: 0, y: 0, cursor: 'nwse-resize' },
    { id: 'ne', x: scaledW, y: 0, cursor: 'nesw-resize' },
    { id: 'sw', x: 0, y: scaledH, cursor: 'nesw-resize' },
    { id: 'se', x: scaledW, y: scaledH, cursor: 'nwse-resize' },
    { id: 'n', x: scaledW / 2, y: 0, cursor: 'ns-resize' },
    { id: 's', x: scaledW / 2, y: scaledH, cursor: 'ns-resize' },
    { id: 'w', x: 0, y: scaledH / 2, cursor: 'ew-resize' },
    { id: 'e', x: scaledW, y: scaledH / 2, cursor: 'ew-resize' },
  ];

  return (
    <g transform={`translate(${sx}, ${sy}) rotate(${rot})`}>
      <image
        href={ann.data}
        width={scaledW}
        height={scaledH}
        preserveAspectRatio="none"
        style={{ cursor: 'move', pointerEvents: 'auto' }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onClick={(e) => { e.stopPropagation(); setSelectedAnnotationId(ann.id); }}
      />
      {isSelected && (
        <>
          <g
             transform={`translate(${scaledW - 12}, -12)`}
             style={{ cursor: 'pointer', pointerEvents: 'auto' }}
             onMouseDown={(e) => { e.stopPropagation(); if (pageIndex !== undefined) { deleteAnnotation(pageIndex, ann.id); setSelectedAnnotationId(null); } }}
             onTouchStart={(e) => { e.stopPropagation(); if (pageIndex !== undefined) { deleteAnnotation(pageIndex, ann.id); setSelectedAnnotationId(null); } }}
          >
             <circle cx={12} cy={12} r={10} fill="#ef4444" stroke="white" strokeWidth={2} />
             <path d="M8 8 L16 16 M16 8 L8 16" stroke="white" strokeWidth={2} strokeLinecap="round" />
          </g>
          <rect 
            x={0} y={0} width={scaledW} height={scaledH} 
            fill="none" stroke="#3b82f6" strokeWidth={2} 
            style={{ pointerEvents: 'none' }} 
          />
          {handles.map(h => (
            <rect
              key={h.id}
              x={h.x - 4} y={h.y - 4}
              width={8} height={8}
              fill="white" stroke="#3b82f6" strokeWidth={1.5}
              style={{ cursor: h.cursor, pointerEvents: 'auto' }}
              onMouseDown={(e) => handleMouseDownResize(e, h.id)}
              onTouchStart={(e) => handleTouchStartResize(e, h.id)}
            />
          ))}
        </>
      )}
    </g>
  );
};

const InteractiveComment: React.FC<{ ann: Annotation, width: number, height: number, viewport?: any, pageIndex?: number, scaleFactor: number }> = ({ ann, width, height, viewport, pageIndex, scaleFactor }) => {
  const { updateAnnotation, selectedAnnotationId, setSelectedAnnotationId, deleteAnnotation } = usePdfStore();
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<string | null>(null);
  const lastX = useRef(0);
  const lastY = useRef(0);
  
  const [localPos, setLocalPos] = useState({ 
    x: ann.points[0]?.x || 0, 
    y: ann.points[0]?.y || 0, 
    w: ann.width || 20, 
    h: ann.height || 10 
  });
  
  const isSelected = selectedAnnotationId === ann.id;
  const [isEditing, setIsEditing] = useState(false);
  const textRef = React.useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing) {
      textRef.current?.focus();
    }
  }, [isEditing]);

  useEffect(() => {
    if (!isDragging && !isResizing) {
      setLocalPos({ 
        x: ann.points[0]?.x || 0, 
        y: ann.points[0]?.y || 0, 
        w: ann.width || 20, 
        h: ann.height || 10 
      });
    }
  }, [ann, isDragging, isResizing]);

  useEffect(() => {
    const handleGlobalClick = () => {
      setSelectedAnnotationId(null);
      setIsEditing(false);
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, [setSelectedAnnotationId]);

  useEffect(() => {
    if (!isSelected || pageIndex === undefined) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const tag = document.activeElement?.tagName.toLowerCase();
        if (tag === 'textarea' || tag === 'input') return;
        usePdfStore.getState().deleteAnnotation(pageIndex, ann.id);
        setSelectedAnnotationId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSelected, ann.id, pageIndex, setSelectedAnnotationId]);

  const handleDragStart = (clientX: number, clientY: number) => {
    setIsDragging(true);
    lastX.current = clientX;
    lastY.current = clientY;
  };

  const handleResizeStart = (clientX: number, clientY: number, handle: string) => {
    setIsResizing(handle);
    lastX.current = clientX;
    lastY.current = clientY;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedAnnotationId(ann.id);
    handleDragStart(e.clientX, e.clientY);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    setSelectedAnnotationId(ann.id);
    const touch = e.touches[0];
    if (touch) {
      handleDragStart(touch.clientX, touch.clientY);
    }
  };

  const handleMouseDownResize = (e: React.MouseEvent, handle: string) => {
    e.stopPropagation();
    setSelectedAnnotationId(ann.id);
    handleResizeStart(e.clientX, e.clientY, handle);
  };

  const handleTouchStartResize = (e: React.TouchEvent, handle: string) => {
    e.stopPropagation();
    setSelectedAnnotationId(ann.id);
    const touch = e.touches[0];
    if (touch) {
      handleResizeStart(touch.clientX, touch.clientY, handle);
    }
  };

  useEffect(() => {
    if (!isDragging && !isResizing) return;

    const handleMove = (clientX: number, clientY: number) => {
      const deltaX = clientX - lastX.current;
      const deltaY = clientY - lastY.current;

      lastX.current = clientX;
      lastY.current = clientY;

      let unrotDx = deltaX;
      let unrotDy = deltaY;
      
      let scaleX = width;
      let scaleY = height;

      if (viewport) {
        const rad = (-viewport.rotation * Math.PI) / 180;
        unrotDx = deltaX * Math.cos(rad) - deltaY * Math.sin(rad);
        unrotDy = deltaX * Math.sin(rad) + deltaY * Math.cos(rad);
        
        const naturalW = viewport.viewBox[2];
        const naturalH = viewport.viewBox[3];
        scaleX = naturalW * viewport.scale * scaleFactor;
        scaleY = naturalH * viewport.scale * scaleFactor;
      } else {
        scaleX = width * scaleFactor;
        scaleY = height * scaleFactor;
      }

      const dx = (unrotDx / scaleX) * 100;
      const dy = (unrotDy / scaleY) * 100;

      if (isDragging) {
        setLocalPos(prev => ({
          ...prev,
          x: prev.x + dx,
          y: prev.y + dy
        }));
      } else if (isResizing) {
        setLocalPos(prev => {
          let { x, y, w, h } = prev;
          if (isResizing.includes('e')) w += dx;
          if (isResizing.includes('s')) h += dy;
          if (isResizing.includes('w')) { x += dx; w -= dx; }
          if (isResizing.includes('n')) { y += dy; h -= dy; }
          
          w = Math.max(w, 2);
          h = Math.max(h, 2);
          return { x, y, w, h };
        });
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      e.stopPropagation();
      handleMove(e.clientX, e.clientY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.stopPropagation();
      if (e.cancelable) {
        e.preventDefault();
      }
      const touch = e.touches[0];
      if (touch) {
        handleMove(touch.clientX, touch.clientY);
      }
    };

    const handleUp = () => {
      setIsDragging(false);
      setIsResizing(null);
      if (pageIndex !== undefined) {
        setLocalPos(prev => {
          updateAnnotation(pageIndex, ann.id, {
            points: [{ x: prev.x, y: prev.y }],
            width: prev.w,
            height: prev.h
          });
          return prev;
        });
      }
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: false });
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleUp);
    };
  }, [isDragging, isResizing, width, height, viewport, pageIndex, ann.id, updateAnnotation, scaleFactor]);

  let sx = (localPos.x * width) / 100;
  let sy = (localPos.y * height) / 100;
  let scaledW = (localPos.w * width) / 100;
  let scaledH = (localPos.h * height) / 100;
  let rot = 0;

  if (viewport) {
    const naturalW = viewport.viewBox[2];
    const naturalH = viewport.viewBox[3];
    const pdfX = (localPos.x / 100) * naturalW;
    const pdfY = naturalH - (localPos.y / 100) * naturalH;
    
    const pt = viewport.convertToViewportPoint(pdfX, pdfY);
    sx = pt[0];
    sy = pt[1];
    
    scaledW = (localPos.w / 100) * naturalW * viewport.scale;
    scaledH = (localPos.h / 100) * naturalH * viewport.scale;
    rot = viewport.rotation;
  }

  const handles = [
    { id: 'nw', x: 0, y: 0, cursor: 'nwse-resize' },
    { id: 'ne', x: scaledW, y: 0, cursor: 'nesw-resize' },
    { id: 'sw', x: 0, y: scaledH, cursor: 'nesw-resize' },
    { id: 'se', x: scaledW, y: scaledH, cursor: 'nwse-resize' },
    { id: 'n', x: scaledW / 2, y: 0, cursor: 'ns-resize' },
    { id: 's', x: scaledW / 2, y: scaledH, cursor: 'ns-resize' },
    { id: 'w', x: 0, y: scaledH / 2, cursor: 'ew-resize' },
    { id: 'e', x: scaledW, y: scaledH / 2, cursor: 'ew-resize' },
  ];

  return (
    <g transform={`translate(${sx}, ${sy}) rotate(${rot})`}>
      <rect
        x={0} y={0} width={scaledW} height={scaledH}
        fill={ann.color}
        fillOpacity={1}
        stroke="black"
        strokeWidth={1}
        style={{ cursor: 'move', pointerEvents: 'auto' }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onClick={(e) => { e.stopPropagation(); setSelectedAnnotationId(ann.id); }}
        onDoubleClick={(e) => { e.stopPropagation(); setSelectedAnnotationId(ann.id); setIsEditing(true); }}
      />
      <foreignObject x={0} y={0} width={scaledW} height={scaledH} style={{ pointerEvents: 'none' }}>
        <textarea
          ref={textRef}
          value={ann.data || ''}
          onChange={(e) => {
            if (pageIndex !== undefined) {
              updateAnnotation(pageIndex, ann.id, { data: e.target.value });
            }
          }}
          onBlur={() => setIsEditing(false)}
          onClick={(e) => { e.stopPropagation(); setSelectedAnnotationId(ann.id); }}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            height: '100%',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            resize: 'none',
            padding: '4px',
            color: 'black',
            fontSize: '14px',
            pointerEvents: isEditing ? 'auto' : 'none',
            fontFamily: 'sans-serif',
            boxSizing: 'border-box',
          }}
          placeholder="Type comment..."
        />
      </foreignObject>
      {isSelected && (
        <>
          <g
             transform={`translate(${scaledW - 12}, -12)`}
             style={{ cursor: 'pointer', pointerEvents: 'auto' }}
             onMouseDown={(e) => { e.stopPropagation(); if (pageIndex !== undefined) { deleteAnnotation(pageIndex, ann.id); setSelectedAnnotationId(null); } }}
             onTouchStart={(e) => { e.stopPropagation(); if (pageIndex !== undefined) { deleteAnnotation(pageIndex, ann.id); setSelectedAnnotationId(null); } }}
          >
             <circle cx={12} cy={12} r={10} fill="#ef4444" stroke="white" strokeWidth={2} />
             <path d="M8 8 L16 16 M16 8 L8 16" stroke="white" strokeWidth={2} strokeLinecap="round" />
          </g>
          {handles.map(h => (
            <rect
              key={h.id}
              x={h.x - 4} y={h.y - 4}
              width={8} height={8}
              fill="white" stroke="#3b82f6" strokeWidth={1.5}
              style={{ cursor: h.cursor, pointerEvents: 'auto' }}
              onMouseDown={(e) => handleMouseDownResize(e, h.id)}
              onTouchStart={(e) => handleTouchStartResize(e, h.id)}
            />
          ))}
        </>
      )}
    </g>
  );
};

const AnnotationOverlay: React.FC<Props> = ({ annotations, width, height, viewport, pageIndex }) => {
  const svgRef = React.useRef<SVGSVGElement>(null);
  const [scaleFactor, setScaleFactor] = React.useState(1);

  React.useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !width) return;

    const updateScale = () => {
      const displayWidth = svg.clientWidth;
      if (displayWidth > 0) {
        setScaleFactor(displayWidth / width);
      }
    };

    updateScale();
    const observer = new ResizeObserver(() => {
      updateScale();
    });
    observer.observe(svg);

    window.addEventListener('resize', updateScale);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateScale);
    };
  }, [width]);

  const getScreenPoint = (p: { x: number; y: number }) => {
    if (!viewport) return { x: (p.x * width) / 100, y: (p.y * height) / 100 };
    const naturalW = viewport.viewBox[2];
    const naturalH = viewport.viewBox[3];
    const pdfX = (p.x / 100) * naturalW;
    const pdfY = naturalH - (p.y / 100) * naturalH;
    const [sx, sy] = viewport.convertToViewportPoint(pdfX, pdfY);
    return { x: sx, y: sy };
  };

  const getScaledPoints = (points: { x: number; y: number }[]) => {
    return points.map(p => {
      const sp = getScreenPoint(p);
      return `${sp.x},${sp.y}`;
    }).join(' ');
  };

  return (
    <svg
      ref={svgRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 10
      }}
      viewBox={`0 0 ${width} ${height}`}
    >
      {annotations.map((ann) => {
        if (ann.type === 'pen') {
          return (
            <polyline
              key={ann.id}
              points={getScaledPoints(ann.points)}
              fill="none"
              stroke={ann.color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ opacity: ann.opacity }}
            />
          );
        }
        
        if (ann.type === 'highlight') {
          return (
            <polyline
              key={ann.id}
              points={getScaledPoints(ann.points)}
              fill="none"
              stroke={ann.color}
              strokeWidth="12"
              strokeLinecap="butt"
              style={{ opacity: ann.opacity, mixBlendMode: 'multiply' }}
            />
          );
        }

        if (ann.type === 'comment') {
          return (
            <InteractiveComment
              key={ann.id}
              ann={ann}
              width={width}
              height={height}
              viewport={viewport}
              pageIndex={pageIndex}
              scaleFactor={scaleFactor}
            />
          );
        }

        if (ann.type === 'text') return null;

        if (ann.type === 'image') {
          return (
            <InteractiveImage 
              key={ann.id} 
              ann={ann} 
              width={width} 
              height={height} 
              viewport={viewport}
              pageIndex={pageIndex} 
              scaleFactor={scaleFactor}
            />
          );
        }

        return null;
      })}
    </svg>
  );
};

export default AnnotationOverlay;
