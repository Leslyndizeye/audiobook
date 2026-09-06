'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { type FC } from 'react';

interface GlassIconItem {
  id: string;
  icon: FC<{ size?: number; strokeWidth?: number }>;
  label: string;
}

interface Props {
  items: GlassIconItem[];
  active: string;
  onSelect: (id: string) => void;
}

export default function GlassIcons({ items, active, onSelect }: Props) {
  return (
    <nav
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        padding: '16px 10px',
        width: 68,
      }}
    >
      {items.map(({ id, icon: Icon, label }) => {
        const isActive = id === active;
        return (
          <div key={id} style={{ position: 'relative' }} className="group">
            <motion.button
              onClick={() => onSelect(id)}
              whileHover={{ scale: 1.1, y: -1 }}
              whileTap={{ scale: 0.9 }}
              style={{
                width: 46,
                height: 46,
                borderRadius: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                border: 'none',
                position: 'relative',
                overflow: 'hidden',
                background: isActive
                  ? 'rgba(18,78,102,0.4)'
                  : 'rgba(46,57,68,0.5)',
                boxShadow: isActive
                  ? '0 0 18px rgba(18,78,102,0.5), inset 0 1px 0 rgba(211,217,212,0.1)'
                  : 'inset 0 1px 0 rgba(211,217,212,0.06)',
                outline: `1px solid ${isActive ? 'rgba(18,78,102,0.6)' : 'rgba(211,217,212,0.07)'}`,
                transition: 'background 0.2s, box-shadow 0.2s, outline 0.2s',
              }}
              title={label}
            >
              {/* Glass shimmer overlay */}
              <div style={{
                position: 'absolute', inset: 0, borderRadius: 14,
                background: 'linear-gradient(135deg, rgba(255,255,255,0.07) 0%, transparent 60%)',
                pointerEvents: 'none',
              }} />

              <Icon size={18} strokeWidth={isActive ? 2 : 1.5} />

              {/* Active indicator dot */}
              <AnimatePresence>
                {isActive && (
                  <motion.div
                    key="dot"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    style={{
                      position: 'absolute',
                      bottom: 4,
                      width: 4, height: 4,
                      borderRadius: '50%',
                      background: '#D3D9D4',
                      boxShadow: '0 0 6px rgba(211,217,212,0.8)',
                    }}
                  />
                )}
              </AnimatePresence>
            </motion.button>

            {/* Tooltip */}
            <div
              className="pointer-events-none opacity-0 group-hover:opacity-100"
              style={{
                position: 'absolute',
                right: 'calc(100% + 10px)',
                top: '50%',
                transform: 'translateY(-50%)',
                whiteSpace: 'nowrap',
                padding: '4px 10px',
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 500,
                color: '#D3D9D4',
                background: 'rgba(33,42,49,0.95)',
                border: '1px solid rgba(116,141,146,0.2)',
                backdropFilter: 'blur(8px)',
                transition: 'opacity 0.15s ease',
                zIndex: 100,
              }}
            >
              {label}
            </div>
          </div>
        );
      })}
    </nav>
  );
}
