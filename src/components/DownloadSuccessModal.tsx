import React from 'react';
import { X, CheckCircle, MessageSquare } from 'lucide-react';

interface DownloadSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenFeedback: () => void;
}

export default function DownloadSuccessModal({ isOpen, onClose, onOpenFeedback }: DownloadSuccessModalProps) {
  if (!isOpen) return null;

  return (
    <div 
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9998,
        backdropFilter: 'blur(4px)'
      }}
    >
      <div 
        className="glass" 
        onClick={(e) => e.stopPropagation()}
        style={{ position: 'relative', maxWidth: '400px', width: '90%', padding: '40px 30px', textAlign: 'center', borderRadius: '16px' }}
      >
        <button 
          onClick={onClose}
          style={{ position: 'absolute', top: '15px', right: '15px', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
        >
          <X size={24} />
        </button>
        
        <CheckCircle size={64} style={{ color: '#10b981', margin: '0 auto 20px auto' }} />
        <h2 style={{ marginBottom: '15px', color: '#ffffff' }}>Download Complete!</h2>
        
        <p style={{ color: '#9ca3af', marginBottom: '25px', lineHeight: 1.5 }}>
          Your PDF has been successfully downloaded. If you faced any issues or have a feature request, please let us know!
        </p>

        <button 
          onClick={() => {
            onClose();
            onOpenFeedback();
          }}
          style={{ 
            width: '100%', 
            padding: '12px', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            gap: '8px', 
            color: '#ffffff',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            fontWeight: 600
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
        >
          <MessageSquare size={18} />
          Send Feedback
        </button>
      </div>
    </div>
  );
}
