'use client';

import { useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen, Upload, History, Mic, Crown, Library, RefreshCw,
} from 'lucide-react';
import { GlowButton } from '@/components/ui/GlassCard';
import GlassIcons from '@/components/ui/GlassIcons';
import ElasticSlider from '@/components/ui/ElasticSlider';
import DropdownSelect from '@/components/ui/DropdownSelect';
import GenerationProgress, { type ProgressState } from './GenerationProgress';
import DocumentUpload from './DocumentUpload';
import AudioPlayer from './AudioPlayer';
import ReadingView from './ReadingView';
import HistoryPanel from './HistoryPanel';
import DocumentsLibrary from './DocumentsLibrary';
import LogoutCord from './LogoutCord';
import { useApp } from '@/context/AppContext';
import { audio as audioApi, history as historyApi } from '@/lib/api';
import { unlockAudio } from '@/lib/audioUnlock';

type Tab = 'upload' | 'read' | 'history' | 'library';

const NAV_ICONS = [
  { id: 'upload',  icon: Upload,   label: 'Upload'  },
  { id: 'read',    icon: BookOpen, label: 'Reading' },
  { id: 'history', icon: History,  label: 'History' },
  { id: 'library', icon: Library,  label: 'Library' },
];

const VOICES = [
  'en-US-JennyNeural',
  'en-US-GuyNeural',
  'en-GB-SoniaNeural',
  'en-AU-NatashaNeural',
];

const EMPTY_PROGRESS: ProgressState = {
  active: false, done: false, pct: 0,
  index: 0, total: 0,
  currentSentence: '', documentName: '',
};

const TAB_PATHS: Record<Tab, string> = {
  upload: '/upload', read: '/read', history: '/history', library: '/library',
};
const PATH_TABS: Record<string, Tab> = {
  '/upload': 'upload', '/read': 'read', '/history': 'history', '/library': 'library',
};

interface Props { defaultTab?: Tab }

export default function Dashboard({ defaultTab = 'upload' }: Props) {
  const { state, dispatch } = useApp();
  const router   = useRouter();
  const pathname = usePathname();

  // Derive active tab from URL; fall back to defaultTab prop
  const activeTab: Tab = PATH_TABS[pathname] ?? defaultTab;

  const setTab = (id: Tab) => { router.push(TAB_PATHS[id]); };
  const [voice, setVoice] = useState('en-US-JennyNeural');
  const [speed, setSpeed] = useState(1);
  const [pitch, setPitch] = useState(0);
  const [progress, setProgress] = useState<ProgressState>(EMPTY_PROGRESS);
  const abortRef = useRef<AbortController | null>(null);

  // overrideVoice lets the narrator bar trigger a re-generate with a freshly selected voice
  // before React has flushed the setVoice state update.
  const handleGenerate = async (overrideVoice?: string) => {
    if (!state.currentDocument) return;
    unlockAudio(); // Must be called synchronously within the user gesture

    // If another generation is running, abort it cleanly.
    // We capture the OLD controller before replacing abortRef so the finally block
    // of the OLD call can detect it was superseded and won't clobber the new ref.
    const prevController = abortRef.current;
    const controller     = new AbortController();
    abortRef.current     = controller;
    prevController?.abort();

    const activeVoice = overrideVoice ?? voice;

    setProgress({
      active: true, done: false, pct: 0,
      index: 0, total: 0,
      currentSentence: '',
      documentName: state.currentDocument.name,
    });

    try {
      // Clear previous audio so AudioPlayer switches out of normal mode into stream mode.
      dispatch({ type: 'CLEAR_AUDIO' });
      dispatch({ type: 'CLEAR_STREAM_QUEUE' });
      dispatch({ type: 'SET_STREAM_DONE', payload: false });

      const { audiobookId, historyItemId } = await audioApi.generateStream(
        { documentId: state.currentDocument.id, voice: activeVoice, speed, pitch },
        (evt) => {
          if (evt.type === 'start') {
            setProgress(p => ({ ...p, total: evt.total ?? 0 }));
            setTab('read');
            // Store historyItemId immediately — it exists even if generation is cancelled
            if (evt.historyItemId) {
              dispatch({ type: 'SET_HISTORY_ITEM_ID', payload: evt.historyItemId });
            }
          } else if (evt.type === 'progress') {
            setProgress(p => ({
              ...p,
              pct:             evt.pct ?? p.pct,
              index:           evt.index ?? p.index,
              total:           evt.total ?? p.total,
              currentSentence: evt.sentence ?? p.currentSentence,
            }));
            // Decode base64 audio → blob URL locally (no HTTP request → IDM cannot intercept)
            if (evt.sentenceAudioB64 && evt.index !== undefined && evt.sentence !== undefined) {
              try {
                const binStr = atob(evt.sentenceAudioB64);
                const bytes  = new Uint8Array(binStr.length);
                for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
                const blobUrl = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }));
                dispatch({ type: 'PUSH_STREAM_SENTENCE', payload: {
                  idx:  evt.index,
                  url:  blobUrl,
                  text: evt.sentence,
                }});
              } catch { /* malformed base64 — skip sentence */ }
            }
          } else if (evt.type === 'done') {
            setProgress(p => ({ ...p, pct: 100, done: true }));
            dispatch({ type: 'SET_STREAM_DONE', payload: true });
          }
        },
        controller.signal,
      );

      // Load the finished audiobook — AudioPlayer will transition from stream → full book
      const book = await audioApi.status(audiobookId);
      dispatch({ type: 'SET_AUDIO',           payload: book });
      dispatch({ type: 'SET_HISTORY_ITEM_ID',  payload: historyItemId });

      // Refresh history list
      historyApi.list()
        .then(items => dispatch({ type: 'SET_HISTORY', payload: items }))
        .catch(() => {});

      setTimeout(() => {
        setProgress(EMPTY_PROGRESS);
      }, 1200);

    } catch (err: unknown) {
      // If this call was superseded by a newer handleGenerate, ignore silently.
      if (controller.signal.aborted) return;
      setProgress(EMPTY_PROGRESS);
    } finally {
      // Only clear abortRef if it's still ours — a newer call may have already replaced it.
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    setProgress(EMPTY_PROGRESS);
    dispatch({ type: 'CLEAR_STREAM_QUEUE' });
    // Give the backend ~2 s to flush the partial audio to disk, then refresh history
    setTimeout(() => {
      historyApi.list()
        .then(items => dispatch({ type: 'SET_HISTORY', payload: items }))
        .catch(() => {});
    }, 2000);
  };

  const handleTabSelect = (id: string) => {
    setTab(id as Tab);
  };

  const generating = progress.active;

  return (
    <motion.div
      className="fixed inset-0 flex"
      style={{ background: '#212A31' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8 }}
    >
      {/* Background ambiance */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(18,78,102,0.07) 0%, transparent 70%)', filter: 'blur(40px)' }} />
        <div className="absolute bottom-0 right-1/3 w-80 h-80 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(116,141,146,0.04) 0%, transparent 70%)', filter: 'blur(40px)' }} />
      </div>

      {/* ── Left sidebar ── */}
      <motion.aside
        className="relative z-10 flex flex-col glass border-r overflow-hidden flex-shrink-0"
        style={{ width: 240, borderColor: 'rgba(211,217,212,0.06)' }}
        initial={{ x: -240, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 280, damping: 30 }}
      >
        {/* Logo */}
        <div className="px-5 py-6 border-b" style={{ borderColor: 'rgba(211,217,212,0.06)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #124E66, #2E3944)' }}>
              <Crown size={14} style={{ color: '#D3D9D4' }} />
            </div>
            <div>
              <p className="text-xs font-bold tracking-wider"
                style={{ fontFamily: 'Cinzel, serif', color: '#D3D9D4' }}>
                LESLY
              </p>
              <p className="text-[10px] tracking-widest"
                style={{ fontFamily: 'Cinzel, serif', color: '#748D92' }}>
                REFRESH READER
              </p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="px-3 py-4 flex flex-col gap-1">
          {(['upload', 'read', 'history', 'library'] as Tab[]).map(id => {
            const meta = NAV_ICONS.find(n => n.id === id)!;
            const Icon = meta.icon;
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200"
                style={{
                  background: isActive ? 'rgba(18,78,102,0.25)' : 'transparent',
                  border: isActive ? '1px solid rgba(18,78,102,0.4)' : '1px solid transparent',
                  color: isActive ? '#D3D9D4' : '#748D92',
                }}
              >
                <Icon size={16} />
                {meta.label}
              </button>
            );
          })}
        </nav>

        {/* Bottom group: voice controls */}
        <div className="mt-auto flex flex-col">

          {/* Voice controls — hidden while generating, replaced by progress */}
          <div className="px-4 py-4 border-t flex flex-col gap-4"
          style={{ borderColor: 'rgba(211,217,212,0.06)' }}>

          <AnimatePresence mode="wait">
            {generating ? (
              /* Live generation progress */
              <motion.div
                key="progress"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
              >
                <GenerationProgress progress={progress} onCancel={handleCancel} />
              </motion.div>
            ) : (
              /* Voice settings + generate button */
              <motion.div
                key="controls"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="flex flex-col gap-4"
              >
                {state.currentDocument && (
                  <>
                    <p className="text-[10px] uppercase tracking-widest" style={{ color: '#748D92' }}>
                      Voice Settings
                    </p>

                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] uppercase tracking-wider" style={{ color: '#748D92' }}>Voice</label>
                      <DropdownSelect
                        value={voice}
                        onChange={setVoice}
                        options={VOICES.map(v => ({ value: v, label: v.replace('Neural', '').replace(/-/g, ' ') }))}
                        disabled={generating}
                        maxListHeight={180}
                      />
                    </div>

                    <ElasticSlider
                      label="Speed" value={speed} min={0.5} max={2} step={0.25}
                      onChange={setSpeed} formatValue={v => `${v}×`}
                      leftLabel="0.5×" rightLabel="2×"
                    />

                    <ElasticSlider
                      label="Pitch" value={pitch} min={-20} max={20} step={1}
                      onChange={setPitch}
                      formatValue={v => `${v >= 0 ? '+' : ''}${v}Hz`}
                      leftLabel="-20Hz" rightLabel="+20Hz"
                    />

                    <GlowButton onClick={handleGenerate} className="w-full justify-center" variant="teal">
                      <span className="flex items-center gap-2">
                        <Mic size={14} /> Generate Audiobook
                      </span>
                    </GlowButton>
                  </>
                )}

                {!state.currentDocument && (
                  <p className="text-[11px] text-center" style={{ color: '#748D92' }}>
                    Upload a document to get started
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
          </div>
        </div>
      </motion.aside>

      {/* ── Main content ── */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b glass flex-shrink-0"
          style={{ borderColor: 'rgba(211,217,212,0.06)' }}>
          <div>
            <h1 className="font-semibold text-base" style={{ fontFamily: 'Cinzel, serif', color: '#D3D9D4' }}>
              {activeTab === 'upload'  ? 'Upload Document'
               : activeTab === 'read'     ? 'Reading Experience'
               : activeTab === 'history'  ? 'Audiobook History'
               :                            'Document Library'}
            </h1>
            <p className="text-xs mt-0.5" style={{ color: '#748D92' }}>
              {generating
                ? `⏳ Generating ${progress.index + 1}/${progress.total} sentences…`
                : state.currentDocument
                  ? `📄 ${state.currentDocument.name}`
                  : 'No document loaded'}
            </p>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            {state.currentDocument && !generating && (
              <div className="glass-teal px-3 py-1.5 rounded-xl flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#124E66' }} />
                <span className="text-xs font-medium max-w-[140px] truncate" style={{ color: '#D3D9D4' }}>
                  {state.currentDocument.name}
                </span>
              </div>
            )}

            {generating && (
              <div className="glass-teal px-3 py-1.5 rounded-xl flex items-center gap-2">
                <motion.div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: '#124E66' }}
                  animate={{ scale: [1, 1.6, 1], opacity: [0.6, 1, 0.6] }}
                  transition={{ repeat: Infinity, duration: 0.7 }}
                />
                <span className="text-xs font-medium tabular-nums" style={{ color: '#D3D9D4' }}>
                  {progress.pct.toFixed(0)}%
                </span>
              </div>
            )}

            <LogoutCord />
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-auto scroll-area p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="flex flex-col gap-6 h-full"
            >
              {activeTab === 'upload'  && <DocumentUpload onGenerate={() => { setTab('read'); handleGenerate(); }} />}
              {activeTab === 'read'    && (
                <>
                  {/* Narrator bar — change voice and re-generate (works mid-stream too) */}
                  <div className="flex items-center gap-3 px-4 py-3 rounded-2xl flex-shrink-0 flex-wrap"
                    style={{ background: 'rgba(46,57,68,0.5)', border: '1px solid rgba(18,78,102,0.2)' }}>
                    <div className="flex items-center gap-2">
                      <Mic size={13} style={{ color: '#748D92' }} />
                      <span className="text-[10px] uppercase tracking-widest" style={{ color: '#748D92' }}>Narrator</span>
                    </div>
                    <DropdownSelect
                      value={voice}
                      onChange={v => { setVoice(v); handleGenerate(v); }}
                      options={VOICES.map(v => ({ value: v, label: v.replace('Neural', '').replace(/-/g, ' ') }))}
                      maxListHeight={180}
                      className="flex-1"
                    />
                    {state.currentDocument && (
                      <button
                        onClick={() => handleGenerate()}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                        style={{
                          background: generating ? 'rgba(18,78,102,0.15)' : 'rgba(18,78,102,0.3)',
                          border: '1px solid rgba(18,78,102,0.5)',
                          color: '#D3D9D4',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(18,78,102,0.5)')}
                        onMouseLeave={e => (e.currentTarget.style.background = generating ? 'rgba(18,78,102,0.15)' : 'rgba(18,78,102,0.3)')}
                      >
                        <RefreshCw size={11} className={generating ? 'animate-spin' : ''} />
                        {generating ? 'Restart' : 'Re-generate'}
                      </button>
                    )}
                    {state.currentAudio && !generating && (
                      <span className="text-[10px] ml-auto" style={{ color: '#748D92' }}>
                        Current: {state.currentAudio.voice.replace('Neural', '').replace(/-/g, ' ')}
                      </span>
                    )}
                  </div>
                  <ReadingView />
                </>
              )}
              {activeTab === 'history' && <HistoryPanel onPlay={() => setTab('read')} />}
              {activeTab === 'library' && <DocumentsLibrary onSelect={() => setTab('upload')} />}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Audio player */}
        <div className="px-6 pb-6 flex-shrink-0">
          <AudioPlayer
            voice={voice}
            voices={VOICES.map(v => ({ value: v, label: v.replace('Neural', '').replace(/-/g, ' ') }))}
            onVoiceChange={v => { setVoice(v); handleGenerate(v); }}
            onRegenerate={() => handleGenerate()}
            generating={generating}
          />
        </div>
      </main>

      {/* ── Right GlassIcons rail ── */}
      <div className="relative z-10 flex flex-col glass border-l flex-shrink-0"
        style={{ borderColor: 'rgba(211,217,212,0.06)' }}>
        <GlassIcons items={NAV_ICONS} active={activeTab} onSelect={handleTabSelect} />
      </div>
    </motion.div>
  );
}
