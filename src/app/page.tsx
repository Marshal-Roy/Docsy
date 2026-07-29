"use client";
import React, { useState, useEffect, useRef } from 'react';
import { FileUp, Edit3, Layers, FileSearch, Zap, ArrowLeft, Minimize2, RefreshCw, FileDown, Check, FileText, Loader2, ArrowRight } from 'lucide-react';
import dynamic from 'next/dynamic';
import Dropzone from '@/components/Dropzone';
import FaqSection from '@/components/FaqSection';

import { usePdfStore } from '@/store/pdfStore';

const PdfViewer = dynamic(() => import('@/components/PdfViewer'), {
  ssr: false,
  loading: () => <div style={{ color: 'var(--text-secondary)', padding: '40px' }}>Loading PDF Engine...</div>
});

export default function Home() {
  const { setPdf, pdfBytes, fileName, hydrate, resetPdf } = usePdfStore();
  const [view, setView] = useState<'landing' | 'editor'>('landing');

  // Compression Mode States
  const [mode, setMode] = useState<'edit' | 'compress'>('edit');
  const [compressFile, setCompressFile] = useState<File | null>(null);
  const [compressionLevel, setCompressionLevel] = useState<'low' | 'medium' | 'high'>('medium');
  const [isCompressing, setIsCompressing] = useState(false);
  const [isDragActiveCompress, setIsDragActiveCompress] = useState(false);
  const [compressedResult, setCompressedResult] = useState<{
    bytes: Uint8Array;
    originalSize: number;
    compressedSize: number;
    fileName: string;
  } | null>(null);

  const fileInputCompressRef = useRef<HTMLInputElement>(null);

  // Handle hydration on mount
  useEffect(() => {
    const init = async () => {
      if (typeof window !== 'undefined' && window.location.hash.startsWith('#faq')) {
        setView('landing');
        return;
      }
      const hasData = await hydrate();
      if (hasData) {
        setView('editor');
        if (!window.location.search.includes('mode=editor')) {
          window.history.replaceState({ view: 'editor' }, '', '?mode=editor');
        }
      }
    };
    init();
  }, [hydrate]);

  // Handle browser back button and hash changes
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (e.state?.view) {
        setView(e.state.view);
      } else {
        setView('landing');
      }
    };
    const handleHashChange = () => {
      if (window.location.hash.startsWith('#faq')) {
        setView('landing');
      }
    };
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('hashchange', handleHashChange);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  const handleFilesSelect = async (selectedFiles: File[]) => {
    let bytes: Uint8Array;
    let name = selectedFiles[0].name;
    let isFromImage = false;
    
    if (selectedFiles.length === 1 && !selectedFiles[0].type.startsWith('image/')) {
      bytes = new Uint8Array(await selectedFiles[0].arrayBuffer());
    } else {
      const { PDFDocument } = await import('pdf-lib');
      const masterPdf = await PDFDocument.create();
      
      for (const file of selectedFiles) {
        if (file.type.startsWith('image/')) {
          isFromImage = true;
          const arrayBuffer = await file.arrayBuffer();
          let image;
          
          try {
            if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
              image = await masterPdf.embedJpg(arrayBuffer);
            } else if (file.type === 'image/png') {
              image = await masterPdf.embedPng(arrayBuffer);
            } else {
              console.warn('Skipping unsupported image format:', file.name);
              continue;
            }
            
            const { width, height } = image.scale(1);
            const page = masterPdf.addPage([width, height]);
            page.drawImage(image, { x: 0, y: 0, width, height });
          } catch (err) {
            console.error("Failed to convert image to PDF:", err);
          }
        } else if (file.type === 'application/pdf') {
          try {
            const arrayBuffer = await file.arrayBuffer();
            const sourcePdf = await PDFDocument.load(arrayBuffer);
            const copiedPages = await masterPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
            copiedPages.forEach((page) => {
              masterPdf.addPage(page);
            });
          } catch (err) {
            console.error("Failed to merge PDF:", err);
          }
        }
      }
      
      bytes = await masterPdf.save();
      
      if (selectedFiles.length === 1) {
        name = name.replace(/\.[^/.]+$/, "") + ".pdf";
      } else {
        name = `Merged_Document_${new Date().getTime()}.pdf`;
      }
    }

    await setPdf(bytes, name, isFromImage);
    setView('editor');
    window.history.pushState({ view: 'editor' }, '', '?mode=editor');
  };

  const handleBack = () => {
    resetPdf();
    setView('landing');
    window.history.pushState({ view: 'landing' }, '', '/');
  };

  // Compression helper formatting functions
  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const getEstimatedSize = (size: number, level: 'low' | 'medium' | 'high') => {
    const factors = { low: 0.8, medium: 0.6, high: 0.4 };
    return Math.round(size * factors[level]);
  };

  const handleDragCompress = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActiveCompress(true);
    } else {
      setIsDragActiveCompress(false);
    }
  };

  const handleDropCompress = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActiveCompress(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files).filter(f => f.type === "application/pdf");
      if (files.length > 0) {
        setCompressFile(files[0]);
        setCompressedResult(null);
      } else {
        alert("Please upload a PDF file only for compression.");
      }
    }
  };

  const handleFileChangeCompress = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files).filter(f => f.type === "application/pdf");
      if (files.length > 0) {
        setCompressFile(files[0]);
        setCompressedResult(null);
      } else {
        alert("Please select a PDF file.");
      }
    }
  };

  const handleCompress = async () => {
    if (!compressFile) return;
    setIsCompressing(true);
    try {
      const arrayBuffer = await compressFile.arrayBuffer();
      const { compressPdf } = await import('@/lib/compress');
      const result = await compressPdf(arrayBuffer, compressionLevel);

      setCompressedResult({
        bytes: result.bytes,
        originalSize: compressFile.size,
        compressedSize: result.actualSize,
        fileName: compressFile.name
      });

      // Auto trigger download
      triggerDownload(result.bytes, compressFile.name);
    } catch (err) {
      console.error(err);
      alert("Failed to compress PDF.");
    } finally {
      setIsCompressing(false);
    }
  };

  const triggerDownload = (bytes: Uint8Array, originalName: string) => {
    const blob = new Blob([bytes as any], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const dotIndex = originalName.lastIndexOf('.');
    const baseName = dotIndex !== -1 ? originalName.substring(0, dotIndex) : originalName;
    link.download = `${baseName}_compressed.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Delay revocation by 1 second to ensure mobile browsers (e.g., iOS Safari) have time to capture the download intent
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const tools = [
    { name: 'Edit PDF', icon: <Edit3 size={20} />, description: 'Edit text, images, and fonts directly.' },
    { name: 'Organize', icon: <Layers size={20} />, description: 'Merge, split, and reorder pages.' },
    { name: 'Convert', icon: <Zap size={20} />, description: 'PDF to Word, Excel, and more.' },
    { name: 'OCR', icon: <FileSearch size={20} />, description: 'Make scanned PDFs editable.' },
  ];

  if (view === 'editor' && pdfBytes) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div className="glass" style={{ 
          height: '56px', 
          display: 'flex', 
          alignItems: 'center', 
          padding: '0 20px', 
          gap: '20px',
          borderBottom: '1px solid var(--border-glass)'
        }}>
          <button 
            className="glass-interactive" 
            onClick={handleBack}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px', 
              padding: '6px 12px', 
              borderRadius: '6px',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              border: 'none',
              fontSize: '0.9rem'
            }}
          >
            <ArrowLeft size={16} /> Back
          </button>
          <div style={{ fontSize: '0.9rem', fontWeight: 500, opacity: 0.8 }}>
            Editing: <span style={{ color: 'var(--accent-primary)' }}>{fileName}</span>
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'hidden', minHeight: 0, display: 'flex', background: '#1e1e1e' }}>
          <PdfViewer />
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 20px', gap: '40px', overflowY: 'auto' }}>
      <section className="animate-fade-in" style={{ textAlign: 'center', maxWidth: '800px' }}>
        <h1 style={{ fontSize: '3.5rem', fontWeight: 700, marginBottom: '16px', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
          The Professional <br />
          <span style={{ color: 'var(--accent-primary)', textShadow: '0 0 40px rgba(59, 130, 246, 0.4)' }}>Docsy</span>
        </h1>
        <p style={{ fontSize: '1.25rem', color: 'var(--text-secondary)', marginBottom: '32px' }}>
          Edit, convert, and organize your PDFs with industry-standard accuracy. <br />
          No login. No catch. Just professional tools.
        </p>
      </section>

      {/* Mode Switcher Tabs */}
      <div className="glass" style={{
        display: 'flex',
        padding: '6px',
        borderRadius: '30px',
        gap: '4px',
        background: 'rgba(255, 255, 255, 0.02)',
        border: '1px solid var(--border-glass)',
        boxShadow: 'var(--shadow-premium)',
        zIndex: 10
      }}>
        <button
          onClick={() => { setMode('edit'); setCompressFile(null); setCompressedResult(null); }}
          style={{
            padding: '10px 28px',
            borderRadius: '24px',
            border: 'none',
            background: mode === 'edit' ? 'var(--accent-primary)' : 'transparent',
            color: mode === 'edit' ? 'white' : 'var(--text-secondary)',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: '0.95rem',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: mode === 'edit' ? '0 4px 12px rgba(59, 130, 246, 0.3)' : 'none'
          }}
        >
          Edit PDF
        </button>
        <button
          onClick={() => setMode('compress')}
          style={{
            padding: '10px 28px',
            borderRadius: '24px',
            border: 'none',
            background: mode === 'compress' ? 'var(--accent-primary)' : 'transparent',
            color: mode === 'compress' ? 'white' : 'var(--text-secondary)',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: '0.95rem',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: mode === 'compress' ? '0 4px 12px rgba(59, 130, 246, 0.3)' : 'none'
          }}
        >
          Compress PDF
        </button>
      </div>

      {mode === 'edit' ? (
        <Dropzone onFilesSelect={handleFilesSelect} />
      ) : (
        <div style={{ width: '100%', maxWidth: '700px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {!compressFile ? (
            <div 
              className={`glass animate-fade-in ${isDragActiveCompress ? 'drag-active' : ''}`}
              onDragEnter={handleDragCompress}
              onDragLeave={handleDragCompress}
              onDragOver={handleDragCompress}
              onDrop={handleDropCompress}
              style={{
                width: '100%',
                padding: '60px 40px',
                borderRadius: 'var(--radius-lg)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '24px',
                cursor: 'pointer',
                textAlign: 'center',
                border: isDragActiveCompress ? '2px dashed var(--accent-primary)' : '1px solid var(--border-glass)',
                background: isDragActiveCompress ? 'rgba(59, 130, 246, 0.05)' : 'var(--bg-card)',
                transition: 'all 0.3s ease'
              }}
              onClick={() => fileInputCompressRef.current?.click()}
            >
              <input 
                type="file" 
                ref={fileInputCompressRef} 
                onChange={handleFileChangeCompress} 
                accept="application/pdf" 
                style={{ display: 'none' }} 
              />
              
              <div style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                background: 'rgba(59, 130, 246, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-primary)',
                boxShadow: '0 0 20px rgba(59, 130, 246, 0.2)'
              }}>
                <Minimize2 size={40} />
              </div>
              
              <div>
                <h3 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '8px' }}>
                  Click or Drop PDF to Compress
                </h3>
                <p style={{ color: 'var(--text-secondary)' }}>
                  Reduce your file size while maintaining document quality. Supports PDF only.
                </p>
              </div>

              <button style={{
                padding: '12px 32px',
                background: 'var(--accent-primary)',
                color: 'white',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                fontWeight: 600,
                fontSize: '1rem',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                boxShadow: '0 4px 14px 0 rgba(59, 130, 246, 0.39)'
              }}>
                Select PDF
              </button>
            </div>
          ) : (
            <div className="glass animate-fade-in" style={{
              width: '100%',
              padding: '32px',
              borderRadius: 'var(--radius-lg)',
              display: 'flex',
              flexDirection: 'column',
              gap: '24px',
              border: '1px solid var(--border-glass)',
              background: 'var(--bg-card)'
            }}>
              {/* File Info */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', borderBottom: '1px solid var(--border-glass)', paddingBottom: '20px' }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '10px',
                  background: 'rgba(59, 130, 246, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--accent-primary)'
                }}>
                  <FileText size={24} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h4 style={{ fontSize: '1.1rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-primary)' }}>
                    {compressFile.name}
                  </h4>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Original Size: {formatBytes(compressFile.size)}
                  </p>
                </div>
                {!isCompressing && (
                  <button 
                    onClick={() => { setCompressFile(null); setCompressedResult(null); }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 8px',
                      borderRadius: '4px'
                    }}
                    className="glass-interactive"
                  >
                    <RefreshCw size={14} /> Change
                  </button>
                )}
              </div>

              {/* Compression Configuration */}
              {!compressedResult ? (
                <>
                  <div>
                    <h5 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '12px' }}>Choose Compression Level</h5>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {(['low', 'medium', 'high'] as const).map(lvl => (
                        <button
                          key={lvl}
                          onClick={() => setCompressionLevel(lvl)}
                          style={{
                            flex: 1,
                            padding: '12px 16px',
                            borderRadius: 'var(--radius-md)',
                            border: compressionLevel === lvl ? '2px solid var(--accent-primary)' : '1px solid var(--border-glass)',
                            background: compressionLevel === lvl ? 'rgba(59, 130, 246, 0.1)' : 'rgba(255,255,255,0.01)',
                            color: compressionLevel === lvl ? 'white' : 'var(--text-secondary)',
                            fontWeight: 600,
                            cursor: 'pointer',
                            textTransform: 'capitalize',
                            transition: 'all 0.2s',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                          className={compressionLevel !== lvl ? "glass-interactive" : ""}
                        >
                          <span>{lvl}</span>
                          <span style={{ fontSize: '0.75rem', fontWeight: 400, opacity: 0.8 }}>
                            {lvl === 'low' ? 'Best Quality' : lvl === 'medium' ? 'Balanced' : 'Smallest Size'}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Size Comparison Card */}
                  <div className="glass" style={{
                    padding: '20px',
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(255, 255, 255, 0.01)',
                    border: '1px solid var(--border-glass)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <div>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Current Size</p>
                      <p style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)' }}>{formatBytes(compressFile.size)}</p>
                    </div>
                    <ArrowRight size={24} style={{ color: 'var(--text-secondary)' }} />
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: '0.8rem', color: 'var(--accent-primary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Estimated Size</p>
                      <p style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--accent-primary)' }}>
                        {formatBytes(getEstimatedSize(compressFile.size, compressionLevel))}
                      </p>
                    </div>
                  </div>

                  {/* Submit Button */}
                  <button
                    onClick={handleCompress}
                    disabled={isCompressing}
                    style={{
                      width: '100%',
                      padding: '14px',
                      background: 'var(--accent-primary)',
                      color: 'white',
                      border: 'none',
                      borderRadius: 'var(--radius-md)',
                      fontWeight: 600,
                      fontSize: '1.1rem',
                      cursor: isCompressing ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '10px',
                      boxShadow: '0 4px 14px 0 rgba(59, 130, 246, 0.39)',
                      opacity: isCompressing ? 0.8 : 1,
                      transition: 'all 0.2s'
                    }}
                    className="glass-interactive"
                  >
                    {isCompressing ? (
                      <>
                        <Loader2 className="animate-spin" size={20} />
                        Compressing PDF...
                      </>
                    ) : (
                      <>
                        <Minimize2 size={20} />
                        Compress PDF
                      </>
                    )}
                  </button>
                </>
              ) : (
                /* Compression Success State */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center', textAlign: 'center', padding: '10px 0' }}>
                  <div style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    background: 'rgba(74, 222, 128, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#4ade80',
                    boxShadow: '0 0 20px rgba(74, 222, 128, 0.2)',
                    marginBottom: '8px'
                  }}>
                    <Check size={36} />
                  </div>
                  
                  <div>
                    <h5 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '6px' }}>PDF Successfully Compressed!</h5>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                      Your download should have started automatically.
                    </p>
                  </div>

                  {/* Size Comparison Details */}
                  <div className="glass" style={{
                    width: '100%',
                    padding: '20px',
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(255, 255, 255, 0.01)',
                    border: '1px solid var(--border-glass)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Original File Size</span>
                      <span style={{ fontWeight: 600 }}>{formatBytes(compressedResult.originalSize)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '12px' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Compressed File Size</span>
                      <span style={{ fontWeight: 600, color: '#4ade80' }}>{formatBytes(compressedResult.compressedSize)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem', fontWeight: 700 }}>
                      <span style={{ color: 'var(--text-primary)' }}>Total Space Saved</span>
                      <span style={{ color: 'var(--accent-secondary)' }}>
                        {Math.max(0, Math.round(((compressedResult.originalSize - compressedResult.compressedSize) / compressedResult.originalSize) * 100))}%
                        {' '} ({formatBytes(Math.max(0, compressedResult.originalSize - compressedResult.compressedSize))})
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '12px', width: '100%', marginTop: '10px' }}>
                    <button
                      onClick={() => { setCompressFile(null); setCompressedResult(null); }}
                      style={{
                        flex: 1,
                        padding: '12px',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-glass)',
                        background: 'transparent',
                        color: 'var(--text-primary)',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      className="glass-interactive"
                    >
                      Compress Another File
                    </button>
                    <button
                      onClick={() => triggerDownload(compressedResult.bytes, compressedResult.fileName)}
                      style={{
                        flex: 1,
                        padding: '12px',
                        borderRadius: 'var(--radius-md)',
                        border: 'none',
                        background: '#4ade80',
                        color: 'black',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        boxShadow: '0 4px 14px 0 rgba(74, 222, 128, 0.3)',
                        transition: 'all 0.2s'
                      }}
                    >
                      <FileDown size={18} />
                      Download Again
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <section aria-labelledby="features-heading" style={{
        width: '100%',
        maxWidth: '1000px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        marginTop: '40px'
      }}>
        <h2 id="features-heading" className="sr-only" style={{ position: 'absolute', width: '1px', height: '1px', padding: '0', margin: '-1px', overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', borderWidth: '0' }}>
          Free PDF Editor Features
        </h2>
        <div style={{
          width: '100%',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '20px',
        }}>
          {tools.map((tool, idx) => (
            <article key={idx} className="glass-interactive" style={{
              padding: '24px',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              <div style={{ color: 'var(--accent-primary)' }} aria-hidden="true">{tool.icon}</div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>{tool.name}</h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{tool.description}</p>
            </article>
          ))}
        </div>
      </section>

      <FaqSection />

      <footer style={{ marginTop: 'auto', paddingTop: '40px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
        © 2026 Docsy. Your privacy is our priority. No files are stored on our servers.
      </footer>
    </div>
  );
}
