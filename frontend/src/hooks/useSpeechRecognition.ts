'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

const TARGET = 'jesus is the king';

function normalize(raw: string) {
  return raw.toLowerCase().replace(/[^a-z\s]/g, '').trim();
}

function isMatch(text: string) {
  const n = normalize(text);
  // exact phrase, or allow minor gaps (each word present in order)
  if (n.includes(TARGET)) return true;
  const words = TARGET.split(' ');
  let idx = 0;
  for (const w of n.split(/\s+/)) {
    if (w === words[idx]) idx++;
    if (idx === words.length) return true;
  }
  return false;
}

export function useSpeechRecognition(onMatch: () => void) {
  const [transcript, setTranscript] = useState('');
  const [listening, setListening]   = useState(false);
  const [supported, setSupported]   = useState(true);
  const [error, setError]           = useState('');
  const recognitionRef              = useRef<SpeechRecognition | null>(null);
  const matchedRef                  = useRef(false);

  const start = useCallback(() => {
    if (matchedRef.current) return;
    const SR = (window as Window & typeof globalThis & { SpeechRecognition?: new () => SpeechRecognition; webkitSpeechRecognition?: new () => SpeechRecognition }).SpeechRecognition
            || (window as Window & typeof globalThis & { SpeechRecognition?: new () => SpeechRecognition; webkitSpeechRecognition?: new () => SpeechRecognition }).webkitSpeechRecognition;
    if (!SR) { setSupported(false); return; }

    const recognition = new SR();
    recognition.lang            = 'en-US';
    recognition.continuous      = true;
    recognition.interimResults  = true;
    recognition.maxAlternatives = 3;

    recognition.onstart = () => { setListening(true); setError(''); };
    recognition.onend   = () => {
      setListening(false);
      if (!matchedRef.current) setTimeout(() => start(), 400);
    };
    recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
      setError(e.error);
      if (e.error === 'not-allowed') setSupported(false);
    };
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let currentText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        // collect best alternative text
        const texts = Array.from({ length: result.length }, (_, k) => result[k].transcript);
        const best  = texts[0] ?? '';
        currentText += best;

        // check all alternatives, both interim and final
        const matched = texts.some(t => isMatch(t));
        if (matched && !matchedRef.current) {
          matchedRef.current = true;
          recognition.stop();
          onMatch();
          return;
        }
      }
      setTranscript(normalize(currentText));
    };

    recognitionRef.current = recognition;
    try { recognition.start(); } catch { /* already running */ }
  }, [onMatch]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  useEffect(() => {
    return () => recognitionRef.current?.stop();
  }, []);

  return { transcript, listening, supported, error, start, stop };
}
