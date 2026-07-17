"use client";
import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { usePdfStore } from '@/store/pdfStore';
import { 
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus } from 'lucide-react';

interface SortableThumbnailProps {
  id: string;
  index: number;
  originalIndex: number;
  rotation: number;
  pdfProxy: pdfjsLib.PDFDocumentProxy | null;
  isActive: boolean;
  onClick: () => void;
}

const SortableThumbnail: React.FC<SortableThumbnailProps> = ({ 
  id, index, originalIndex, rotation, pdfProxy, isActive, onClick 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 2 : 1,
    opacity: isDragging ? 0.5 : 1,
  };

  const [isRendering, setIsRendering] = useState(false);

  useEffect(() => {
    if (pdfProxy) {
      triggerRender();
    }
    return () => {
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }
    };
  }, [pdfProxy, rotation, originalIndex]);

  const triggerRender = async () => {
    // Avoid double-rendering on the same canvas
    if (isRendering) {
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }
      return; 
    }
    await renderThumbnail();
  };

  const renderThumbnail = async () => {
    if (!canvasRef.current || !pdfProxy) return;

    setIsRendering(true);
    try {
      const page = await pdfProxy.getPage(originalIndex + 1);
      const viewport = page.getViewport({ scale: 0.2, rotation });
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (!context) return;

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      const renderTask = page.render({
        canvasContext: context,
        viewport: viewport,
        canvas: canvas,
      });

      renderTaskRef.current = renderTask;
      await renderTask.promise;
    } catch (error: any) {
      if (error.name === 'RenderingCancelledException') {
        // Safe to ignore
      } else {
        console.error('Thumbnail rendering error:', error);
      }
    } finally {
      setIsRendering(false);
      renderTaskRef.current = null;
    }
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style}
      className={`thumbnail-item ${isActive ? 'active' : ''}`}
      onClick={onClick}
      {...attributes}
      {...listeners}
    >
      <div className="thumbnail-drag-handle">
        <GripVertical size={14} />
      </div>
      <div className="thumbnail-preview">
        <canvas ref={canvasRef} />
      </div>
      <div className="thumbnail-label">{index + 1}</div>
      
    </div>
  );
};

interface ThumbnailSidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

const ThumbnailSidebar: React.FC<ThumbnailSidebarProps> = ({ isOpen, onClose }) => {
  const { pdfBytes, pages, currentPageIndex, setCurrentPage, reorderPages, addPages, pdfProxy } = usePdfStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleAddFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const bytes = new Uint8Array(await file.arrayBuffer());
      await addPages(bytes);
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      reorderPages(active.id as string, over.id as string);
    }
  };

  if (!pdfBytes) return null;

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div 
          className="sidebar-backdrop" 
          onClick={onClose}
        />
      )}
      <div className={`thumbnail-sidebar glass ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
        <span>Pages ({pages.length})</span>
      </div>
      <div className="sidebar-content">
        <DndContext 
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext 
            items={pages.map(p => p.id)}
            strategy={rectSortingStrategy}
          >
            {pages.map((page, index) => (
              <SortableThumbnail 
                key={page.id}
                id={page.id}
                index={index}
                originalIndex={page.originalIndex}
                rotation={page.rotation}
                pdfProxy={pdfProxy}
                isActive={currentPageIndex === index}
                onClick={() => setCurrentPage(index)}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>

    </div>
    </>
  );
};

export default ThumbnailSidebar;
