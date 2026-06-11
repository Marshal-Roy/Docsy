"use client";
import React, { useState, useEffect } from 'react';
import { FileUp, Edit3, Layers, FileSearch, Zap, ArrowLeft } from 'lucide-react';
import dynamic from 'next/dynamic';
import Dropzone from '@/components/Dropzone';

import { usePdfStore } from '@/store/pdfStore';

const PdfViewer = dynamic(() => import('@/components/PdfViewer'), {
  ssr: false,
  loading: () => <div style={{ color: 'var(--text-secondary)', padding: '40px' }}>Loading PDF Engine...</div>
});

export default function Home() {
  const { setPdf, pdfBytes, fileName, hydrate, resetPdf } = usePdfStore();
  const [view, setView] = useState<'landing' | 'editor'>('landing');

  // Handle hydration on mount
  useEffect(() => {
    const init = async () => {
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

  // Handle browser back button
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (e.state?.view) {
        setView(e.state.view);
      } else {
        setView('landing');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleFileSelect = async (selectedFile: File) => {
    await setPdf(new Uint8Array(await selectedFile.arrayBuffer()), selectedFile.name);
    setView('editor');
    window.history.pushState({ view: 'editor' }, '', '?mode=editor');
  };

  const handleBack = () => {
    resetPdf();
    setView('landing');
    window.history.pushState({ view: 'landing' }, '', '/');
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

      <Dropzone onFileSelect={handleFileSelect} />

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

      <footer style={{ marginTop: 'auto', paddingTop: '40px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
        © 2026 Docsy. Your privacy is our priority. No files are stored on our servers.
      </footer>
    </div>
  );
}
