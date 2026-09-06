'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import InfiniteMenu, { type MenuItem } from '@/components/ui/InfiniteMenu';

const MENU_ITEMS: MenuItem[] = [
  { image: 'https://picsum.photos/300/300?grayscale', link: '#', title: 'Classic',    description: 'Timeless literature'  },
  { image: 'https://picsum.photos/400/400?grayscale', link: '#', title: 'Modern',     description: 'Contemporary voices'  },
  { image: 'https://picsum.photos/500/500?grayscale', link: '#', title: 'Poetry',     description: 'Words in rhythm'      },
  { image: 'https://picsum.photos/600/600?grayscale', link: '#', title: 'Philosophy', description: 'Deep thoughts'        },
];

const REQUIRED_CLICKS = 4;

interface Props { onUnlock: () => void }

interface Particle {
  x: number; y: number; vx: number; vy: number;
  size: number; opacity: number; color: string; burst: boolean;
}

function mkAmbient(w: number, h: number): Particle {
  return {
    x: Math.random() * w, y: h + Math.random() * h,
    vx: (Math.random() - .5) * .4, vy: -(Math.random() * .6 + .2),
    size: Math.random() * 2 + .3, opacity: Math.random() * .5 + .1,
    color: Math.random() > .4 ? '#124E66' : '#748D92', burst: false,
  };
}

export default function IntroGate({ onUnlock }: Props) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef       = useRef<number>(0);
  const unlockingRef = useRef(false);

  type Phase = 'menu' | 'enter' | 'done';
  const [phase, setPhase]       = useState<Phase>('menu');
  const [clicks, setClicks]     = useState(0);
  const [input, setInput]       = useState('');
  const [shake, setShake]       = useState(false);

  const triggerUnlock = useCallback(() => {
    if (unlockingRef.current) return;
    unlockingRef.current = true;
    setPhase('done');
    onUnlock();
  }, [onUnlock]);

  // ── Canvas ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx    = canvas.getContext('2d')!;
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize(); window.addEventListener('resize', resize);
    for (let i = 0; i < 180; i++) particlesRef.current.push(mkAmbient(canvas.width, canvas.height));

    const tick = () => {
      const { width: W, height: H } = canvas;
      ctx.clearRect(0, 0, W, H);
      const bg = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, W*.8);
      bg.addColorStop(0, 'rgba(33,42,49,1)'); bg.addColorStop(.5, 'rgba(20,28,35,1)'); bg.addColorStop(1, 'rgba(15,20,25,1)');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

      ctx.strokeStyle = 'rgba(18,78,102,0.06)'; ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 80) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y < H; y += 80) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

      particlesRef.current = particlesRef.current.filter(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.burst) { p.vx *= .96; p.vy *= .96; p.opacity -= .018; if (p.opacity <= 0) return false; }
        else if (p.y < -10) Object.assign(p, mkAmbient(W, H), { y: H + 10 });
        ctx.save(); ctx.globalAlpha = Math.max(0, p.opacity);
        ctx.shadowBlur = 10; ctx.shadowColor = p.color; ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        return true;
      });
      if (particlesRef.current.filter(p => !p.burst).length < 180)
        particlesRef.current.push(mkAmbient(W, H));

      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener('resize', resize); };
  }, []);

  // ── Menu click ───────────────────────────────────────────────────────────────

  const handleSelect = (_item: MenuItem) => {
    setClicks(c => {
      const next = c + 1;
      if (next >= REQUIRED_CLICKS) setTimeout(() => setPhase('enter'), 400);
      return next;
    });
  };

  // ── Text submit ──────────────────────────────────────────────────────────────

  const handleSubmit = () => {
    if (input.toLowerCase().replace(/[^a-z\s]/g, '').trim() === 'jesus is the king') {
      triggerUnlock();
    } else {
      setShake(true);
      setInput('');
      setTimeout(() => setShake(false), 600);
    }
  };

  if (phase === 'done') return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      <AnimatePresence mode="wait">

        {/* ── Phase 1: 3-D menu ── */}
        {phase === 'menu' && (
          <motion.div
            key="menu"
            className="absolute inset-0 flex flex-col"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.04 }}
            transition={{ duration: .6 }}
          >

            <div className="flex-1 relative" style={{ minHeight: 0 }}>
              <InfiniteMenu items={MENU_ITEMS} scale={0.8} onSelect={handleSelect} />
            </div>

          </motion.div>
        )}

        {/* ── Phase 2: password entry ── */}
        {phase === 'enter' && (
          <motion.div
            key="enter"
            className="absolute inset-0 flex items-center justify-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: .6, ease: 'easeOut' }}
          >
            <div className="relative z-10 flex flex-col items-center gap-8 px-6 text-center max-w-sm w-full">
              <div className="flex flex-col items-center gap-2">
                <h1 className="text-3xl font-bold tracking-[.2em]"
                  style={{ fontFamily: 'Cinzel, serif', color: '#D3D9D4' }}>
                  LESLY
                </h1>
                <div className="h-px w-32" style={{ background: 'linear-gradient(90deg, transparent, #124E66, transparent)' }} />
              </div>

              <motion.div
                animate={shake ? { x: [-8, 8, -6, 6, -4, 4, 0] } : {}}
                transition={{ duration: 0.5 }}
                className="w-full flex flex-col gap-3"
              >
                <div className="px-5 py-3 rounded-2xl text-center"
                  style={{ background: 'rgba(18,78,102,0.12)', border: '1px solid rgba(18,78,102,0.25)' }}>
                  <p className="text-sm" style={{ color: 'rgba(211,217,212,0.5)' }}>
                    Enter to continue
                  </p>
                </div>

                <div className="flex gap-2">
                  <input
                    autoFocus
                    type="password"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                    placeholder="••••••••••••••••"
                    className="flex-1 rounded-xl px-4 py-3 text-sm outline-none tracking-widest"
                    style={{
                      background: 'rgba(33,42,49,0.9)',
                      border: `1px solid ${shake ? 'rgba(180,40,40,0.5)' : 'rgba(116,141,146,0.2)'}`,
                      color: '#D3D9D4',
                    }}
                  />
                  <button
                    onClick={handleSubmit}
                    className="px-5 py-3 rounded-xl text-sm font-medium transition-all"
                    style={{ background: 'linear-gradient(135deg, #124E66, #2E3944)', color: '#D3D9D4', border: '1px solid rgba(18,78,102,0.5)' }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
                    onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                  >
                    →
                  </button>
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
