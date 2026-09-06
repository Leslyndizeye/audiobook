'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, Mic, FileText, CheckCircle } from 'lucide-react';

export interface ProgressState {
  active: boolean;
  done: boolean;
  pct: number;
  index: number;
  total: number;
  currentSentence: string;
  documentName: string;
}

interface Props {
  progress: ProgressState;
  onCancel: () => void;
}

const STAGE_ICONS = ['📄', '🔤', '🎙️', '🎵', '✅'];

function stageIcon(pct: number) {
  if (pct < 10) return STAGE_ICONS[0];
  if (pct < 40) return STAGE_ICONS[1];
  if (pct < 75) return STAGE_ICONS[2];
  if (pct < 99) return STAGE_ICONS[3];
  return STAGE_ICONS[4];
}

export default function GenerationProgress({ progress, onCancel }: Props) {
  if (!progress.active && !progress.done) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="gen-progress"
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        className="rounded-2xl p-4 flex flex-col gap-3"
        style={{
          background: 'rgba(18,78,102,0.12)',
          border: '1px solid rgba(18,78,102,0.35)',
          backdropFilter: 'blur(12px)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <motion.span
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ repeat: Infinity, duration: 1.2 }}
              className="text-base"
            >
              {stageIcon(progress.pct)}
            </motion.span>
            <span className="text-xs font-semibold tracking-wide" style={{ color: '#D3D9D4' }}>
              {progress.done ? 'Audio ready!' : 'Generating…'}
            </span>
          </div>
          {!progress.done && (
            <button
              onClick={onCancel}
              className="w-6 h-6 rounded-full flex items-center justify-center transition-all"
              style={{ background: 'rgba(180,40,40,0.15)', border: '1px solid rgba(180,40,40,0.3)', color: '#f87171' }}
            >
              <X size={11} />
            </button>
          )}
          {progress.done && (
            <CheckCircle size={16} style={{ color: '#124E66' }} />
          )}
        </div>

        {/* Document name */}
        <div className="flex items-center gap-1.5">
          <FileText size={11} style={{ color: '#748D92' }} />
          <span className="text-[10px] truncate" style={{ color: '#748D92' }}>
            {progress.documentName}
          </span>
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-[10px]" style={{ color: '#748D92' }}>
              {progress.done
                ? 'Complete'
                : `Sentence ${progress.index + 1} of ${progress.total}`}
            </span>
            <span className="text-[10px] font-semibold tabular-nums" style={{ color: '#D3D9D4' }}>
              {progress.pct.toFixed(0)}%
            </span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(116,141,146,0.15)' }}>
            <motion.div
              className="h-full rounded-full"
              style={{ background: 'linear-gradient(90deg, #124E66, #748D92)' }}
              animate={{ width: `${progress.pct}%` }}
              transition={{ ease: 'linear', duration: 0.3 }}
            />
          </div>
        </div>

        {/* Current sentence being generated */}
        {!progress.done && progress.currentSentence && (
          <div className="rounded-xl px-3 py-2" style={{ background: 'rgba(46,57,68,0.5)' }}>
            <div className="flex items-center gap-1.5 mb-1">
              <motion.div
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ repeat: Infinity, duration: 0.9 }}
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: '#124E66' }}
              />
              <span className="text-[9px] uppercase tracking-widest" style={{ color: '#748D92' }}>
                Now speaking
              </span>
            </div>
            <p className="text-[11px] leading-relaxed line-clamp-2" style={{ color: '#D3D9D4' }}>
              {progress.currentSentence}
            </p>
          </div>
        )}

        {/* Waveform animation while generating */}
        {!progress.done && (
          <div className="flex items-end justify-center gap-0.5 h-4">
            {[0.5, 0.8, 1, 0.7, 0.9, 0.6, 1, 0.8, 0.5].map((h, i) => (
              <motion.div
                key={i}
                style={{ width: 3, borderRadius: 2, background: '#124E66', originY: 1 }}
                animate={{ scaleY: [h * 0.3, h, h * 0.3] }}
                transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.08, ease: 'easeInOut' }}
              />
            ))}
            <Mic size={10} style={{ color: '#748D92', marginLeft: 4 }} />
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
