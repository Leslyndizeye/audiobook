'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Maximize2, Minimize2, BookMarked, ChevronDown, ChevronUp } from 'lucide-react';
import { useApp } from '@/context/AppContext';

export default function ReadingView() {
  const { state, dispatch } = useApp();
  const activeRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [chaptersOpen, setChaptersOpen] = useState(false);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [state.activeSentence]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const isStreaming = !state.currentAudio && state.streamQueue.length > 0;
  const canSeek     = !!state.currentAudio;

  // Unified sentence list — prefer final audiobook sentences, fall back to stream queue
  const sentences: { idx: number; text: string }[] = state.currentAudio?.sentences
    ? state.currentAudio.sentences.map(s => ({ idx: s.index, text: s.text }))
    : state.streamQueue.map(s => ({ idx: s.idx, text: s.text }));

  const handleSentenceClick = (idx: number) => {
    if (!canSeek) return;
    dispatch({ type: 'SET_SENTENCE', payload: idx });
    window.dispatchEvent(new CustomEvent('seek-to-sentence', { detail: idx }));
  };

  const chapters  = state.currentDocument?.analysis?.chapters ?? [];
  const totalWords = state.currentDocument?.word_count ?? state.currentDocument?.analysis?.metadata.wordCount ?? 1;
  const totalPages = state.currentDocument?.page_count ?? null;
  const currentPage = totalPages && sentences.length > 0
    ? Math.max(1, Math.ceil((state.activeSentence + 1) / sentences.length * totalPages))
    : null;

  // Find which chapter is currently active.
  // Uses fraction-based mapping consistent with handleChapterJump:
  //   activeSentence / sentences.length  →  position fraction
  //   chapter.wordOffset / totalWords    →  chapter start fraction
  const activeChapterIdx = (() => {
    if (!chapters.length || !sentences.length || !totalWords) return -1;
    const sentenceFraction = state.activeSentence / sentences.length;
    let idx = 0;
    for (let i = 0; i < chapters.length; i++) {
      const chFraction = chapters[i].wordOffset / totalWords;
      if (sentenceFraction >= chFraction) idx = i;
      else break;
    }
    return idx;
  })();

  const handleChapterJump = (wordOffset: number) => {
    const fraction = Math.min(wordOffset / totalWords, 0.999);
    const idx = Math.min(Math.floor(fraction * sentences.length), sentences.length - 1);
    dispatch({ type: 'SET_SENTENCE', payload: idx });
    window.dispatchEvent(new CustomEvent('seek-to-sentence', { detail: idx }));
    setChaptersOpen(false);
  };

  if (sentences.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 rounded-2xl"
        style={{ background: 'rgba(46,57,68,0.4)', border: '1px solid rgba(211,217,212,0.06)' }}>
        <div className="w-12 h-12 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(46,57,68,0.8)' }}>
          <span className="text-2xl">📖</span>
        </div>
        <p className="text-sm" style={{ color: '#748D92' }}>Generate an audiobook to see the reading view</p>
      </div>
    );
  }

  const progress  = ((state.activeSentence + 1) / sentences.length) * 100;
  const isPlaying = state.playbackState === 'playing';

  const containerClass = fullscreen
    ? 'fixed inset-0 z-50 flex flex-col gap-4 p-6'
    : 'flex flex-col gap-4 h-[520px] rounded-2xl p-5';
  const containerStyle = fullscreen
    ? { background: 'rgba(20,28,34,0.97)', backdropFilter: 'blur(24px)' }
    : { background: 'rgba(33,42,49,0.7)', border: '1px solid rgba(211,217,212,0.06)' };

  return (
    <div className={containerClass} style={containerStyle}>

      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <motion.div
            className="w-2.5 h-2.5 rounded-full"
            style={{ background: '#124E66' }}
            animate={isPlaying
              ? { scale: [1, 1.5, 1], opacity: [0.6, 1, 0.6] }
              : { scale: 1, opacity: 0.3 }}
            transition={{ repeat: Infinity, duration: 0.9 }}
          />
          <span className="text-xs uppercase tracking-widest" style={{ color: '#748D92' }}>
            Now Reading
          </span>
          {canSeek && (
            <span className="text-[10px] tracking-wide px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(18,78,102,0.2)', color: '#748D92' }}>
              click to jump
            </span>
          )}
          {isStreaming && !state.streamDone && (
            <span className="text-[10px] tracking-wide px-2 py-0.5 rounded-full flex items-center gap-1"
              style={{ background: 'rgba(18,78,102,0.15)', color: '#748D92' }}>
              <motion.span
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ repeat: Infinity, duration: 1.2 }}
              >●</motion.span>
              Generating…
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs tabular-nums flex items-center gap-1.5" style={{ color: '#748D92' }}>
            {currentPage != null && (
              <>
                <span className="flex items-center gap-1">
                  <span style={{ color: 'rgba(116,141,146,0.55)', fontSize: '10px' }}>pg</span>
                  {currentPage}/{totalPages}
                </span>
                <span style={{ color: '#2E3944' }}>·</span>
              </>
            )}
            <span>
              {state.activeSentence + 1} / {sentences.length}
              {isStreaming && !state.streamDone && '+'}
            </span>
          </span>

          {chapters.length > 0 && (
            <button
              onClick={() => setChaptersOpen(v => !v)}
              title="Chapters"
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-all"
              style={{
                background: chaptersOpen ? 'rgba(167,139,250,0.2)' : 'rgba(46,57,68,0.6)',
                border: `1px solid ${chaptersOpen ? 'rgba(167,139,250,0.4)' : 'rgba(116,141,146,0.15)'}`,
                color: chaptersOpen ? '#a78bfa' : '#748D92',
              }}
            >
              <BookMarked size={11} />
              {activeChapterIdx >= 0 && !chaptersOpen ? (
                <span className="max-w-[120px] truncate">
                  {chapters[activeChapterIdx]?.title ?? chapters.length}
                </span>
              ) : (
                <span>{chapters.length}</span>
              )}
              {chaptersOpen ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            </button>
          )}

          <button
            onClick={() => setFullscreen(v => !v)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: fullscreen ? 'rgba(18,78,102,0.35)' : 'rgba(18,78,102,0.18)',
              border: `1px solid ${fullscreen ? 'rgba(18,78,102,0.6)' : 'rgba(18,78,102,0.3)'}`,
              color: '#D3D9D4',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(18,78,102,0.4)')}
            onMouseLeave={e => (e.currentTarget.style.background = fullscreen ? 'rgba(18,78,102,0.35)' : 'rgba(18,78,102,0.18)')}
          >
            {fullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            <span>{fullscreen ? 'Exit' : 'Fullscreen'}</span>
          </button>
        </div>
      </div>

      {/* Chapter list */}
      <AnimatePresence>
        {chaptersOpen && chapters.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: 'hidden' }}
            className="flex-shrink-0"
          >
            <div
              className="flex flex-col gap-0.5 rounded-xl p-2 max-h-48 overflow-y-auto scroll-area"
              style={{ background: 'rgba(20,28,34,0.8)', border: '1px solid rgba(167,139,250,0.2)' }}
            >
              {chapters.map((ch, i) => {
                const isActive = i === activeChapterIdx;
                const listenMin = ch.wordCount
                  ? Math.max(1, Math.round(ch.wordCount / 130))
                  : null;
                return (
                  <button
                    key={i}
                    onClick={() => handleChapterJump(ch.wordOffset)}
                    className="w-full text-left px-3 py-2 rounded-lg text-xs transition-all flex items-center gap-2 group/ch"
                    style={{
                      background: isActive ? 'rgba(167,139,250,0.15)' : 'transparent',
                      color: isActive ? '#a78bfa' : '#D3D9D4',
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget).style.background = 'rgba(167,139,250,0.12)';
                      (e.currentTarget).style.color = isActive ? '#a78bfa' : '#c4b5fd';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget).style.background = isActive ? 'rgba(167,139,250,0.15)' : 'transparent';
                      (e.currentTarget).style.color = isActive ? '#a78bfa' : '#D3D9D4';
                    }}
                  >
                    {/* Chapter number */}
                    <span
                      className="text-[10px] tabular-nums flex-shrink-0 w-5 text-right"
                      style={{ color: isActive ? '#a78bfa' : 'rgba(116,141,146,0.5)' }}
                    >
                      {String(i + 1).padStart(2, '0')}
                    </span>

                    {/* Title */}
                    <span className="flex-1 truncate">{ch.title}</span>

                    {/* Estimated listening time */}
                    {listenMin != null && (
                      <span
                        className="text-[9px] tabular-nums flex-shrink-0"
                        style={{ color: isActive ? 'rgba(167,139,250,0.7)' : 'rgba(116,141,146,0.4)' }}
                      >
                        ~{listenMin}min
                      </span>
                    )}

                    {/* "now" badge */}
                    {isActive && (
                      <span
                        className="text-[9px] px-1.5 py-0.5 rounded flex-shrink-0"
                        style={{ background: 'rgba(167,139,250,0.25)', color: '#a78bfa' }}
                      >
                        now
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progress bar */}
      <div className="h-0.5 rounded-full flex-shrink-0" style={{ background: 'rgba(116,141,146,0.15)' }}>
        <motion.div
          className="h-full rounded-full"
          style={{ background: 'linear-gradient(90deg, #124E66, #748D92)' }}
          animate={{ width: `${progress}%` }}
          transition={{ ease: 'linear', duration: 0.3 }}
        />
      </div>

      {/* Sentence list */}
      <div className={`flex-1 overflow-y-auto scroll-area flex flex-col gap-1 ${fullscreen ? 'px-4 max-w-3xl mx-auto w-full' : 'pr-2'}`}>
        <AnimatePresence initial={false}>
          {sentences.map((sentence) => {
            const isActive = sentence.idx === state.activeSentence;
            const isPast   = sentence.idx < state.activeSentence;

            return (
              <motion.div
                key={sentence.idx}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                ref={isActive ? activeRef : undefined}
                onClick={() => handleSentenceClick(sentence.idx)}
                className={`group relative ${isPast ? 'sentence-past' : isActive ? 'sentence-active' : 'sentence-future'}`}
                style={{
                  transition: 'background 0.35s ease, color 0.35s ease',
                  paddingRight: 8,
                  paddingTop: 6,
                  paddingBottom: 6,
                  paddingLeft: 10,
                  borderRadius: 8,
                  cursor: canSeek ? 'pointer' : 'default',
                }}
                onMouseEnter={e => {
                  if (canSeek && !isActive)
                    (e.currentTarget as HTMLDivElement).style.background = 'rgba(18,78,102,0.12)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLDivElement).style.background = '';
                }}
              >
                {/* Play-on-hover indicator */}
                {canSeek && !isActive && (
                  <span
                    className="absolute left-0 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-[10px]"
                    style={{ color: '#124E66' }}
                  >
                    ▶
                  </span>
                )}
                {isActive ? (
                  <ActiveSentence text={sentence.text} isPlaying={isPlaying} large={fullscreen} />
                ) : (
                  <span>{sentence.text}</span>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Tail indicator while more sentences are incoming */}
        {isStreaming && !state.streamDone && (
          <div className="flex items-center gap-1.5 px-2.5 py-2">
            {[0, 1, 2].map(i => (
              <motion.div
                key={i}
                style={{ width: 4, height: 4, borderRadius: '50%', background: '#748D92' }}
                animate={{ opacity: [0.2, 0.8, 0.2], scale: [0.8, 1.2, 0.8] }}
                transition={{ repeat: Infinity, duration: 1, delay: i * 0.2 }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Animated waveform when playing */}
      <AnimatePresence>
        {isPlaying && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="flex items-end justify-center gap-0.5 h-5 flex-shrink-0"
          >
            {[0.4, 0.7, 1, 0.8, 0.5, 0.9, 0.6, 1, 0.7, 0.4].map((h, i) => (
              <motion.div
                key={i}
                style={{ width: 3, borderRadius: 2, background: '#124E66', originY: 1 }}
                animate={{ scaleY: [h * 0.4, h, h * 0.4] }}
                transition={{ repeat: Infinity, duration: 0.9, delay: i * 0.07, ease: 'easeInOut' }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ActiveSentence({ text, isPlaying, large }: { text: string; isPlaying: boolean; large?: boolean }) {
  const words = text.split(/\s+/);
  return (
    <span style={large ? { fontSize: '1.25rem', lineHeight: 1.7 } : {}}>
      {words.map((word, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0.6 }}
          animate={isPlaying
            ? { opacity: [0.7, 1, 0.85], color: ['#D3D9D4', '#ffffff', '#D3D9D4'] }
            : { opacity: 1, color: '#D3D9D4' }}
          transition={isPlaying
            ? { repeat: Infinity, duration: 3, delay: (i / words.length) * 2.5, ease: 'easeInOut' }
            : {}}
          style={{ marginRight: '0.3em', display: 'inline-block' }}
        >
          {word}
        </motion.span>
      ))}
    </span>
  );
}
