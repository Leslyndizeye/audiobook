'use client';

import {
  createContext, useContext, useReducer, ReactNode, Dispatch,
} from 'react';
import type { AppState, Document, AudioBook, HistoryItem, StreamSentence } from '@/types';

type Action =
  | { type: 'UNLOCK' }
  | { type: 'SET_DOCUMENT'; payload: Document }
  | { type: 'SET_AUDIO'; payload: AudioBook }
  | { type: 'CLEAR_AUDIO' }
  | { type: 'SET_PLAYBACK'; payload: AppState['playbackState'] }
  | { type: 'SET_TIME'; payload: number }
  | { type: 'SET_SENTENCE'; payload: number }
  | { type: 'SET_HISTORY'; payload: HistoryItem[] }
  | { type: 'ADD_HISTORY'; payload: HistoryItem }
  | { type: 'MARK_COMPLETED'; payload: { id: string; completed: boolean } }
  | { type: 'SET_HISTORY_ITEM_ID'; payload: string | null }
  | { type: 'DELETE_HISTORY'; payload: string }
  | { type: 'RESET_RESUME'; payload: string }
  | { type: 'PUSH_STREAM_SENTENCE'; payload: StreamSentence }
  | { type: 'CLEAR_STREAM_QUEUE' }
  | { type: 'SET_STREAM_DONE'; payload: boolean }
  | { type: 'LOGOUT' };

const initial: AppState = {
  // Read from sessionStorage so page navigations don't force re-entry
  unlocked: typeof window !== 'undefined' && sessionStorage.getItem('_lr_u') === '1',
  currentDocument: null,
  currentAudio: null,
  playbackState: 'idle',
  currentTime: 0,
  activeSentence: 0,
  history: [],
  historyItemId: null,
  streamQueue: [],
  streamDone: true,
};

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'UNLOCK':
      if (typeof window !== 'undefined') sessionStorage.setItem('_lr_u', '1');
      return { ...state, unlocked: true };
    case 'SET_DOCUMENT':        return { ...state, currentDocument: action.payload };
    case 'SET_AUDIO':           return { ...state, currentAudio: action.payload };
    case 'CLEAR_AUDIO':         return { ...state, currentAudio: null, activeSentence: 0 };
    case 'SET_PLAYBACK':        return { ...state, playbackState: action.payload };
    case 'SET_TIME':            return { ...state, currentTime: action.payload };
    case 'SET_SENTENCE':        return { ...state, activeSentence: action.payload };
    case 'SET_HISTORY':         return { ...state, history: action.payload };
    case 'ADD_HISTORY':         return { ...state, history: [action.payload, ...state.history] };
    case 'SET_HISTORY_ITEM_ID': return { ...state, historyItemId: action.payload };
    case 'MARK_COMPLETED':  return {
      ...state,
      history: state.history.map(h =>
        h.id === action.payload.id ? { ...h, completed: action.payload.completed } : h
      ),
    };
    case 'DELETE_HISTORY':  return { ...state, history: state.history.filter(h => h.id !== action.payload) };
    case 'RESET_RESUME':    return {
      ...state,
      history: state.history.map(h =>
        h.id === action.payload ? { ...h, resumeSentence: 0, progress: 0, completed: false } : h
      ),
    };
    case 'PUSH_STREAM_SENTENCE': return { ...state, streamQueue: [...state.streamQueue, action.payload] };
    case 'CLEAR_STREAM_QUEUE':   return { ...state, streamQueue: [], streamDone: true };
    case 'SET_STREAM_DONE':      return { ...state, streamDone: action.payload };
    case 'LOGOUT':
      if (typeof window !== 'undefined') sessionStorage.removeItem('_lr_u');
      return { ...initial, unlocked: false };
    default: return state;
  }
}

const Ctx = createContext<{ state: AppState; dispatch: Dispatch<Action> } | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);
  return <Ctx.Provider value={{ state, dispatch }}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be inside AppProvider');
  return ctx;
}
