"use client";
import React, { useRef, useState } from 'react';
import { UploadCloud, FileText, CheckCircle2 } from 'lucide-react';

interface DropzoneProps {
  onFileSelect: (file: File) => void;
}

const Dropzone: React.FC<DropzoneProps> = ({ onFileSelect }) => {
  const [isDragActive, setIsDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type === "application/pdf") {
        setSelectedFile(file);
        onFileSelect(file);
      } else {
        alert("Please upload a PDF file.");
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      onFileSelect(file);
    }
  };

  return (
    <div 
      className={`glass animate-fade-in ${isDragActive ? 'drag-active' : ''}`}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      style={{
        width: '100%',
        maxWidth: '700px',
        padding: '60px 40px',
        borderRadius: 'var(--radius-lg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '24px',
        cursor: 'pointer',
        textAlign: 'center',
        border: isDragActive ? '2px dashed var(--accent-primary)' : '1px solid var(--border-glass)',
        background: isDragActive ? 'rgba(59, 130, 246, 0.05)' : 'var(--bg-card)',
        transition: 'all 0.3s ease'
      }}
      onClick={() => fileInputRef.current?.click()}
    >
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
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
        {selectedFile ? <CheckCircle2 size={40} /> : <UploadCloud size={40} />}
      </div>
      
      <div>
        <h3 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '8px' }}>
          {selectedFile ? selectedFile.name : 'Click or Drop PDF to Edit'}
        </h3>
        <p style={{ color: 'var(--text-secondary)' }}>
          {selectedFile ? 'File ready for editing' : 'Maximum file size: 50MB'}
        </p>
      </div>

      {!selectedFile && (
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
          Select File
        </button>
      )}
    </div>
  );
};

export default Dropzone;
