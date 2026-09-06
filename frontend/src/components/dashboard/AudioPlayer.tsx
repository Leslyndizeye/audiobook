'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Radio, RefreshCw, Mic } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { history as historyApi } from '@/lib/api';
import type { StreamSentence } from '@/types';
import DropdownSelect from '@/components/ui/DropdownSelect';

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2].map(s => ({
  value: String(s),
  label: `${s}×`,
}));

interface Props {
  voice?: string;
  voices?: { value: string; label: string }[];
  onVoiceChange?: (v: string) => void;
  onRegenerate?: () => void;
  generating?: boolean;
}

export default function AudioPlayer({ voice, voices, onVoiceChange, onRegenerate, generating }: Props) {
  const { state, dispatch } = useApp();

  // ── Refs shared across modes ─────────────────────────────────────────────
  const audioRef          = useRef<HTMLAudioElement | null>(null);
  const canvasRef         = useRef<HTMLCanvasElement>(null);
  const analyserRef       = useRef<AnalyserNode | null>(null);
  const audioCtxRef       = useRef<AudioContext | null>(null);
  const rafRef            = useRef<number>(0);
  const historyIdRef      = useRef<string | null>(null);
  const activeSentenceRef = useRef(0);
  const progressPctRef    = useRef(0);

  // ── Stream mode refs (always fresh via render-time assignment) ────────────
  const streamQueueRef  = useRef<StreamSentence[]>([]);
  const streamDoneRef   = useRef(true);
  const streamIdxRef    = useRef(-1);           // index into streamQueue currently playing
  const streamBufRef    = useRef(false);        // true = waiting for next sentence

  // ── Pending seek: a caption click can arrive before the blob finishes loading ──
  const pendingSeekTimeRef = useRef<number | null>(null);

  // Keep stream refs in sync with state every render
  streamQueueRef.current = state.streamQueue;
  streamDoneRef.current  = state.streamDone;

  // ── Normal mode player state ──────────────────────────────────────────────
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume]     = useState(1);
  const [muted, setMuted]       = useState(false);
  const [speed, setSpeed]       = useState(1);

  // ── Stream mode UI state ──────────────────────────────────────────────────
  const [streamBuffering, setStreamBuffering] = useState(false);
  const [streamSentenceNum, setStreamSentenceNum] = useState(0);

  const isPlaying  = state.playbackState === 'playing';
  const streamMode = !state.currentAudio && state.streamQueue.length > 0;

  // Keep history/sentence refs in sync
  useEffect(() => { historyIdRef.current = state.historyItemId; }, [state.historyItemId]);
  useEffect(() => { activeSentenceRef.current = state.activeSentence; }, [state.activeSentence]);

  const saveProgress = useCallback((pct: number, sentence: number) => {
    const hid = historyIdRef.current;
    if (!hid) return;
    historyApi.updateProgress(hid, pct, sentence).catch(() => {});
  }, []);

  // ── Stream queue player ───────────────────────────────────────────────────
  // Blob URLs we've created — must be revoked when done to free memory
  const blobUrlsRef = useRef<string[]>([]);

  // This function ref is reassigned every render so onended always calls fresh logic.
  const playStreamNext = useRef(() => {});
  playStreamNext.current = () => {
    const next  = streamIdxRef.current + 1;
    const queue = streamQueueRef.current;

    if (next >= queue.length) {
      if (streamDoneRef.current) {
        streamIdxRef.current = -1;
        streamBufRef.current = false;
        setStreamBuffering(false);
        dispatch({ type: 'SET_PLAYBACK', payload: 'idle' });
      } else {
        streamBufRef.current = true;
        setStreamBuffering(true);
        dispatch({ type: 'SET_PLAYBACK', payload: 'paused' });
      }
      return;
    }

    streamIdxRef.current = next;
    streamBufRef.current = false;
    const sentence = queue[next];

    // Tear down previous audio element
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }

    dispatch({ type: 'SET_SENTENCE', payload: sentence.idx });
    setStreamSentenceNum(next + 1);
    setStreamBuffering(false);

    // sentence.url is already a blob URL created from base64 in the SSE event.
    // No HTTP request needed — IDM cannot intercept blob:// URLs.
    const blobUrl = sentence.url;
    blobUrlsRef.current.push(blobUrl);

    const audio = new Audio(blobUrl);
    audio.volume = muted ? 0 : volume;
    audioRef.current = audio;

    audio.onended = () => {
      URL.revokeObjectURL(blobUrl);
      playStreamNext.current();
    };
    audio.onerror = () => {
      URL.revokeObjectURL(blobUrl);
      setTimeout(() => playStreamNext.current(), 150);
    };

    audio.play()
      .then(() => dispatch({ type: 'SET_PLAYBACK', payload: 'playing' }))
      .catch(() => {
        // Autoplay blocked — show play button so user can tap
        dispatch({ type: 'SET_PLAYBACK', payload: 'paused' });
      });
  };

  // Start playing when first sentence arrives
  useEffect(() => {
    if (state.streamQueue.length > 0 && streamIdxRef.current === -1) {
      playStreamNext.current();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.streamQueue.length > 0]);

  // Resume if we were buffering and a new sentence just arrived
  useEffect(() => {
    if (streamBufRef.current && state.streamQueue.length > streamIdxRef.current + 1) {
      playStreamNext.current();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.streamQueue.length]);

  // Reset stream state when queue is cleared
  useEffect(() => {
    if (state.streamQueue.length === 0) {
      streamIdxRef.current = -1;
      streamBufRef.current = false;
      setStreamBuffering(false);
      setStreamSentenceNum(0);
      // Revoke any leftover blob URLs
      blobUrlsRef.current.forEach(u => URL.revokeObjectURL(u));
      blobUrlsRef.current = [];
    }
  }, [state.streamQueue.length]);

  // ── Normal mode player ────────────────────────────────────────────────────
  useEffect(() => {
    if (!state.currentAudio?.audioUrl) return;

    // Capture stream state before tearing it down
    const streamResumeSentenceIdx = streamIdxRef.current;
    const wasPlaying = state.playbackState === 'playing';

    // Stop stream playback
    streamIdxRef.current = -1;
    streamBufRef.current = false;
    setStreamBuffering(false);
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; audioRef.current = null; }
    if (audioCtxRef.current) { audioCtxRef.current.close(); audioCtxRef.current = null; }
    cancelAnimationFrame(rafRef.current);

    // Clear any stale pending seek from a previous book
    pendingSeekTimeRef.current = null;

    // Fetch as blob so the Audio element never gets an HTTP src (IDM intercepts those).
    // The backend serves this as application/octet-stream to further discourage IDM.
    let mounted = true;
    const abort = new AbortController();
    const blobHolder = { url: '' };
    const audioUrl = state.currentAudio.audioUrl;
    const sentences = state.currentAudio.sentences;

    fetch(audioUrl, { signal: abort.signal })
      .then(r => r.blob())
      .then(blob => {
        blobHolder.url = URL.createObjectURL(new Blob([blob], { type: 'audio/mpeg' }));
        if (!mounted) { URL.revokeObjectURL(blobHolder.url); return; }

        const audio   = new Audio(blobHolder.url);
        const ctx     = new AudioContext();
        ctx.resume();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 128;
        audioRef.current    = audio;
        audioCtxRef.current = ctx;
        analyserRef.current = analyser;

        const src = ctx.createMediaElementSource(audio);
        src.connect(analyser);
        analyser.connect(ctx.destination);

        // Corrects for backend timing estimation error (bytes/ms formula vs actual bitrate).
        // Set in onloadedmetadata once actual duration is known; used in ontimeupdate.
        let timeScale = 1;

        audio.onloadedmetadata = () => {
          if (!mounted) return;
          setDuration(audio.duration);

          if (sentences && sentences.length > 0) {
            const estimatedEnd = sentences[sentences.length - 1].endTime;
            if (estimatedEnd > 0) timeScale = audio.duration / estimatedEnd;
          }

          // Determine seek target then play — all in one place so audio never starts
          // from position 0 before the seek lands (which caused the "played twice" bug).
          const pendingTime = pendingSeekTimeRef.current;

          if (pendingTime !== null) {
            // Caption click arrived while blob was loading — honour it.
            pendingSeekTimeRef.current = null;
            audio.currentTime = pendingTime * timeScale;
            audio.play()
              .then(() => { if (mounted) dispatch({ type: 'SET_PLAYBACK', payload: 'playing' }); })
              .catch(() => {});
          } else if (streamResumeSentenceIdx >= 0 && sentences) {
            // Stream was active at this sentence — seek then autoplay only if it was playing.
            const s = sentences.find(s => s.index === streamResumeSentenceIdx)
                   ?? sentences[Math.min(streamResumeSentenceIdx, sentences.length - 1)];
            if (s && s.startTime > 0) audio.currentTime = s.startTime * timeScale;
            if (wasPlaying) {
              audio.play()
                .then(() => { if (mounted) dispatch({ type: 'SET_PLAYBACK', payload: 'playing' }); })
                .catch(() => { if (mounted) dispatch({ type: 'SET_PLAYBACK', payload: 'paused' }); });
            }
          } else {
            // No stream context — resume from last known sentence (history / re-open).
            const resumeIdx = activeSentenceRef.current;
            if (resumeIdx > 0 && sentences) {
              const s = sentences.find(s => s.index === resumeIdx);
              if (s) audio.currentTime = s.startTime * timeScale;
            }
            // Do not autoplay for history resume — let user press play.
          }
        };

        audio.ontimeupdate = () => {
          if (!mounted) return;
          const pct = (audio.currentTime / audio.duration) * 100;
          progressPctRef.current = pct;
          setProgress(pct);
          dispatch({ type: 'SET_TIME', payload: audio.currentTime });
          if (sentences && sentences.length > 0 && audio.duration > 0) {
            // Try timing-based match first (scaled to correct for backend bitrate estimate).
            const scaledTime = audio.currentTime / timeScale;
            let idx = sentences.findIndex(
              s => scaledTime >= s.startTime && scaledTime < s.endTime,
            );
            // Fallback: timing data is inaccurate — distribute sentences by percentage.
            if (idx < 0) {
              idx = Math.min(
                Math.floor((audio.currentTime / audio.duration) * sentences.length),
                sentences.length - 1,
              );
            }
            dispatch({ type: 'SET_SENTENCE', payload: sentences[idx].index });
          }
        };

        audio.onended = () => {
          if (!mounted) return;
          dispatch({ type: 'SET_PLAYBACK', payload: 'idle' });
          saveProgress(100, activeSentenceRef.current);
        };

      })
      .catch(() => { /* AbortError or network error — silently ignore */ });

    return () => {
      mounted = false;
      abort.abort();
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      if (audioCtxRef.current) { audioCtxRef.current.close(); audioCtxRef.current = null; }
      if (blobHolder.url) URL.revokeObjectURL(blobHolder.url);
      cancelAnimationFrame(rafRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentAudio?.audioUrl]);

  // Waveform canvas (normal mode only)
  useEffect(() => {
    const canvas  = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser || streamMode) return;
    const ctx  = canvas.getContext('2d')!;
    const data = new Uint8Array(analyser.frequencyBinCount);

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(data);
      const { width: W, height: H } = canvas;
      ctx.clearRect(0, 0, W, H);
      const barW = (W / data.length) * 2;
      data.forEach((v, i) => {
        const barH = (v / 255) * H;
        const g = ctx.createLinearGradient(0, H, 0, H - barH);
        g.addColorStop(0, '#124E66');
        g.addColorStop(1, '#748D92');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.roundRect(i * barW, H - barH, barW - 1, barH, 2);
        ctx.fill();
      });
    };
    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [state.currentAudio, streamMode]);

  // Seek-to-sentence: ReadingView dispatches this custom event when user clicks a caption.
  // If the audio blob is still loading (audioRef null), we buffer the seek time and apply
  // it inside onloadedmetadata once the audio element is ready.
  useEffect(() => {
    const handler = (e: Event) => {
      const sentenceIndex = (e as CustomEvent<number>).detail;
      const sentences     = state.currentAudio?.sentences;
      if (!sentences) return;
      // Match by stored sentence index (not array position).
      const s = sentences.find(s => s.index === sentenceIndex);
      if (!s) return;

      const audio = audioRef.current;
      if (audio) {
        // Scale estimated startTime back to actual audio time.
        const estimatedEnd = sentences[sentences.length - 1].endTime;
        const scale = estimatedEnd > 0 ? audio.duration / estimatedEnd : 1;
        audio.currentTime = s.startTime * scale;
        audio.play()
          .then(() => dispatch({ type: 'SET_PLAYBACK', payload: 'playing' }))
          .catch(() => {});
      } else {
        // Blob still loading — store estimated startTime; onloadedmetadata will scale + apply it.
        pendingSeekTimeRef.current = s.startTime;
      }
    };
    window.addEventListener('seek-to-sentence', handler);
    return () => window.removeEventListener('seek-to-sentence', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentAudio?.sentences]);

  // Volume / speed effects
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = muted ? 0 : volume;
  }, [volume, muted]);
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed]);

  // ── Toggle play ───────────────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (streamMode) {
      if (isPlaying) {
        audio.pause();
        dispatch({ type: 'SET_PLAYBACK', payload: 'paused' });
      } else {
        audio.play()
          .then(() => dispatch({ type: 'SET_PLAYBACK', payload: 'playing' }))
          .catch(() => {});
      }
      return;
    }

    if (isPlaying) {
      audio.pause();
      dispatch({ type: 'SET_PLAYBACK', payload: 'paused' });
      saveProgress(progressPctRef.current, activeSentenceRef.current);
    } else {
      audio.play();
      dispatch({ type: 'SET_PLAYBACK', payload: 'playing' });
    }
  }, [isPlaying, streamMode, dispatch, saveProgress]);

  const seek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || streamMode) return;
    const rect = e.currentTarget.getBoundingClientRect();
    audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
  }, [streamMode]);

  const skip = useCallback((delta: number) => {
    if (audioRef.current && !streamMode) {
      audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime + delta);
    }
  }, [streamMode]);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  // ── Nothing to show ───────────────────────────────────────────────────────
  if (!state.currentAudio && state.streamQueue.length === 0) return null;

  // ── Stream mode UI ────────────────────────────────────────────────────────
  if (streamMode) {
    const total = state.streamQueue.length;
    const currentText = state.streamQueue[streamIdxRef.current]?.text ?? '…';

    return (
      <div
        className="flex flex-col gap-3 rounded-2xl p-4"
        style={{
          background: 'rgba(46,57,68,0.55)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(18,78,102,0.3)',
        }}
      >
        {/* Live indicator + sentence info */}
        <div className="flex items-center gap-3">
          <motion.div
            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #124E66, #2E3944)' }}
            animate={isPlaying
              ? { boxShadow: ['0 0 10px rgba(18,78,102,0.4)', '0 0 24px rgba(18,78,102,0.7)', '0 0 10px rgba(18,78,102,0.4)'] }
              : {}}
            transition={{ repeat: Infinity, duration: 1.4 }}
          >
            <Radio size={16} style={{ color: '#D3D9D4' }} />
          </motion.div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <motion.div
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: '#124E66' }}
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ repeat: Infinity, duration: 1 }}
              />
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#748D92' }}>
                Live — Generating
              </p>
            </div>
            <p className="text-sm truncate mt-0.5" style={{ color: '#D3D9D4' }}>
              {streamBuffering ? 'Buffering next sentence…' : currentText}
            </p>
          </div>

          <span className="text-xs tabular-nums flex-shrink-0" style={{ color: '#748D92' }}>
            {streamSentenceNum}/{total}
          </span>
        </div>

        {/* Animated waveform bars (stream mode) */}
        <div className="flex items-end gap-0.5 h-8 px-1">
          {Array.from({ length: 32 }).map((_, i) => (
            <motion.div
              key={i}
              className="flex-1 rounded-sm"
              style={{ background: 'linear-gradient(to top, #124E66, #748D92)', minWidth: 2 }}
              animate={isPlaying && !streamBuffering
                ? { height: ['20%', `${30 + Math.random() * 60}%`, '20%'] }
                : { height: '8%' }}
              transition={{
                repeat: Infinity,
                duration: 0.4 + Math.random() * 0.4,
                delay: i * 0.02,
                ease: 'easeInOut',
              }}
            />
          ))}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-4">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setMuted(v => !v)}
              className="p-2 rounded-lg"
              style={{ color: '#748D92' }}
            >
              {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>
            <input
              type="range" min={0} max={1} step={0.05}
              value={muted ? 0 : volume}
              onChange={e => { setVolume(+e.target.value); setMuted(false); }}
              className="w-16 h-1"
              style={{ accentColor: '#124E66' }}
            />
          </div>

          <div className="flex flex-col items-center gap-1">
            <motion.button
              onClick={togglePlay}
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.94 }}
              className="w-11 h-11 rounded-full flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, #124E66, #2E3944)',
                border: '1px solid rgba(18,78,102,0.5)',
              }}
              animate={!isPlaying && !streamBuffering && streamIdxRef.current >= 0
                ? { boxShadow: ['0 0 0px rgba(18,78,102,0)', '0 0 18px rgba(18,78,102,0.8)', '0 0 0px rgba(18,78,102,0)'] }
                : {}}
              transition={{ repeat: Infinity, duration: 1.2 }}
            >
              {isPlaying
                ? <Pause size={18} style={{ color: '#D3D9D4' }} />
                : <Play  size={18} style={{ color: '#D3D9D4', marginLeft: 2 }} />}
            </motion.button>
            {!isPlaying && !streamBuffering && streamIdxRef.current >= 0 && (
              <p className="text-[9px] font-medium tracking-wide whitespace-nowrap" style={{ color: '#748D92' }}>
                TAP TO HEAR
              </p>
            )}
          </div>

          <DropdownSelect
            value={String(speed)}
            onChange={v => setSpeed(+v)}
            options={SPEED_OPTIONS}
            dropUp
          />
        </div>
      </div>
    );
  }

  // ── Normal mode UI (compact single bar) ──────────────────────────────────
  return (
    <div className="flex flex-col gap-2 rounded-2xl px-4 py-3"
      style={{ background: 'rgba(46,57,68,0.55)', backdropFilter: 'blur(20px)', border: '1px solid rgba(211,217,212,0.08)' }}>

      {/* Row 1: info + controls + speed */}
      <div className="flex items-center gap-3">
        {/* Pulsing orb */}
        <motion.div
          className="w-8 h-8 rounded-full flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #124E66, #2E3944)' }}
          animate={isPlaying
            ? { boxShadow: ['0 0 6px rgba(18,78,102,0.3)', '0 0 18px rgba(18,78,102,0.7)', '0 0 6px rgba(18,78,102,0.3)'] }
            : {}}
          transition={{ repeat: Infinity, duration: 1.6 }}
        />

        {/* Title + voice */}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate" style={{ color: '#D3D9D4' }}>
            {state.currentAudio!.documentName}
          </p>
          <p className="text-[10px]" style={{ color: '#748D92' }}>
            {state.currentAudio!.voice.replace('Neural', '').replace(/-/g, ' ')}
            {state.activeSentence > 0 && <span style={{ color: '#124E66' }}> · s{state.activeSentence + 1}</span>}
          </p>
        </div>

        {/* Playback controls */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => skip(-10)} className="p-1.5 rounded-lg" style={{ color: '#748D92' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#D3D9D4')}
            onMouseLeave={e => (e.currentTarget.style.color = '#748D92')}>
            <SkipBack size={15} />
          </button>
          <motion.button onClick={togglePlay} whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #124E66, #2E3944)', border: '1px solid rgba(18,78,102,0.5)' }}>
            {isPlaying
              ? <Pause size={16} style={{ color: '#D3D9D4' }} />
              : <Play  size={16} style={{ color: '#D3D9D4', marginLeft: 1 }} />}
          </motion.button>
          <button onClick={() => skip(10)} className="p-1.5 rounded-lg" style={{ color: '#748D92' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#D3D9D4')}
            onMouseLeave={e => (e.currentTarget.style.color = '#748D92')}>
            <SkipForward size={15} />
          </button>
        </div>

        {/* Volume */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => setMuted(v => !v)} className="p-1 rounded" style={{ color: '#748D92' }}>
            {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
          </button>
          <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume}
            onChange={e => { setVolume(+e.target.value); setMuted(false); }}
            className="w-14 h-1" style={{ accentColor: '#124E66' }} />
        </div>

        {/* Speed */}
        <DropdownSelect value={String(speed)} onChange={v => setSpeed(+v)} options={SPEED_OPTIONS} dropUp />
      </div>

      {/* Row 2: progress bar */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] tabular-nums flex-shrink-0" style={{ color: '#748D92' }}>{fmt(state.currentTime)}</span>
        <div className="flex-1 h-1 rounded-full cursor-pointer relative overflow-hidden"
          style={{ background: 'rgba(116,141,146,0.15)' }} onClick={seek}>
          <motion.div className="h-full rounded-full"
            style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #124E66, #748D92)' }} />
        </div>
        <span className="text-[10px] tabular-nums flex-shrink-0" style={{ color: '#748D92' }}>{fmt(duration)}</span>

        {/* Narrator inline */}
        {voices && onVoiceChange && voice !== undefined && (
          <div className="flex items-center gap-1.5 flex-shrink-0 pl-2 border-l"
            style={{ borderColor: 'rgba(116,141,146,0.15)' }}>
            <Mic size={11} style={{ color: '#748D92' }} />
            <DropdownSelect value={voice} onChange={onVoiceChange} options={voices} dropUp maxListHeight={180} />
            {onRegenerate && (
              <button onClick={onRegenerate}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-all"
                style={{ background: 'rgba(18,78,102,0.3)', border: '1px solid rgba(18,78,102,0.5)', color: '#D3D9D4' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(18,78,102,0.5)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(18,78,102,0.3)')}>
                <RefreshCw size={9} className={generating ? 'animate-spin' : ''} />
                {generating ? 'Stop' : 'Re-gen'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
