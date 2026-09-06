import axios from 'axios';
import type { Document, AudioBook, HistoryItem } from '@/types';

const BASE = process.env.NEXT_PUBLIC_API_URL || '/api';
const api  = axios.create({ baseURL: BASE });

// Rewrite absolute backend audioUrl values (http://localhost:8000/audio/…)
// so they go through the Next.js /api proxy instead of hitting port 8000 directly.
function rewriteAudioUrl(url: string): string {
  try {
    const { pathname } = new URL(url);
    return `/api${pathname}`;
  } catch {
    return url; // already relative — leave as-is
  }
}

api.interceptors.response.use(res => {
  if (res.data?.audioUrl) {
    res.data.audioUrl = rewriteAudioUrl(res.data.audioUrl);
  }
  if (Array.isArray(res.data)) {
    res.data.forEach((item: Record<string, unknown>) => {
      if (typeof item?.audioUrl === 'string') {
        item.audioUrl = rewriteAudioUrl(item.audioUrl);
      }
    });
  }
  return res;
});

export const documents = {
  upload: async (file: File): Promise<Document> => {
    const fd = new FormData();
    fd.append('file', file);
    const { data } = await api.post('/documents/upload', fd);
    return data;
  },
  list: async (): Promise<Document[]> => {
    const { data } = await api.get('/documents');
    return data;
  },
  delete: async (id: string) => api.delete(`/documents/${id}`),
  analyze: async (id: string): Promise<Document> => {
    const { data } = await api.post(`/documents/${id}/analyze`);
    return data;
  },
};

export interface GenerateProgress {
  type: 'start' | 'progress' | 'done' | 'error';
  total?: number;
  index?: number;
  pct?: number;
  sentence?: string;
  sentenceAudioB64?: string;
  document?: string;
  audiobookId?: string;
  historyItemId?: string;
  audioUrl?: string;
  duration?: number;
  message?: string;
}

export const audio = {
  /** Streaming generate — calls onProgress for each SSE event, resolves when done */
  generateStream: async (
    params: { documentId: string; voice: string; speed: number; pitch: number },
    onProgress: (e: GenerateProgress) => void,
    signal?: AbortSignal,
  ): Promise<{ audiobookId: string; historyItemId: string }> => {
    const response = await fetch(`${BASE}/audio/generate-stream`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(params),
      signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const reader  = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer    = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const evt: GenerateProgress = JSON.parse(line.slice(6));
          onProgress(evt);
          if (evt.type === 'done')
            return { audiobookId: evt.audiobookId!, historyItemId: evt.historyItemId! };
          if (evt.type === 'error')
            throw new Error(evt.message ?? 'Generation failed');
        } catch { /* skip malformed line */ }
      }
    }
    throw new Error('Stream ended unexpectedly');
  },

  /** Legacy blocking generate */
  generate: async (
    params: { documentId: string; voice: string; speed: number; pitch: number },
    signal?: AbortSignal,
  ): Promise<AudioBook> => {
    const { data } = await api.post('/audio/generate', params, { signal });
    return data;
  },

  status: async (id: string): Promise<AudioBook> => {
    const { data } = await api.get(`/audio/${id}`);
    return data;
  },
  stream: (id: string) => `${BASE}/audio/${id}/stream`,
  voices: async (): Promise<string[]> => {
    const { data } = await api.get('/audio/voices');
    return data;
  },
};

export const history = {
  list: async (): Promise<HistoryItem[]> => {
    const { data } = await api.get('/history');
    return data;
  },
  updateProgress: async (id: string, progress: number, resumeSentence?: number) =>
    api.patch(`/history/${id}`, { progress, resume_sentence: resumeSentence }),
  markCompleted: async (id: string, completed: boolean) =>
    api.patch(`/history/${id}`, { completed }),
  delete: async (id: string) =>
    api.delete(`/history/${id}`),
  resetResume: async (id: string) =>
    api.post(`/history/${id}/reset-resume`),
};
