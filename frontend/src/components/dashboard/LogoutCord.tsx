'use client';

import { useRef } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';

const CORD_LEN  = 22;  // resting cord length in px
const THRESHOLD = 52;  // slide distance to trigger logout

export default function LogoutCord() {
  const { dispatch } = useApp();
  const router = useRouter();
  const busy   = useRef(false);

  const x         = useMotionValue(0);
  const knobScale = useTransform(x, v => 1 + Math.min(Math.abs(v) / THRESHOLD, 1) * 1.2);

  const handleDragEnd = (_: unknown, info: { offset: { x: number } }) => {
    if (busy.current) return;
    if (Math.abs(info.offset.x) >= THRESHOLD) {
      busy.current = true;
      animate(x, 0, {
        type: 'spring', stiffness: 100, damping: 7, mass: 1,
        onComplete: () => {
          busy.current = false;
          dispatch({ type: 'LOGOUT' });
          router.replace('/');
        },
      });
    } else {
      animate(x, 0, { type: 'spring', stiffness: 350, damping: 20 });
    }
  };

  return (
    <div className="flex items-center select-none">
      {/* Left cord segment */}
      <div style={{
        width: CORD_LEN, height: 1.5, borderRadius: 1,
        background: 'rgba(116,141,146,0.28)',
      }} />

      {/* Draggable knob */}
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.55, right: 0.55 }}
        onDragEnd={handleDragEnd}
        style={{
          x, scale: knobScale,
          width: 8, height: 8,
          borderRadius: '50%',
          background: 'rgba(116,141,146,0.48)',
          border: '1px solid rgba(211,217,212,0.12)',
          cursor: 'grab',
          flexShrink: 0,
        }}
        whileDrag={{ cursor: 'grabbing' }}
      />

      {/* Right cord segment */}
      <div style={{
        width: CORD_LEN, height: 1.5, borderRadius: 1,
        background: 'rgba(116,141,146,0.28)',
      }} />
    </div>
  );
}
