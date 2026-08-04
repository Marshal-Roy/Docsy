import React, { useState } from 'react';
import { X, Send, CheckCircle2, MessageSquare, AlertCircle } from 'lucide-react';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function FeedbackModal({ isOpen, onClose }: FeedbackModalProps) {
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [type, setType] = useState('Issue');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    setStatus('loading');
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, email, type })
      });

      if (res.ok) {
        setStatus('success');
        setTimeout(() => {
          onClose();
          // Reset form after a delay so they see the success message first
          setTimeout(() => {
            setMessage('');
            setEmail('');
            setType('Issue');
            setStatus('idle');
          }, 300);
        }, 2000);
      } else {
        setStatus('error');
      }
    } catch (err) {
      setStatus('error');
    }
  };

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
        zIndex: 9999,
        backdropFilter: 'blur(4px)'
      }}
    >
      <div 
        className="glass" 
        onClick={(e) => e.stopPropagation()}
        style={{ position: 'relative', maxWidth: '500px', width: '90%', padding: '30px', borderRadius: '16px' }}
      >
        <button 
          onClick={onClose} 
          disabled={status === 'loading'}
          style={{ position: 'absolute', top: '15px', right: '15px', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
        >
          <X size={24} />
        </button>
        
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', color: '#ffffff' }}>
          <MessageSquare size={24} className="text-primary" />
          Send Feedback
        </h2>

        {status === 'success' ? (
          <div style={{ textAlign: 'center', padding: '40px 0', animation: 'fadeIn 0.5s ease' }}>
            <CheckCircle2 size={64} style={{ color: '#10b981', margin: '0 auto 20px auto' }} />
            <h3 style={{ marginBottom: '10px', color: '#ffffff' }}>Thank You!</h3>
            <p style={{ color: '#9ca3af' }}>Your feedback has been sent successfully. We appreciate your input!</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: '#e5e7eb' }}>Feedback Type</label>
              <div style={{ display: 'flex', gap: '10px' }}>
                {['Issue', 'Missing Feature', 'Other'].map(t => (
                  <button
                    key={t}
                    type="button"
                    style={{ 
                      flex: 1, 
                      padding: '8px 10px', 
                      fontSize: '0.85rem', 
                      color: type === t ? '#ffffff' : '#9ca3af',
                      background: type === t ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.05)',
                      border: type === t ? 'none' : '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                    onClick={() => setType(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: '#e5e7eb' }}>
                Message <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Tell us what went wrong, what's missing, or how we can improve..."
                required
                style={{
                  width: '100%',
                  minHeight: '120px',
                  padding: '12px',
                  borderRadius: '12px',
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: 'rgba(255, 255, 255, 0.05)',
                  color: '#ffffff',
                  resize: 'vertical',
                  fontSize: '0.95rem'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: '#e5e7eb' }}>
                Email (Optional)
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="For us to reply to your feedback"
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '12px',
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: 'rgba(255, 255, 255, 0.05)',
                  color: '#ffffff',
                  fontSize: '0.95rem'
                }}
              />
            </div>

            {status === 'error' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444', fontSize: '0.9rem', background: 'rgba(239, 68, 68, 0.1)', padding: '12px', borderRadius: '8px' }}>
                <AlertCircle size={18} />
                Failed to send feedback. Please try again later.
              </div>
            )}

            <button 
              type="submit" 
              disabled={status === 'loading' || !message.trim()}
              style={{ 
                padding: '14px', 
                fontSize: '1rem', 
                marginTop: '10px', 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center',
                gap: '10px', 
                color: '#ffffff',
                background: 'var(--accent-primary)',
                border: 'none',
                borderRadius: '8px',
                cursor: (status === 'loading' || !message.trim()) ? 'not-allowed' : 'pointer',
                opacity: (status === 'loading' || !message.trim()) ? 0.6 : 1,
                fontWeight: 600
              }}
            >
              {status === 'loading' ? (
                <>Sending...</>
              ) : (
                <>
                  <Send size={18} /> Send Feedback
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
