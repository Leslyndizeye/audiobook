'use client';

import { useEffect, useRef, useState } from 'react';

export function useAudioAnalyser() {
  const [level, setLevel]       = useState(0);
  const [bars, setBars]         = useState<number[]>(Array(32).fill(0));
  const ctxRef                  = useRef<AudioContext | null>(null);
  const analyserRef             = useRef<AnalyserNode | null>(null);
  const streamRef               = useRef<MediaStream | null>(null);
  const rafRef                  = useRef<number>(0);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyserRef.current = analyser;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);

      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setLevel(avg / 255);
        setBars(Array.from(data.slice(0, 32)).map(v => v / 255));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      // Microphone not available — graceful fallback
    }
  };

  const stop = () => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    ctxRef.current?.close();
    setLevel(0);
    setBars(Array(32).fill(0));
  };

  useEffect(() => () => stop(), []);

  return { level, bars, start, stop };
}
