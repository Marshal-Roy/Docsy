"use client";
import React, { useState, useEffect } from 'react';
import { ChevronDown, HelpCircle, FileSearch, ArrowUpDown, Minimize2, ShieldCheck, Edit3 } from 'lucide-react';

interface FaqItem {
  id: string;
  question: string;
  answer: React.ReactNode;
  icon: React.ReactNode;
}

const FaqSection: React.FC = () => {
  const [openId, setOpenId] = useState<string | null>(null);

  const faqs: FaqItem[] = [
    {
      id: 'faq-scanned',
      question: 'How do I edit a scanned PDF or image-only document?',
      icon: <FileSearch size={20} style={{ color: 'var(--accent-primary)' }} />,
      answer: (
        <span>
          When you upload a scanned PDF or image, Docsy automatically detects that the document lacks selectable text and prompts you to use our built-in Optical Character Recognition (OCR) engine. You can also click the <strong>&quot;OCR Page&quot;</strong> button in the toolbar at any time. Our client-side OCR scans the document, recognizes the characters, and converts them into editable text layers directly in your browser without sending any data to external servers.
        </span>
      )
    },
    {
      id: 'faq-sort',
      question: 'How does the Sort Pages by Value feature work?',
      icon: <ArrowUpDown size={20} style={{ color: 'var(--accent-primary)' }} />,
      answer: (
        <span>
          The <strong>Sort Pages</strong> tool allows you to automatically reorder all pages in your document based on a recurring numerical or textual identifier found on each page—such as a Date, Invoice Number, Salary, or Employee ID. When you click <em>Sort Pages</em> in the editor toolbar, enter the value prefix (for example, <code>Date:</code> or <code>Salary:</code>) and choose Ascending or Descending. Docsy will scan every page for that value and organize the document pages sequentially.
        </span>
      )
    },
    {
      id: 'faq-compress',
      question: 'How does PDF compression work in Docsy?',
      icon: <Minimize2 size={20} style={{ color: 'var(--accent-primary)' }} />,
      answer: (
        <span>
          Docsy uses a smart hybrid compression engine. When you upload a file in the <strong>Compress PDF</strong> tab, it first attempts intelligent downsampling and optimization of embedded JPEG images to reduce file size while preserving 100% of text selectability and vector typography. If further reduction is needed for heavy scanned documents, it automatically falls back to high-fidelity page rasterization to ensure the smallest possible file size.
        </span>
      )
    },
    {
      id: 'faq-privacy',
      question: 'Are my files uploaded to any cloud servers?',
      icon: <ShieldCheck size={20} style={{ color: 'var(--accent-primary)' }} />,
      answer: (
        <span>
          <strong>No, never.</strong> Your privacy and document security are our primary priorities. All PDF processing—including OCR text recognition, editing, page sorting, merging, compression, and exporting—is performed 100% locally inside your web browser using Web Workers and modern Web APIs. Your documents never leave your device.
        </span>
      )
    },
    {
      id: 'faq-features',
      question: 'Can I add images, annotations, or custom text to existing PDFs?',
      icon: <Edit3 size={20} style={{ color: 'var(--accent-primary)' }} />,
      answer: (
        <span>
          Yes! Once your document is open in the editor, use the top toolbar to insert new text blocks, embed images (such as logos or signatures), highlight existing text, draw freehand with the Pen tool, or attach sticky notes and comments.
        </span>
      )
    }
  ];

  // If URL hash points to a specific FAQ, open it and scroll
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash;
      if (hash && hash.startsWith('#faq-')) {
        const id = hash.replace('#', '');
        setOpenId(id);
        setTimeout(() => {
          const el = document.getElementById(id);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.style.borderColor = 'var(--accent-primary)';
            el.style.boxShadow = '0 0 25px rgba(59, 130, 246, 0.4)';
            setTimeout(() => {
              el.style.borderColor = 'var(--border-glass)';
              el.style.boxShadow = 'none';
            }, 3000);
          }
        }, 300);
      }
    };
    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const toggleFaq = (id: string) => {
    setOpenId(openId === id ? null : id);
  };

  return (
    <section aria-labelledby="faq-heading" style={{
      width: '100%',
      maxWidth: '900px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      marginTop: '60px',
      marginBottom: '20px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
        <HelpCircle size={28} style={{ color: 'var(--accent-primary)' }} />
        <h2 id="faq-heading" style={{ fontSize: '2.2rem', fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>
          Frequently Asked Questions
        </h2>
      </div>
      <p style={{ color: 'var(--text-secondary)', fontSize: '1.05rem', marginBottom: '32px', textAlign: 'center' }}>
        Everything you need to know about editing, sorting, and compressing your PDFs with Docsy.
      </p>

      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {faqs.map((faq) => {
          const isOpen = openId === faq.id;
          return (
            <div
              key={faq.id}
              id={faq.id}
              className="glass"
              style={{
                borderRadius: 'var(--radius-md)',
                border: isOpen ? '1px solid var(--accent-primary)' : '1px solid var(--border-glass)',
                background: isOpen ? 'rgba(59, 130, 246, 0.05)' : 'rgba(255, 255, 255, 0.01)',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                overflow: 'hidden'
              }}
            >
              <button
                onClick={() => toggleFaq(faq.id)}
                style={{
                  width: '100%',
                  padding: '20px 24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-primary)',
                  fontSize: '1.1rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textAlign: 'left',
                  gap: '16px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    {faq.icon}
                  </div>
                  <span>{faq.question}</span>
                </div>
                <div style={{
                  transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.3s ease',
                  color: isOpen ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center'
                }}>
                  <ChevronDown size={20} />
                </div>
              </button>

              {isOpen && (
                <div style={{
                  padding: '0 24px 24px 62px',
                  color: 'var(--text-secondary)',
                  fontSize: '0.98rem',
                  lineHeight: 1.6,
                  borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                  paddingTop: '16px'
                }}>
                  {faq.answer}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default FaqSection;
