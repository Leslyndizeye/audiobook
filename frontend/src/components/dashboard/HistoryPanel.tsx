'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, FileText, Play, CheckCircle, Circle, Trash2, RotateCcw, Loader2, BookOpen, BookMarked } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { history as historyApi, audio as audioApi } from '@/lib/api';

interface Props {
  onPlay: () => void;
}

function fmt(s: number) {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function HistoryPanel({ onPlay }: Props) {
  const { state, dispatch } = useApp();
  const [busy, setBusy] = useState<Record<string, string>>({}); // id → action

  useEffect(() => {
    historyApi.list()
      .then(items => dispatch({ type: 'SET_HISTORY', payload: items }))
      .catch(() => {});
  }, [dispatch]);

  const withBusy = async (id: string, action: string, fn: () => Promise<void>) => {
    setBusy(b => ({ ...b, [id]: action }));
    try { await fn(); } catch { /* silent */ }
    finally { setBusy(b => { const n = { ...b }; delete n[id]; return n; }); }
  };

  const handlePlay = (item: typeof state.history[0]) =>
    withBusy(item.id, 'play', async () => {
      const book = await audioApi.status(item.audiobookId);
      dispatch({ type: 'SET_AUDIO',          payload: book });
      dispatch({ type: 'SET_SENTENCE',        payload: item.resumeSentence ?? 0 });
      dispatch({ type: 'SET_HISTORY_ITEM_ID', payload: item.id });
      onPlay();
    });

  const handleDelete = (id: string) =>
    withBusy(id, 'delete', async () => {
      await historyApi.delete(id);
      dispatch({ type: 'DELETE_HISTORY', payload: id });
    });

  const handleReset = (id: string) =>
    withBusy(id, 'reset', async () => {
      await historyApi.resetResume(id);
      dispatch({ type: 'RESET_RESUME', payload: id });
    });

  const handleToggleComplete = (id: string, current: boolean) =>
    withBusy(id, 'complete', async () => {
      const next = !current;
      dispatch({ type: 'MARK_COMPLETED', payload: { id, completed: next } });
      try { await historyApi.markCompleted(id, next); }
      catch { dispatch({ type: 'MARK_COMPLETED', payload: { id, completed: current } }); }
    });

  if (!state.history.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 rounded-2xl"
        style={{ background: 'rgba(46,57,68,0.3)', border: '1px solid rgba(211,217,212,0.06)' }}>
        <Clock size={28} style={{ color: '#2E3944' }} />
        <p className="text-sm" style={{ color: '#748D92' }}>No history yet — generate an audiobook first</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <AnimatePresence initial={false}>
        {state.history.map((item, i) => {
          const hasPause = (item.resumeSentence ?? 0) > 0 && !item.completed;
          const isBusy   = (a: string) => busy[item.id] === a;
          const anyBusy  = !!busy[item.id];

          return (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
              transition={{ delay: i * 0.03 }}
            >
              <div
                className="flex items-start gap-3 py-3 px-4 rounded-2xl transition-all duration-200"
                style={{
                  background: item.completed ? 'rgba(18,78,102,0.12)' : 'rgba(46,57,68,0.5)',
                  border: item.completed
                    ? '1px solid rgba(18,78,102,0.3)'
                    : '1px solid rgba(211,217,212,0.06)',
                  opacity: item.completed ? 0.8 : 1,
                }}
              >
                {/* File icon */}
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{
                    background: item.completed ? 'rgba(18,78,102,0.25)' : 'rgba(46,57,68,0.8)',
                    border: '1px solid rgba(116,141,146,0.15)',
                  }}>
                  <FileText size={16} style={{ color: item.completed ? '#124E66' : '#748D92' }} />
                </div>

                {/* Info column */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate" style={{ color: '#D3D9D4' }}>
                      {item.documentName}
                    </p>
                    {item.completed && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md flex-shrink-0 font-medium"
                        style={{ background: 'rgba(18,78,102,0.3)', color: '#748D92', border: '1px solid rgba(18,78,102,0.4)' }}>
                        Finished
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap text-xs" style={{ color: '#748D92' }}>
                    <span>{item.voice.replace('Neural', '')}</span>
                    <span style={{ color: '#2E3944' }}>·</span>
                    <span>{fmt(item.duration)}</span>
                    {item.totalPages != null && (
                      <>
                        <span style={{ color: '#2E3944' }}>·</span>
                        <span className="flex items-center gap-1">
                          <BookOpen size={10} />
                          {item.totalPages} {item.totalPages === 1 ? 'page' : 'pages'}
                        </span>
                      </>
                    )}
                    {item.chapterCount > 0 && (
                      <>
                        <span style={{ color: '#2E3944' }}>·</span>
                        <span className="flex items-center gap-1">
                          <BookMarked size={10} />
                          {item.chapterCount} {item.chapterCount === 1 ? 'chapter' : 'chapters'}
                        </span>
                      </>
                    )}
                    <span style={{ color: '#2E3944' }}>·</span>
                    <span>{relativeTime(item.lastPlayedAt)}</span>
                  </div>

                  {/* Resume badge */}
                  {hasPause && (() => {
                    const resume = item.resumeSentence ?? 0;
                    const stopPage = item.totalPages && item.totalSentences
                      ? Math.max(1, Math.ceil((resume + 1) / item.totalSentences * item.totalPages))
                      : null;
                    return (
                      <div className="mt-1.5 flex flex-col gap-1">
                        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md"
                          style={{ background: 'rgba(18,78,102,0.2)', border: '1px solid rgba(18,78,102,0.3)' }}>
                          <span className="text-[10px] font-medium" style={{ color: '#748D92' }}>
                            ▶ Paused
                            {stopPage != null
                              ? ` — page ${stopPage} of ${item.totalPages}`
                              : ` at sentence ${resume + 1}`}
                          </span>
                          <button
                            onClick={() => handleReset(item.id)}
                            disabled={anyBusy}
                            title="Reset to beginning"
                            className="flex items-center justify-center rounded transition-colors"
                            style={{ color: 'rgba(116,141,146,0.6)', padding: '1px' }}
                            onMouseEnter={e => (e.currentTarget.style.color = '#f87171')}
                            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(116,141,146,0.6)')}
                          >
                            {isBusy('reset')
                              ? <Loader2 size={10} className="animate-spin" />
                              : <RotateCcw size={10} />}
                          </button>
                        </div>
                        {item.stopChapterTitle && (
                          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md"
                            style={{ background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.2)' }}>
                            <BookMarked size={9} style={{ color: '#a78bfa', flexShrink: 0 }} />
                            <span className="text-[10px] truncate max-w-[200px]" style={{ color: '#a78bfa' }}>
                              {item.stopChapterTitle}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Progress bar */}
                  <div className="mt-2 h-0.5 rounded-full w-full" style={{ background: 'rgba(116,141,146,0.12)' }}>
                    <div className="h-full rounded-full transition-all"
                      style={{
                        width: `${item.progress}%`,
                        background: item.completed
                          ? 'linear-gradient(90deg, #124E66, #748D92)'
                          : 'linear-gradient(90deg, #2E3944, #748D92)',
                      }}
                    />
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex flex-col gap-1.5 flex-shrink-0">
                  {/* Play / Resume */}
                  <motion.button
                    onClick={() => handlePlay(item)}
                    disabled={anyBusy}
                    whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.9 }}
                    title={hasPause
                      ? item.totalPages && item.totalSentences
                        ? `Resume from page ${Math.max(1, Math.ceil(((item.resumeSentence ?? 0) + 1) / item.totalSentences * item.totalPages))} of ${item.totalPages}`
                        : `Resume from sentence ${(item.resumeSentence ?? 0) + 1}`
                      : 'Play from beginning'}
                    className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
                    style={{
                      background: 'rgba(18,78,102,0.3)',
                      border: '1px solid rgba(18,78,102,0.5)',
                    }}
                  >
                    {isBusy('play')
                      ? <Loader2 size={12} className="animate-spin" style={{ color: '#748D92' }} />
                      : <Play size={12} style={{ color: '#D3D9D4', marginLeft: 1 }} />}
                  </motion.button>

                  {/* Mark complete */}
                  <motion.button
                    onClick={() => handleToggleComplete(item.id, item.completed)}
                    disabled={anyBusy}
                    whileTap={{ scale: 0.9 }}
                    title={item.completed ? 'Mark as unfinished' : 'Mark as finished'}
                    className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
                    style={{
                      background: item.completed ? 'rgba(18,78,102,0.25)' : 'rgba(46,57,68,0.8)',
                      border: item.completed
                        ? '1px solid rgba(18,78,102,0.5)'
                        : '1px solid rgba(116,141,146,0.15)',
                    }}
                  >
                    {isBusy('complete')
                      ? <Loader2 size={12} className="animate-spin" style={{ color: '#748D92' }} />
                      : item.completed
                        ? <CheckCircle size={13} style={{ color: '#124E66' }} />
                        : <Circle size={13} style={{ color: '#748D92' }} />}
                  </motion.button>

                  {/* Delete */}
                  <motion.button
                    onClick={() => handleDelete(item.id)}
                    disabled={anyBusy}
                    whileTap={{ scale: 0.9 }}
                    title="Remove from history"
                    className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
                    style={{
                      background: 'rgba(46,57,68,0.6)',
                      border: '1px solid rgba(116,141,146,0.1)',
                      color: '#748D92',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = 'rgba(180,40,40,0.15)';
                      e.currentTarget.style.borderColor = 'rgba(180,40,40,0.35)';
                      e.currentTarget.style.color = '#f87171';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'rgba(46,57,68,0.6)';
                      e.currentTarget.style.borderColor = 'rgba(116,141,146,0.1)';
                      e.currentTarget.style.color = '#748D92';
                    }}
                  >
                    {isBusy('delete')
                      ? <Loader2 size={12} className="animate-spin" />
                      : <Trash2 size={12} />}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
