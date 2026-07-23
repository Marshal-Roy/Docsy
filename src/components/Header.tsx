"use client";
import React from 'react';
import { usePdfStore } from '@/store/pdfStore';

const Header: React.FC = () => {
  const { resetPdf } = usePdfStore();

  const handleLogoClick = () => {
    resetPdf();
    window.location.href = '/';
  };

  return (
    <header className="header glass">
      <div 
        className="logo" 
        onClick={handleLogoClick}
        style={{ fontWeight: 700, fontSize: '1.2rem', display: 'flex', alignItems: 'center', cursor: 'pointer' }}
      >
        <span><span style={{ color: 'var(--accent-primary)' }}>Doc</span>sy</span>
      </div>
    </header>
  );
};

export default Header;
