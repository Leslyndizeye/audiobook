'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  disabled?: boolean;
  /** Open upward instead of downward (use when near bottom of screen) */
  dropUp?: boolean;
  placeholder?: string;
  className?: string;
  maxListHeight?: number;
}

export default function DropdownSelect({
  value, onChange, options, disabled, dropUp, placeholder, className, maxListHeight = 260,
}: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const currentLabel = options.find(o => o.value === value)?.label ?? placeholder ?? value;

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const toggle = () => { if (!disabled) setOpen(v => !v); };

  return (
    <div ref={containerRef} className={`relative ${className ?? ''}`}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={toggle}
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-all duration-150 select-none"
        style={{
          background: open ? 'rgba(18,78,102,0.25)' : 'rgba(46,57,68,0.8)',
          border: `1px solid ${open ? 'rgba(18,78,102,0.55)' : 'rgba(116,141,146,0.2)'}`,
          color: disabled ? '#748D92' : '#D3D9D4',
          cursor: disabled ? 'not-allowed' : 'pointer',
          minWidth: 60,
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate flex-1 text-left" style={{ maxWidth: 180 }}>{currentLabel}</span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
          style={{ display: 'flex', flexShrink: 0 }}
        >
          <ChevronDown size={11} style={{ color: '#748D92' }} />
        </motion.span>
      </button>

      {/* Dropdown panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="panel"
            role="listbox"
            initial={{ opacity: 0, scaleY: 0.82, y: dropUp ? 6 : -6 }}
            animate={{ opacity: 1, scaleY: 1,   y: 0 }}
            exit={{   opacity: 0, scaleY: 0.82, y: dropUp ? 6 : -6 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="absolute z-50 rounded-xl overflow-hidden"
            style={{
              transformOrigin: dropUp ? 'bottom center' : 'top center',
              ...(dropUp
                ? { bottom: 'calc(100% + 6px)', left: 0 }
                : { top:    'calc(100% + 6px)', left: 0 }),
              minWidth: '100%',
              background: 'rgba(30,40,48,0.97)',
              border: '1px solid rgba(116,141,146,0.18)',
              boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
              overflowY: 'auto',
              maxHeight: maxListHeight,
            }}
          >
            {options.map((opt, i) => {
              const selected = opt.value === value;
              return (
                <motion.button
                  key={opt.value}
                  role="option"
                  aria-selected={selected}
                  type="button"
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1,  x:  0 }}
                  transition={{ delay: i * 0.025, duration: 0.12 }}
                  onClick={() => { onChange(opt.value); setOpen(false); }}
                  className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors duration-100"
                  style={{
                    background: selected ? 'rgba(18,78,102,0.3)' : 'transparent',
                    color: selected ? '#D3D9D4' : '#748D92',
                    borderBottom: i < options.length - 1 ? '1px solid rgba(116,141,146,0.07)' : 'none',
                  }}
                  onMouseEnter={e => {
                    if (!selected) e.currentTarget.style.background = 'rgba(18,78,102,0.15)';
                    e.currentTarget.style.color = '#D3D9D4';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = selected ? 'rgba(18,78,102,0.3)' : 'transparent';
                    e.currentTarget.style.color = selected ? '#D3D9D4' : '#748D92';
                  }}
                >
                  {selected
                    ? <Check size={10} style={{ color: '#124E66', flexShrink: 0 }} />
                    : <span style={{ width: 10, flexShrink: 0 }} />}
                  {opt.label}
                </motion.button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
