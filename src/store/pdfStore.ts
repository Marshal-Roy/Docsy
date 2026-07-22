import { create } from 'zustand';
import { PDFDocument, degrees, StandardFonts } from 'pdf-lib';
import { saveDocument, loadDocument, clearDocument, PersistedDoc } from '@/lib/persistence';

export type AnnotationType = 'highlight' | 'pen' | 'comment' | 'text' | 'image';

export interface TextSegment {
  text: string;
  color?: string;
  fontWeight?: string;
  fontStyle?: string;
  fontFamily?: string;
  fontSize?: number;
}

export interface Annotation {
  id: string;
  type: AnnotationType;
  points: { x: number; y: number }[]; // Store as % (0-100)
  width?: number; // % width for rect/image
  height?: number; // % height for rect/image
  color: string;
  opacity: number;
  data?: string; // Text content or Image base64
  bgColor?: string; // The sampled background color for the text's white-out box
  fontSize?: number; // For text
  fontFamily?: string; // For text
  fontWeight?: string; // For text ('normal', 'bold', etc)
  fontStyle?: string; // For text ('normal', 'italic', etc)
  originalWidth?: number; // For text white-out
  segments?: TextSegment[]; // Per-word/selection formatting segments
  isCommitted?: boolean; // True if this annotation has been edited and canvas-painted by the user
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
  selectedAnnotationId: string | null;
  isScanned: boolean;
  isOcrRunning: boolean;
  isFromImage: boolean;

  // Actions
  setIsScanned: (isScanned: boolean) => void;
  runOcrOnPage: (pageIndex: number) => Promise<void>;
  setPdf: (bytes: Uint8Array, name: string, isFromImage?: boolean) => Promise<void>;
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
  setSelectedAnnotationId: (id: string | null) => void;
  resetPdf: () => void;
  rotatePage: (index: number, angle: number) => void;
  deletePage: (index: number) => void;
  reorderPages: (activeId: string, overId: string) => void;
  hydrate: () => Promise<boolean>;
  exportPdf: () => Promise<Uint8Array>;
  sortPagesByValue: (keyName: string, order: 'asc' | 'desc') => Promise<void>;
  pendingDelete: { type: 'page' | 'annotation', pageIndex: number, annotationId?: string, message?: string } | null;
  setPendingDelete: (pending: { type: 'page' | 'annotation', pageIndex: number, annotationId?: string, message?: string } | null) => void;
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
  selectedAnnotationId: null,
  pendingDelete: null,
  isScanned: false,
  isOcrRunning: false,
  isFromImage: false,

  setIsScanned: (isScanned) => set({ isScanned }),

  setPendingDelete: (pending) => set({ pendingDelete: pending }),

  setPdf: async (bytes: Uint8Array, name: string, isFromImage: boolean = false) => {
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
        pdfProxy: null,
        isScanned: false,
        isOcrRunning: false,
        isFromImage
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

  setSelectedAnnotationId: (id: string | null) => {
    set({ selectedAnnotationId: id });
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
      const importedDoc = await PDFDocument.load(bytes);
      const newPageCount = importedDoc.getPageCount();
      
      const finalPdfDoc = await PDFDocument.create();
      const existingIndices = pages.map(p => p.originalIndex);
      const copiedExisting = await finalPdfDoc.copyPages(pdfDoc, existingIndices);
      
      const newIndices = Array.from({ length: newPageCount }, (_, i) => i);
      const copiedNew = await finalPdfDoc.copyPages(importedDoc, newIndices);
      
      const idx = insertIndex !== undefined ? insertIndex : pages.length;
      
      const allCopied = [...copiedExisting];
      allCopied.splice(idx, 0, ...copiedNew);
      allCopied.forEach(page => finalPdfDoc.addPage(page));

      const addedPages: PageInfo[] = Array.from({ length: newPageCount }, () => ({
        id: `page-${crypto.randomUUID()}`,
        originalIndex: 0,
        rotation: 0,
        annotations: [],
      }));

      const newPagesState = [...pages];
      newPagesState.splice(idx, 0, ...addedPages);
      
      const syncedPages = newPagesState.map((p, i) => ({ ...p, originalIndex: i }));
      const newBytes = await finalPdfDoc.save();

      set({ 
        pdfBytes: newBytes,
        pages: syncedPages,
        pdfDoc: finalPdfDoc,
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
      const finalPdfDoc = await PDFDocument.create();
      const existingIndices = pages.map(p => p.originalIndex);
      const copiedExisting = await finalPdfDoc.copyPages(pdfDoc, existingIndices);
      
      const idx = insertIndex !== undefined ? insertIndex : pages.length;
      
      for(let i=0; i<idx; i++) finalPdfDoc.addPage(copiedExisting[i]);
      finalPdfDoc.addPage([595.28, 841.89]);
      for(let i=idx; i<copiedExisting.length; i++) finalPdfDoc.addPage(copiedExisting[i]);
      
      const addedPage: PageInfo = {
        id: `page-${crypto.randomUUID()}`,
        originalIndex: 0,
        rotation: 0,
        annotations: [],
      };

      const newPagesState = [...pages];
      newPagesState.splice(idx, 0, addedPage);
      
      const syncedPages = newPagesState.map((p, i) => ({ ...p, originalIndex: i }));
      const newBytes = await finalPdfDoc.save();

      set({ 
        pdfBytes: newBytes,
        pages: syncedPages,
        pdfDoc: finalPdfDoc,
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
      
      const finalPdfDoc = await PDFDocument.create();
      const existingIndices = pages.map(p => p.originalIndex);
      const copiedExisting = await finalPdfDoc.copyPages(pdfDoc, existingIndices);

      let embeddedImage;
      if (dataUrl.includes('image/png')) {
        embeddedImage = await finalPdfDoc.embedPng(imageBytes);
      } else {
        embeddedImage = await finalPdfDoc.embedJpg(imageBytes);
      }

      const { width, height } = embeddedImage.scale(1);
      const idx = insertIndex !== undefined ? insertIndex : pages.length;
      
      for(let i=0; i<idx; i++) finalPdfDoc.addPage(copiedExisting[i]);
      const newPage = finalPdfDoc.addPage([width, height]);
      newPage.drawImage(embeddedImage, { x: 0, y: 0, width, height });
      for(let i=idx; i<copiedExisting.length; i++) finalPdfDoc.addPage(copiedExisting[i]);

      const addedPage: PageInfo = {
        id: `page-${crypto.randomUUID()}`,
        originalIndex: 0,
        rotation: 0,
        annotations: [],
      };

      const newPagesState = [...pages];
      newPagesState.splice(idx, 0, addedPage);
      
      const syncedPages = newPagesState.map((p, i) => ({ ...p, originalIndex: i }));
      const newBytes = await finalPdfDoc.save();

      set({ 
        pdfBytes: newBytes,
        pages: syncedPages,
        pdfDoc: finalPdfDoc,
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
      const newPages = pages.filter((_, i) => i !== index);
      const newCurrentIndex = currentPageIndex >= newPages.length ? newPages.length - 1 : currentPageIndex;

      const finalPdfDoc = await PDFDocument.create();
      const indices = newPages.map(p => p.originalIndex);
      const copiedPages = await finalPdfDoc.copyPages(pdfDoc, indices);
      copiedPages.forEach(page => finalPdfDoc.addPage(page));

      const syncedPages = newPages.map((p, i) => ({
        ...p,
        originalIndex: i
      }));

      const newBytes = await finalPdfDoc.save();

      set({ 
        pages: syncedPages, 
        currentPageIndex: newCurrentIndex,
        pdfDoc: finalPdfDoc,
        pdfBytes: newBytes,
        pdfProxy: null
      });
      
      await saveDocument({
        bytes: newBytes,
        state: { pages: syncedPages, currentPageIndex: newCurrentIndex, fileName }
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

  runOcrOnPage: async (pageIndex: number) => {
    const { pdfProxy, pages, pdfBytes, fileName } = get();
    if (!pdfProxy || !pages[pageIndex]) return;

    set({ isOcrRunning: true });
    try {
      // 1. Render page to high-res canvas
      const pageInfo = pages[pageIndex];
      const page = await pdfProxy.getPage(pageInfo.originalIndex + 1);
      
      const scale = 2.5; // High scale for better OCR accuracy
      const viewport = page.getViewport({ scale, rotation: pageInfo.rotation });
      
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Could not get canvas context');
      
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      
      await page.render({
        canvasContext: context,
        viewport: viewport
      }).promise;

      // 2. Run Tesseract
      const Tesseract = await import('tesseract.js');
      const worker = await Tesseract.createWorker('eng');
      const { data } = await worker.recognize(canvas, {}, { blocks: true });
      await worker.terminate();

      // 3. Convert OCR results to Annotations
      // Natural viewport for calculating percentages
      const naturalVp = page.getViewport({ scale: 1, rotation: 0 });
      
      const newAnns: Annotation[] = [];
      
      const lines = [];
      if (data.blocks) {
        for (const block of data.blocks) {
          if (!block.paragraphs) continue;
          for (const para of block.paragraphs) {
            if (!para.lines) continue;
            for (const line of para.lines) {
              lines.push(line);
            }
          }
        }
      }
      
      lines.forEach(line => {
        if (!line.text.trim()) return;
        
        // Tesseract bbox is in the scaled canvas pixel space
        const { x0, y0, x1, y1 } = line.bbox;
        
        // Convert back to natural PDF space
        const pdfX = x0 / scale;
        const pdfY = y0 / scale;
        const pdfWidth = (x1 - x0) / scale;
        const pdfHeight = (y1 - y0) / scale;
        
        // Convert to percentage
        const percX = (pdfX / naturalVp.width) * 100;
        // Y coordinate in pdfStore annotations is measured from top-left, same as tesseract
        const percY = (pdfY / naturalVp.height) * 100;
        const percWidth = (pdfWidth / naturalVp.width) * 100;
        const percHeight = (pdfHeight / naturalVp.height) * 100;
        
        // Font size in PDF pts: use pdfHeight (the bounding box height in natural PDF units).
        // The rendering pipeline in TextLayerOverlay treats fontSize as PDF pts and multiplies
        // by viewport.scale to get screen px — so we store the raw pt value here.
        const fontSizePt = pdfHeight;
        
        newAnns.push({
          id: crypto.randomUUID(),
          type: 'text',
          points: [{ x: percX, y: percY }],
          width: percWidth,
          height: percHeight,
          originalWidth: percWidth,
          color: '#000000',
          opacity: 1,
          data: line.text.trim(),
          fontSize: fontSizePt,
          fontFamily: 'Arial, Helvetica, sans-serif'
        });
      });

      // 4. Update State
      const newPages = [...pages];
      newPages[pageIndex] = {
        ...newPages[pageIndex],
        annotations: [...newPages[pageIndex].annotations, ...newAnns]
      };

      set({ pages: newPages });
      if (pdfBytes) {
        saveDocument({
          bytes: pdfBytes,
          state: { pages: newPages, currentPageIndex: get().currentPageIndex, fileName }
        });
      }
      
    } catch (error) {
      console.error('OCR failed:', error);
    } finally {
      set({ isOcrRunning: false });
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

            // Helper to resolve StandardFont from family/weight/style
            const resolveFont = (fam: string, bold: boolean, italic: boolean) => {
              const famLower = fam.toLowerCase();
              if (famLower.includes('times') || (famLower.includes('serif') && !famLower.includes('sans'))) {
                if (bold && italic) return StandardFonts.TimesRomanBoldItalic;
                if (bold) return StandardFonts.TimesRomanBold;
                if (italic) return StandardFonts.TimesRomanItalic;
                return StandardFonts.TimesRoman;
              }
              if (famLower.includes('courier') || famLower.includes('mono')) {
                if (bold && italic) return StandardFonts.CourierBoldOblique;
                if (bold) return StandardFonts.CourierBold;
                if (italic) return StandardFonts.CourierOblique;
                return StandardFonts.Courier;
              }
              if (bold && italic) return StandardFonts.HelveticaBoldOblique;
              if (bold) return StandardFonts.HelveticaBold;
              if (italic) return StandardFonts.HelveticaOblique;
              return StandardFonts.Helvetica;
            };

            // Helper to parse color to RGB fractions
            const parseColorToRgb = (col: string) => {
              let r = 0, g = 0, b = 0;
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
              return { r, g, b };
            };

            // Tight white-out rectangle — slightly increased padding to prevent original text ghosting/overlap (which makes text look bolder)
            const paddingBottom = fontSize * 0.25; 
            const paddingTop = fontSize * 0.2; 
            const paddingX = fontSize * 0.1;

            page.drawRectangle({
              x:      annX - paddingX,
              y:      baselineY - paddingBottom, // bottom of rect
              width:  annW + paddingX * 2,
              height: annH + paddingTop + paddingBottom, // fully cover text ascenders/descenders
              color:  { type: 'RGB' as any, red: 1, green: 1, blue: 1 } as any,
            });

            // Render segments if available, otherwise fall back to single text
            const segments = ann.segments;
            if (segments && segments.length > 0) {
              let xOffset = annX;
              for (const seg of segments) {
                const segFam = seg.fontFamily || ann.fontFamily || '';
                const segBold = (seg.fontWeight || ann.fontWeight || 'normal') === 'bold';
                const segItalic = (seg.fontStyle || ann.fontStyle || 'normal') === 'italic';
                const segSize = Math.max(seg.fontSize || fontSize, 4);
                const segColor = seg.color || ann.color || '#000000';
                
                const fontEnum = resolveFont(segFam, segBold, segItalic);
                const embFont = await newPdfDoc.embedFont(fontEnum);
                const { r, g, b } = parseColorToRgb(segColor);

                page.drawText(seg.text, {
                  x: xOffset,
                  y: baselineY,
                  size: segSize,
                  font: embFont,
                  color: { type: 'RGB' as any, red: r, green: g, blue: b } as any,
                });

                // Advance x by segment text width
                xOffset += embFont.widthOfTextAtSize(seg.text, segSize);
              }
            } else {
              // Legacy single-text fallback
              const isBold = ann.fontWeight === 'bold';
              const isItalic = ann.fontStyle === 'italic';
              const fontEnum = resolveFont(ann.fontFamily || '', isBold, isItalic);
              const embeddedFont = await newPdfDoc.embedFont(fontEnum);
              const { r, g, b } = parseColorToRgb(ann.color || '');

              page.drawText(ann.data, {
                x:    annX,
                y:    baselineY,
                size: fontSize,
                font: embeddedFont,
                color: { type: 'RGB' as any, red: r, green: g, blue: b } as any,
              });
            }
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

  sortPagesByValue: async (keyName: string, order: 'asc' | 'desc') => {
    const { pages, pdfDoc, pdfBytes, pdfProxy, currentPageIndex, fileName } = get();
    if (!pdfDoc || !pdfProxy) return;

    set({ isProcessing: true });
    try {
      const pageValues = await Promise.all(pages.map(async (pageInfo, index) => {
        let combinedText = '';
        
        // 1. Text from annotations (OCR)
        const textAnns = pageInfo.annotations.filter(a => a.type === 'text' && a.data);
        const annText = textAnns.map(a => a.data).join(' ');
        combinedText += annText + ' ';

        // 2. Text from PDF native
        try {
          const page = await pdfProxy.getPage(pageInfo.originalIndex + 1);
          const textContent = await page.getTextContent();
          const nativeText = textContent.items.map((item: any) => item.str).join(' ');
          combinedText += nativeText;
        } catch (e) {
          console.warn('Could not extract native text for page', index, e);
        }

        // 3. Search for keyName
        const lowerKey = keyName.toLowerCase();
        const lowerCombined = combinedText.toLowerCase();
        const keyIndex = lowerCombined.indexOf(lowerKey);
        
        let parsedValue: number | string | null = null;
        let isNull = true;

        if (keyIndex !== -1) {
          // Extract the rest of the string after the key
          const substring = combinedText.substring(keyIndex + keyName.length).trim();
          
          // Let's refine rawValue to grab the immediate next "token" or "phrase". 
          const tokens = substring.split(/\s{2,}|\n/).map(s => s.trim()).filter(s => s);
          let rawValue = tokens.length > 0 ? tokens[0] : substring.trim();

          // Fallback if token is empty
          if (!rawValue) {
             rawValue = substring.substring(0, 100).trim();
          }

          if (rawValue) {
            isNull = false;
            
            // Try parsing as Date
            const parsedDate = Date.parse(rawValue);
            // Ensure it's a valid date and not just a small integer
            const isPureNumber = /^\$?-?[\d,]+(\.\d+)?$/.test(rawValue);
            
            if (!isNaN(parsedDate) && !isPureNumber && rawValue.length > 4) {
              parsedValue = parsedDate;
            } else {
              // Try parsing as number
              const cleanNumberStr = rawValue.replace(/[^0-9.-]+/g, '');
              const parsedFloat = parseFloat(cleanNumberStr);
              if (!isNaN(parsedFloat) && cleanNumberStr.length > 0) {
                parsedValue = parsedFloat;
              } else {
                // Fallback to string
                parsedValue = rawValue.toLowerCase();
              }
            }
          }
        }

        return { pageInfo, parsedValue, isNull };
      }));

      // 4. Sort
      pageValues.sort((a, b) => {
        if (a.isNull && b.isNull) return 0;
        if (a.isNull) return 1; // nulls always at the end
        if (b.isNull) return -1;

        if (typeof a.parsedValue === 'number' && typeof b.parsedValue === 'number') {
          return order === 'asc' ? a.parsedValue - b.parsedValue : b.parsedValue - a.parsedValue;
        }

        // String comparison
        const strA = String(a.parsedValue);
        const strB = String(b.parsedValue);
        
        return order === 'asc' ? strA.localeCompare(strB) : strB.localeCompare(strA);
      });

      const newPages = pageValues.map(pv => pv.pageInfo);

      // 5. Physical reorder: Recreate the document with the new order
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
        pdfProxy: null,
        currentPageIndex: 0 // Reset to first page after sort
      });

      await saveDocument({
        bytes: newBytes,
        state: { pages: syncedPages, currentPageIndex: 0, fileName }
      });
    } catch (error) {
      console.error('Error sorting pages:', error);
    } finally {
      set({ isProcessing: false });
    }
  },
}));
