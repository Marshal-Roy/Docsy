"use client";
import React, { useState } from 'react';
import { usePdfStore } from '@/store/pdfStore';
import { X, ArrowDownAZ, ArrowDownZA, Loader2 } from 'lucide-react';

interface SortPagesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SortPagesModal: React.FC<SortPagesModalProps> = ({ isOpen, onClose }) => {
  const [keyName, setKeyName] = useState('');
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
  const { sortPagesByValue, isProcessing } = usePdfStore();

  if (!isOpen) return null;

  const handleSort = async () => {
    if (!keyName.trim()) return;
    await sortPagesByValue(keyName, order);
    onClose();
  };

  return (
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#111' }}>Sort Pages by Value</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#666' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: '#444', fontWeight: 500 }}>
            Value Name (e.g. "Date:", "Salary:")
          </label>
          <input
            type="text"
            value={keyName}
            onChange={(e) => setKeyName(e.target.value)}
            placeholder="Enter key to search for..."
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '8px',
              border: '1px solid #ccc',
              fontSize: '1rem',
              boxSizing: 'border-box'
            }}
            autoFocus
          />
        </div>

        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: '#444', fontWeight: 500 }}>
            Sort Order
          </label>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={() => setOrder('asc')}
              style={{
                flex: 1,
                padding: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                borderRadius: '8px',
                border: order === 'asc' ? '2px solid var(--accent-primary)' : '1px solid #ccc',
                background: order === 'asc' ? 'rgba(59, 130, 246, 0.1)' : 'white',
                color: order === 'asc' ? 'var(--accent-primary)' : '#444',
                cursor: 'pointer',
                fontWeight: order === 'asc' ? 600 : 400
              }}
            >
              <ArrowDownAZ size={18} /> Ascending
            </button>
            <button
              onClick={() => setOrder('desc')}
              style={{
                flex: 1,
                padding: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                borderRadius: '8px',
                border: order === 'desc' ? '2px solid var(--accent-primary)' : '1px solid #ccc',
                background: order === 'desc' ? 'rgba(59, 130, 246, 0.1)' : 'white',
                color: order === 'desc' ? 'var(--accent-primary)' : '#444',
                cursor: 'pointer',
                fontWeight: order === 'desc' ? 600 : 400
              }}
            >
              <ArrowDownZA size={18} /> Descending
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button 
            className="glass-interactive"
            onClick={onClose}
            style={{ padding: '10px 16px', borderRadius: '8px', border: '1px solid #ccc', background: 'transparent', cursor: 'pointer', fontWeight: 500 }}
          >
            Cancel
          </button>
          <button 
            className="glass-interactive shadow-accent"
            onClick={handleSort}
            disabled={!keyName.trim() || isProcessing}
            style={{ 
              padding: '10px 20px', 
              borderRadius: '8px', 
              border: 'none', 
              background: 'var(--accent-primary)', 
              color: 'white', 
              cursor: (!keyName.trim() || isProcessing) ? 'not-allowed' : 'pointer',
              fontWeight: 600,
              opacity: (!keyName.trim() || isProcessing) ? 0.7 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            {isProcessing ? <Loader2 size={18} className="animate-spin" /> : null}
            Sort Pages
          </button>
        </div>
      </div>
    </div>
  );
};

export default SortPagesModal;
