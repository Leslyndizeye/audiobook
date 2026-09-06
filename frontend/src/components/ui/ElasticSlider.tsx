'use client';

import { useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  formatValue?: (v: number) => string;
  leftLabel?: string;
  rightLabel?: string;
}

export default function ElasticSlider({
  label, value, min, max, step,
  onChange, formatValue, leftLabel, rightLabel,
}: Props) {
  const trackRef  = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [overshoot, setOvershoot] = useState(0); // elastic bounce offset px

  const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));

  const clampSnap = useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track) return;
    const { left, width } = track.getBoundingClientRect();
    const ratio   = Math.min(1, Math.max(0, (clientX - left) / width));
    const raw     = min + ratio * (max - min);
    const snapped = Math.round(raw / step) * step;
    return Math.min(max, Math.max(min, parseFloat(snapped.toFixed(10))));
  }, [min, max, step]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    const val = clampSnap(e.clientX);
    if (val !== undefined) onChange(val);

    const onMove = (ev: MouseEvent) => {
      const v = clampSnap(ev.clientX);
      if (v !== undefined) onChange(v);
      // elastic feel: overshoot at edges
      const track = trackRef.current;
      if (track) {
        const { left, right } = track.getBoundingClientRect();
        if (ev.clientX < left)       setOvershoot(ev.clientX - left);
        else if (ev.clientX > right) setOvershoot(ev.clientX - right);
        else                         setOvershoot(0);
      }
    };
    const onUp = () => {
      setDragging(false);
      setOvershoot(0);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [clampSnap, onChange]);

  const display = formatValue ? formatValue(value) : String(value);

  return (
    <div className="flex flex-col gap-2 w-full select-none">
      {/* Label row */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest font-medium"
          style={{ color: '#748D92' }}>
          {label}
        </span>
        <motion.span
          key={display}
          initial={{ scale: 0.85, opacity: 0.6 }}
          animate={{ scale: 1,    opacity: 1 }}
          className="text-[11px] font-semibold tabular-nums"
          style={{ color: '#D3D9D4' }}
        >
          {display}
        </motion.span>
      </div>

      {/* Track */}
      <div
        ref={trackRef}
        onMouseDown={onMouseDown}
        style={{
          height: 5,
          borderRadius: 999,
          background: 'rgba(116,141,146,0.18)',
          position: 'relative',
          cursor: 'pointer',
        }}
      >
        {/* Filled portion */}
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${pct}%`,
          borderRadius: 999,
          background: 'linear-gradient(90deg, #124E66, #748D92)',
          transition: dragging ? 'none' : 'width 0.1s ease',
        }} />

        {/* Thumb */}
        <motion.div
          style={{
            position: 'absolute',
            top: '50%',
            left: `${pct}%`,
            x: `calc(-50% + ${Math.max(-12, Math.min(12, overshoot * 0.3))}px)`,
            y: '-50%',
          }}
          animate={{
            scale: dragging ? 1.3 : 1,
            width: dragging ? 20 : 16,
            height: dragging ? 20 : 16,
          }}
          transition={{ type: 'spring', stiffness: 500, damping: 30, mass: 0.5 }}
        >
          <div style={{
            width: '100%', height: '100%',
            borderRadius: '50%',
            background: dragging
              ? 'radial-gradient(circle at 35% 35%, #D3D9D4, #124E66)'
              : 'radial-gradient(circle at 35% 35%, #748D92, #124E66)',
            border: '2px solid rgba(211,217,212,0.6)',
            boxShadow: dragging
              ? '0 0 14px rgba(18,78,102,0.9), 0 0 4px rgba(211,217,212,0.5)'
              : '0 0 6px rgba(18,78,102,0.5)',
          }} />
        </motion.div>
      </div>

      {/* End labels */}
      {(leftLabel || rightLabel) && (
        <div className="flex justify-between">
          <span className="text-[9px]" style={{ color: 'rgba(116,141,146,0.6)' }}>{leftLabel}</span>
          <span className="text-[9px]" style={{ color: 'rgba(116,141,146,0.6)' }}>{rightLabel}</span>
        </div>
      )}
    </div>
  );
}
