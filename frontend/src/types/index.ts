export interface DocumentChapter {
  title: string;
  charOffset: number;
  wordOffset: number;
  wordCount?: number;   // words from this chapter start to the next
}

export interface DocumentAnalysis {
  type: 'book' | 'article' | 'letter' | 'academic' | 'legal' | 'poetry' | 'script' | 'report' | 'resume' | 'other';
  subtype: string;
  confidence: number;
  chapters: DocumentChapter[];
  metadata: {
    title?: string;
    author?: string;
    wordCount: number;
    estimatedReadingMinutes: number;
    estimatedListeningMinutes: number;
  };
}

export interface Document {
  id: string;
  name: string;
  type: 'pdf' | 'docx' | 'txt' | 'rtf' | 'odt';
  size: number;
  uploadedAt: string;
  page_count?: number;
  word_count?: number;
  status: 'uploading' | 'processing' | 'ready' | 'error';
  analysis?: DocumentAnalysis;
}

export interface AudioBook {
  id: string;
  documentId: string;
  documentName: string;
  voice: string;
  speed: number;
  pitch: number;
  duration: number;
  audioUrl: string;
  sentences: Sentence[];
  createdAt: string;
  status: 'generating' | 'ready' | 'error';
}

export interface Sentence {
  index: number;
  text: string;
  startTime: number;
  endTime: number;
}

export interface HistoryItem {
  id: string;
  documentName: string;
  voice: string;
  duration: number;
  progress: number;
  lastPlayedAt: string;
  audioUrl: string;
  completed: boolean;
  resumeSentence: number;
  audiobookId: string;
  totalPages?: number;
  totalSentences: number;
  stopChapterTitle?: string;
  chapterCount: number;
}

export interface StreamSentence {
  idx: number;
  url: string;
  text: string;
}

export interface AppState {
  unlocked: boolean;
  currentDocument: Document | null;
  currentAudio: AudioBook | null;
  playbackState: 'idle' | 'loading' | 'playing' | 'paused';
  currentTime: number;
  activeSentence: number;
  history: HistoryItem[];
  historyItemId: string | null;
  streamQueue: StreamSentence[];
  streamDone: boolean;
}

// Web Speech API types
export interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

export interface SpeechRecognitionResult {
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
}

export interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}
