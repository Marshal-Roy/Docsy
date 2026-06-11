import { create } from 'zustand';
import { PDFDocument, degrees, StandardFonts } from 'pdf-lib';
import { saveDocument, loadDocument, clearDocument, PersistedDoc } from '@/lib/persistence';

export type AnnotationType = 'highlight' | 'pen' | 'comment' | 'text' | 'image';

export interface Annotation {
  id: string;
  type: AnnotationType;
  points: { x: number; y: number }[]; // Store as % (0-100)
  width?: number; // % width for rect/image
  height?: number; // % height for rect/image
  color: string;
  opacity: number;
  data?: string; // Text content or Image base64
  fontSize?: number; // For text
  fontFamily?: string; // For text
  fontWeight?: string; // For text ('normal', 'bold', etc)
  fontStyle?: string; // For text ('normal', 'italic', etc)
  originalWidth?: number; // For text white-out
}

interface PageInfo {
  id: string; // Unique ID for dnd-kit
  originalIndex: number;
  rotation: number;
  annotations: Annotation[];
}

export type EditTool = 'select' | 'highlight' | 'pen' | 'comment' | 'text' | 'image';

interface PdfState {
  pdfBytes: Uint8Array | null;
  pages: PageInfo[];
  currentPageIndex: number;
  fileName: string;
  pdfDoc: PDFDocument | null; // pdf-lib doc
  pdfProxy: any | null; // pdf.js proxy
  isProcessing: boolean;
  activeTool: EditTool;
  activeColor: string;

  // Actions
  setPdf: (bytes: Uint8Array, name: string) => Promise<void>;
  setPdfProxy: (proxy: any) => void;
  addPages: (bytes: Uint8Array, insertIndex?: number) => Promise<void>;
  addBlankPage: (insertIndex?: number) => Promise<void>;
  addImagePage: (dataUrl: string, insertIndex?: number) => Promise<void>;
  setCurrentPage: (index: number) => void;
  setTool: (tool: EditTool) => void;
  setColor: (color: string) => void;
  addAnnotation: (pageIndex: number, annotation: Omit<Annotation, 'id'>) => void;
  updateAnnotation: (pageIndex: number, annotationId: string, updates: Partial<Annotation>) => void;
  deleteAnnotation: (pageIndex: number, annotationId: string) => void;
  resetPdf: () => void;
  rotatePage: (index: number, angle: number) => void;
  deletePage: (index: number) => void;
  reorderPages: (activeId: string, overId: string) => void;
  hydrate: () => Promise<boolean>;
  exportPdf: () => Promise<Uint8Array>;
}

export const usePdfStore = create<PdfState>((set, get) => ({
  pdfBytes: null,
  pages: [],
  currentPageIndex: 0,
  fileName: '',
  pdfDoc: null,
  pdfProxy: null,
  isProcessing: false,
  activeTool: 'select',
  activeColor: '#fbbf24', // Default highlight yellow

  setPdf: async (bytes: Uint8Array, name: string) => {
    set({ isProcessing: true });
    try {
      const pdfDoc = await PDFDocument.load(bytes);
      const pageCount = pdfDoc.getPageCount();
      const initialPages: PageInfo[] = Array.from({ length: pageCount }, (_, i) => ({
        id: `page-${crypto.randomUUID()}`,
        originalIndex: i,
        rotation: 0,
        annotations: [],
      }));
      
      set({ 
        pdfBytes: bytes, 
        pdfDoc, 
        pages: initialPages, 
        currentPageIndex: 0,
        fileName: name,
        pdfProxy: null
      });

      await saveDocument({
        bytes,
        state: { pages: initialPages, currentPageIndex: 0, fileName: name }
      });
    } catch (error) {
      console.error('Error loading PDF:', error);
    } finally {
      set({ isProcessing: false });
    }
  },

  setPdfProxy: (proxy: any) => {
    set({ pdfProxy: proxy });
  },

  setTool: (tool: EditTool) => set({ activeTool: tool }),
  setColor: (color: string) => set({ activeColor: color }),

  addAnnotation: (pageIndex: number, annotation: Omit<Annotation, 'id'>) => {
    const { pages, pdfBytes, currentPageIndex, fileName } = get();
    const newPages = [...pages];
    const newAnnotation = { ...annotation, id: crypto.randomUUID() };
    
    newPages[pageIndex] = {
      ...newPages[pageIndex],
      annotations: [...newPages[pageIndex].annotations, newAnnotation],
    };

    set({ pages: newPages });
    
    if (pdfBytes) {
      saveDocument({
        bytes: pdfBytes,
        state: { pages: newPages, currentPageIndex, fileName }
      });
    }
  },

  updateAnnotation: (pageIndex: number, annotationId: string, updates: Partial<Annotation>) => {
    const { pages, pdfBytes, currentPageIndex, fileName } = get();
    const newPages = [...pages];
    newPages[pageIndex] = {
      ...newPages[pageIndex],
      annotations: newPages[pageIndex].annotations.map(a => 
        a.id === annotationId ? { ...a, ...updates } : a
      ),
    };

    set({ pages: newPages });
    
    if (pdfBytes) {
      saveDocument({
        bytes: pdfBytes,
        state: { pages: newPages, currentPageIndex, fileName }
      });
    }
  },

  deleteAnnotation: (pageIndex: number, annotationId: string) => {
    const { pages, pdfBytes, currentPageIndex, fileName } = get();
    const newPages = [...pages];
    newPages[pageIndex] = {
      ...newPages[pageIndex],
      annotations: newPages[pageIndex].annotations.filter(a => a.id !== annotationId),
    };

    set({ pages: newPages });
    
    if (pdfBytes) {
      saveDocument({
        bytes: pdfBytes,
        state: { pages: newPages, currentPageIndex, fileName }
      });
    }
  },

  resetPdf: () => {
    set({ 
      pdfBytes: null, 
      pages: [], 
      currentPageIndex: 0, 
      fileName: '',
      pdfDoc: null, 
      pdfProxy: null,
      activeTool: 'select'
    });
    clearDocument();
  },

  hydrate: async () => {
    const persisted = await loadDocument();
    if (!persisted) return false;

    set({ isProcessing: true });
    try {
      const pdfDoc = await PDFDocument.load(persisted.bytes);
      // Ensure backward compatibility: add empty annotations array to legacy pages
      const sanitizedPages = persisted.state.pages.map(p => ({
        ...p,
        annotations: p.annotations || []
      }));

      set({
        pdfBytes: persisted.bytes,
        pdfDoc,
        pages: sanitizedPages,
        currentPageIndex: persisted.state.currentPageIndex,
        fileName: persisted.state.fileName,
        pdfProxy: null
      });
      return true;
    } catch (err) {
      console.error('Hydration failed:', err);
      return false;
    } finally {
      set({ isProcessing: false });
    }
  },

  addPages: async (bytes: Uint8Array, insertIndex?: number) => {
    const { pdfDoc, pages, currentPageIndex, fileName } = get();
    if (!pdfDoc) return;

    set({ isProcessing: true });
    try {
      const newPdfDoc = await PDFDocument.load(bytes);
      const newPageCount = newPdfDoc.getPageCount();
      
      const copiedPages = await pdfDoc.copyPages(newPdfDoc, Array.from({ length: newPageCount }, (_, i) => i));
      
      const idx = insertIndex !== undefined ? insertIndex : pages.length;
      copiedPages.forEach((page, i) => pdfDoc.insertPage(idx + i, page));

      const addedPages: PageInfo[] = Array.from({ length: newPageCount }, (_, i) => ({
        id: `page-${crypto.randomUUID()}`,
        originalIndex: idx + i,
        rotation: 0,
        annotations: [],
      }));

      const newBytes = await pdfDoc.save();
      const newPagesState = [...pages];
      newPagesState.splice(idx, 0, ...addedPages);
      
      // Sync originalIndex
      const syncedPages = newPagesState.map((p, i) => ({ ...p, originalIndex: i }));

      set({ 
        pdfBytes: newBytes,
        pages: syncedPages,
        pdfProxy: null,
        currentPageIndex: idx
      });

      await saveDocument({
        bytes: newBytes,
        state: { pages: syncedPages, currentPageIndex: idx, fileName }
      });
    } catch (error) {
      console.error('Error adding pages:', error);
    } finally {
      set({ isProcessing: false });
    }
  },

  addBlankPage: async (insertIndex?: number) => {
    const { pdfDoc, pages, currentPageIndex, fileName } = get();
    if (!pdfDoc) return;

    set({ isProcessing: true });
    try {
      const idx = insertIndex !== undefined ? insertIndex : pages.length;
      pdfDoc.insertPage(idx, [595.28, 841.89]);
      
      const addedPage: PageInfo = {
        id: `page-${crypto.randomUUID()}`,
        originalIndex: idx,
        rotation: 0,
        annotations: [],
      };

      const newBytes = await pdfDoc.save();
      const newPagesState = [...pages];
      newPagesState.splice(idx, 0, addedPage);
      
      // Sync originalIndex
      const syncedPages = newPagesState.map((p, i) => ({ ...p, originalIndex: i }));

      set({ 
        pdfBytes: newBytes,
        pages: syncedPages,
        pdfProxy: null,
        currentPageIndex: idx
      });

      await saveDocument({
        bytes: newBytes,
        state: { pages: syncedPages, currentPageIndex: idx, fileName }
      });
    } catch (error) {
      console.error('Error adding blank page:', error);
    } finally {
      set({ isProcessing: false });
    }
  },

  addImagePage: async (dataUrl: string, insertIndex?: number) => {
    const { pdfDoc, pages, currentPageIndex, fileName } = get();
    if (!pdfDoc) return;

    set({ isProcessing: true });
    try {
      const base64Data = dataUrl.split(',')[1];
      const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
      
      let embeddedImage;
      if (dataUrl.includes('image/png')) {
        embeddedImage = await pdfDoc.embedPng(imageBytes);
      } else {
        embeddedImage = await pdfDoc.embedJpg(imageBytes);
      }

      const { width, height } = embeddedImage.scale(1);
      const idx = insertIndex !== undefined ? insertIndex : pages.length;
      const page = pdfDoc.insertPage(idx, [width, height]);
      page.drawImage(embeddedImage, {
        x: 0,
        y: 0,
        width,
        height,
      });

      const addedPage: PageInfo = {
        id: `page-${crypto.randomUUID()}`,
        originalIndex: idx,
        rotation: 0,
        annotations: [],
      };

      const newBytes = await pdfDoc.save();
      const newPagesState = [...pages];
      newPagesState.splice(idx, 0, addedPage);
      
      // Sync originalIndex
      const syncedPages = newPagesState.map((p, i) => ({ ...p, originalIndex: i }));

      set({ 
        pdfBytes: newBytes,
        pages: syncedPages,
        pdfProxy: null,
        currentPageIndex: idx
      });

      await saveDocument({
        bytes: newBytes,
        state: { pages: syncedPages, currentPageIndex: idx, fileName }
      });
    } catch (error) {
      console.error('Error adding image page:', error);
    } finally {
      set({ isProcessing: false });
    }
  },

  setCurrentPage: (index: number) => {
    const { pdfBytes, pages, fileName } = get();
    set({ currentPageIndex: index });
    if (pdfBytes) {
      saveDocument({
        bytes: pdfBytes,
        state: { pages, currentPageIndex: index, fileName }
      });
    }
  },

  rotatePage: (index: number, angle: number) => {
    const { pages, pdfBytes, currentPageIndex, fileName } = get();
    const newPages = [...pages];
    newPages[index] = {
      ...newPages[index],
      rotation: (newPages[index].rotation + angle) % 360,
    };
    set({ pages: newPages });
    if (pdfBytes) {
      saveDocument({
        bytes: pdfBytes,
        state: { pages: newPages, currentPageIndex, fileName }
      });
    }
  },

  deletePage: async (index: number) => {
    const { pages, currentPageIndex, pdfDoc, fileName } = get();
    if (pages.length <= 1 || !pdfDoc) return;

    set({ isProcessing: true });
    try {
      // Physically remove page from pdf-lib doc
      pdfDoc.removePage(index);
      
      const newPages = pages.filter((_, i) => i !== index).map((p, i) => ({
        ...p,
        originalIndex: i // Reset originalIndex to match new physical structure
      }));

      const newCurrentIndex = currentPageIndex >= newPages.length ? newPages.length - 1 : currentPageIndex;
      const newBytes = await pdfDoc.save();

      set({ 
        pages: newPages, 
        currentPageIndex: newCurrentIndex,
        pdfBytes: newBytes,
        pdfProxy: null // Force refresh
      });
      
      await saveDocument({
        bytes: newBytes,
        state: { pages: newPages, currentPageIndex: newCurrentIndex, fileName }
      });
    } catch (error) {
      console.error('Error deleting page:', error);
    } finally {
      set({ isProcessing: false });
    }
  },

  reorderPages: async (activeId: string, overId: string) => {
    const { pages, pdfDoc, pdfBytes, currentPageIndex, fileName } = get();
    if (!pdfDoc) return;

    const oldPos = pages.findIndex((p) => p.id === activeId);
    const newPos = pages.findIndex((p) => p.id === overId);

    if (oldPos !== -1 && newPos !== -1) {
      set({ isProcessing: true });
      try {
        const newPages = [...pages];
        const [removed] = newPages.splice(oldPos, 1);
        newPages.splice(newPos, 0, removed);

        // Physical reorder: Recreate the document with the new order
        const newPdfDoc = await PDFDocument.create();
        const indices = newPages.map(p => p.originalIndex);
        const copiedPages = await newPdfDoc.copyPages(pdfDoc, indices);
        copiedPages.forEach(page => newPdfDoc.addPage(page));

        const syncedPages = newPages.map((p, i) => ({
          ...p,
          originalIndex: i
        }));

        const newBytes = await newPdfDoc.save();

        set({ 
          pages: syncedPages, 
          pdfDoc: newPdfDoc,
          pdfBytes: newBytes,
          pdfProxy: null 
        });

        await saveDocument({
          bytes: newBytes,
          state: { pages: syncedPages, currentPageIndex, fileName }
        });
      } catch (error) {
        console.error('Error reordering pages:', error);
      } finally {
        set({ isProcessing: false });
      }
    }
  },

  exportPdf: async () => {
    const { pdfDoc, pages } = get();
    if (!pdfDoc) throw new Error('No PDF loaded');

    set({ isProcessing: true });
    try {
      const newPdfDoc = await PDFDocument.create();
      const indices = pages.map((p) => p.originalIndex);
      const copiedPages = await newPdfDoc.copyPages(pdfDoc, indices);

      for (let i = 0; i < copiedPages.length; i++) {
        const page = copiedPages[i];
        const pageInfo = pages[i];
        
        // Apply rotation
        page.setRotation(degrees(pageInfo.rotation));
        
        // Burn in annotations
        const { width, height } = page.getSize();
        
        for (const ann of pageInfo.annotations) {
          if (ann.type === 'pen' || ann.type === 'highlight') {
            const isHighlight = ann.type === 'highlight';
            
            // Draw segments
            for (let j = 0; j < ann.points.length - 1; j++) {
              const p1 = ann.points[j];
              const p2 = ann.points[j + 1];
              
              const x1 = (p1.x * width) / 100;
              const y1 = height - (p1.y * height) / 100; // Invert Y
              const x2 = (p2.x * width) / 100;
              const y2 = height - (p2.y * height) / 100; // Invert Y

              page.drawLine({
                start: { x: x1, y: y1 },
                end: { x: x2, y: y2 },
                thickness: isHighlight ? 12 : 2,
                color: {
                  type: 'RGB' as any,
                  red: parseInt(ann.color.slice(1, 3), 16) / 255,
                  green: parseInt(ann.color.slice(3, 5), 16) / 255,
                  blue: parseInt(ann.color.slice(5, 7), 16) / 255,
                } as any,
                opacity: ann.opacity,
              });
            }
          }
          
          if (ann.type === 'comment' && ann.points[0]) {
            const p = ann.points[0];
            const annX = (p.x * width) / 100;
            const annY = height - (p.y * height) / 100;
            const annW = (ann.width || 20) * width / 100;
            const annH = (ann.height || 10) * height / 100;

            const r = parseInt(ann.color.slice(1, 3), 16) / 255;
            const g = parseInt(ann.color.slice(3, 5), 16) / 255;
            const b = parseInt(ann.color.slice(5, 7), 16) / 255;

            page.drawRectangle({
              x: annX,
              y: annY - annH,
              width: annW,
              height: annH,
              color: { type: 'RGB' as any, red: r, green: g, blue: b } as any,
              opacity: 1,
              borderColor: { type: 'RGB' as any, red: r, green: g, blue: b } as any,
              borderWidth: 2,
            });

            if (ann.data) {
              const font = await newPdfDoc.embedFont(StandardFonts.Helvetica);
              const fontSize = 14;
              
              const lines = ann.data.split('\n');
              let currentY = annY - 18;
              for (const line of lines) {
                if (currentY < annY - annH) break; // Keep text inside box
                page.drawText(line, {
                  x: annX + 5,
                  y: currentY,
                  size: fontSize,
                  font: font,
                  color: { type: 'RGB' as any, red: 0, green: 0, blue: 0 } as any,
                });
                currentY -= (fontSize + 4);
              }
            }
          }

          if (ann.type === 'text' && ann.points[0] && ann.data) {
            const p = ann.points[0];
            const annX = (p.x / 100) * width;
            const annH = (ann.height || 0) * height / 100;
            const pdfTopY  = height - (p.y / 100) * height;
            // natY was stored as pdfBaselineY + item.height, so baseline is pdfTopY - annH
            const baselineY = pdfTopY - annH;
            
            const annW = Math.max(ann.width || 0, ann.originalWidth || 0) * width / 100;
            const fontSize  = Math.max(ann.fontSize || 12, 4);

            const isBold = ann.fontWeight === 'bold';
            const isItalic = ann.fontStyle === 'italic';
            let fontToUse = StandardFonts.Helvetica;
            const fam = (ann.fontFamily || '').toLowerCase();
            
            if (fam.includes('times') || (fam.includes('serif') && !fam.includes('sans'))) {
              if (isBold && isItalic) fontToUse = StandardFonts.TimesRomanBoldItalic;
              else if (isBold) fontToUse = StandardFonts.TimesRomanBold;
              else if (isItalic) fontToUse = StandardFonts.TimesRomanItalic;
              else fontToUse = StandardFonts.TimesRoman;
            } else if (fam.includes('courier') || fam.includes('mono')) {
              if (isBold && isItalic) fontToUse = StandardFonts.CourierBoldOblique;
              else if (isBold) fontToUse = StandardFonts.CourierBold;
              else if (isItalic) fontToUse = StandardFonts.CourierOblique;
              else fontToUse = StandardFonts.Courier;
            } else {
              if (isBold && isItalic) fontToUse = StandardFonts.HelveticaBoldOblique;
              else if (isBold) fontToUse = StandardFonts.HelveticaBold;
              else if (isItalic) fontToUse = StandardFonts.HelveticaOblique;
              else fontToUse = StandardFonts.Helvetica;
            }

            const embeddedFont = await newPdfDoc.embedFont(fontToUse);

            // Generous white-out rectangle to eliminate smudges (descenders, etc)
            const paddingY = fontSize * 0.25;
            const paddingX = fontSize * 0.1;

            page.drawRectangle({
              x:      annX - paddingX,
              y:      baselineY - paddingY, // extend below baseline for descenders
              width:  annW + paddingX * 2,
              height: annH + paddingY * 2,
              color:  { type: 'RGB' as any, red: 1, green: 1, blue: 1 } as any,
            });

            // Parse color string to RGB fractions
            let r = 0, g = 0, b = 0;
            const col = ann.color || '';
            if (col.startsWith('rgb(')) {
              const match = col.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
              if (match) {
                r = parseInt(match[1]) / 255;
                g = parseInt(match[2]) / 255;
                b = parseInt(match[3]) / 255;
              }
            } else if (col.startsWith('#')) {
              const hex = col.replace('#', '');
              if (hex.length >= 6) {
                r = parseInt(hex.substring(0, 2), 16) / 255;
                g = parseInt(hex.substring(2, 4), 16) / 255;
                b = parseInt(hex.substring(4, 6), 16) / 255;
              }
            }

            // Replacement text at exact baseline
            page.drawText(ann.data, {
              x:    annX,
              y:    baselineY,
              size: fontSize,
              font: embeddedFont,
              color: { type: 'RGB' as any, red: r, green: g, blue: b } as any,
            });
          }

          if (ann.type === 'image' && ann.points[0] && ann.data) {
            try {
              const p = ann.points[0];
              const annWidth = (ann.width || 20) * width / 100;
              const annHeight = (ann.height || 20) * height / 100;
              const annX = (p.x * width) / 100;
              const annY = height - (p.y * height) / 100 - annHeight;

              const base64Data = ann.data.split(',')[1];
              const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
              
              let embeddedImage;
              if (ann.data.includes('image/png')) {
                embeddedImage = await newPdfDoc.embedPng(imageBytes);
              } else {
                embeddedImage = await newPdfDoc.embedJpg(imageBytes);
              }

              page.drawImage(embeddedImage, {
                x: annX,
                y: annY,
                width: annWidth,
                height: annHeight,
              });
            } catch (err) {
              console.error('Error embedding image:', err);
            }
          }
        }
        
        newPdfDoc.addPage(page);
      }

      const savedBytes = await newPdfDoc.save();
      return savedBytes;
    } finally {
      set({ isProcessing: false });
    }
  },
}));
