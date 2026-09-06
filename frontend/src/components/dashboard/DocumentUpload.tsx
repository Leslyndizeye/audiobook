'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, XCircle, Loader2, Mic, BookOpen, Clock, Hash,
  BookMarked, FileText, ChevronDown, ChevronUp,
} from 'lucide-react';
import { documents } from '@/lib/api';
import { useApp } from '@/context/AppContext';
import type { Document } from '@/types';

const ACCEPTED = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'text/plain': ['.txt'],
  'application/rtf': ['.rtf'],
  'application/vnd.oasis.opendocument.text': ['.odt'],
};

const DOC_TYPE_COLORS: Record<string, string> = {
  book:     '#818cf8',
  article:  '#60a5fa',
  letter:   '#34d399',
  academic: '#f59e0b',
  legal:    '#94a3b8',
  poetry:   '#818cf8',
  script:   '#64748b',
  report:   '#38bdf8',
  resume:   '#06b6d4',
  other:    '#748D92',
};

interface Props {
  onGenerate?: () => void;
}

function formatSize(bytes: number) {
  if (bytes < 1024)      return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

export default function DocumentUpload({ onGenerate }: Props) {
  const { dispatch } = useApp();
  const [uploading, setUploading] = useState(false);
  const [error, setError]         = useState('');
  const [uploadedDoc, setUploadedDoc] = useState<Document | null>(null);
  const [chaptersOpen, setChaptersOpen] = useState(false);

  const onDrop = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setUploading(true);
    setError('');
    setUploadedDoc(null);
    try {
      const doc = await documents.upload(file);
      dispatch({ type: 'SET_DOCUMENT', payload: doc });
      setUploadedDoc(doc);
    } catch {
      setError('Upload failed. Please check the file and try again.');
    } finally {
      setUploading(false);
    }
  }, [dispatch]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: ACCEPTED, maxFiles: 1, multiple: false,
  });

  const analysis = uploadedDoc?.analysis;
  const typeColor = analysis ? (DOC_TYPE_COLORS[analysis.type] ?? '#748D92') : '#748D92';

  return (
    <div className="flex flex-col gap-4">

      {/* Drop zone */}
      <div
        {...getRootProps()}
        className="relative rounded-2xl border-2 border-dashed transition-all duration-300 cursor-pointer p-10
          flex flex-col items-center gap-4 text-center group"
        style={{
          borderColor: isDragActive ? '#124E66' : 'rgba(116,141,146,0.2)',
          background: isDragActive ? 'rgba(18,78,102,0.08)' : 'rgba(46,57,68,0.3)',
          boxShadow: isDragActive ? '0 0 30px rgba(18,78,102,0.2)' : 'none',
        }}
      >
        <input {...getInputProps()} />
        <AnimatePresence>
          {isDragActive && (
            <motion.div
              className="absolute inset-0 rounded-2xl pointer-events-none"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ background: 'radial-gradient(circle at center, rgba(18,78,102,0.1), transparent)' }}
            />
          )}
        </AnimatePresence>

        {uploading ? (
          <Loader2 size={40} className="animate-spin" style={{ color: '#124E66' }} />
        ) : (
          <motion.div
            animate={isDragActive ? { scale: 1.15, rotate: 5 } : { scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 300 }}
          >
            <Upload size={40} style={{ color: isDragActive ? '#124E66' : '#748D92' }} />
          </motion.div>
        )}

        <div>
          <p className="font-medium" style={{ color: '#D3D9D4' }}>
            {uploading ? 'Uploading & analyzing…' : isDragActive ? 'Drop it here…' : 'Drop a document or click to browse'}
          </p>
          <p className="text-xs mt-1" style={{ color: '#748D92' }}>
            PDF · DOCX · TXT · RTF · ODT · up to 50 MB
          </p>
        </div>
      </div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm"
            style={{ background: 'rgba(180,40,40,0.1)', border: '1px solid rgba(180,40,40,0.3)', color: '#f87171' }}
          >
            <XCircle size={16} />
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success card — shows analysis */}
      <AnimatePresence>
        {uploadedDoc && !uploading && (
          <motion.div
            key={uploadedDoc.id}
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ type: 'spring', stiffness: 280, damping: 24 }}
            className="rounded-2xl p-5 flex flex-col gap-4"
            style={{ background: 'rgba(18,78,102,0.12)', border: '1px solid rgba(18,78,102,0.3)' }}
          >
            {/* Doc name + type badge */}
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: analysis ? `${typeColor}18` : 'rgba(46,57,68,0.8)', border: `1px solid ${typeColor}30` }}>
                {analysis?.type === 'book' ? <BookOpen size={18} style={{ color: typeColor }} />
                  : analysis?.type === 'resume' ? <Mic size={18} style={{ color: typeColor }} />
                  : <FileText size={18} style={{ color: analysis ? typeColor : '#748D92' }} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: '#D3D9D4' }}>
                  {uploadedDoc.name}
                </p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-[10px] font-semibold uppercase" style={{ color: '#748D92' }}>
                    {uploadedDoc.type}
                  </span>
                  <span className="text-[10px]" style={{ color: '#748D92' }}>
                    {formatSize(uploadedDoc.size)}
                  </span>
                  {uploadedDoc.page_count && (
                    <span className="text-[10px]" style={{ color: '#748D92' }}>
                      {uploadedDoc.page_count} pages
                    </span>
                  )}
                </div>
              </div>
              {analysis && (
                <span
                  className="text-[10px] font-bold px-2.5 py-1 rounded-full capitalize flex-shrink-0"
                  style={{ background: `${typeColor}22`, color: typeColor, border: `1px solid ${typeColor}44` }}
                >
                  {analysis.subtype || analysis.type}
                </span>
              )}
            </div>

            {/* Analysis stats */}
            {analysis && (
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                  style={{ background: 'rgba(33,42,49,0.6)', border: '1px solid rgba(116,141,146,0.1)' }}>
                  <Mic size={12} style={{ color: '#748D92' }} />
                  <div>
                    <p className="text-[10px]" style={{ color: '#748D92' }}>Listening time</p>
                    <p className="text-xs font-semibold" style={{ color: '#D3D9D4' }}>
                      ~{analysis.metadata.estimatedListeningMinutes} min
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                  style={{ background: 'rgba(33,42,49,0.6)', border: '1px solid rgba(116,141,146,0.1)' }}>
                  <Clock size={12} style={{ color: '#748D92' }} />
                  <div>
                    <p className="text-[10px]" style={{ color: '#748D92' }}>Reading time</p>
                    <p className="text-xs font-semibold" style={{ color: '#D3D9D4' }}>
                      ~{analysis.metadata.estimatedReadingMinutes} min
                    </p>
                  </div>
                </div>

                {uploadedDoc.word_count && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                    style={{ background: 'rgba(33,42,49,0.6)', border: '1px solid rgba(116,141,146,0.1)' }}>
                    <Hash size={12} style={{ color: '#748D92' }} />
                    <div>
                      <p className="text-[10px]" style={{ color: '#748D92' }}>Words</p>
                      <p className="text-xs font-semibold" style={{ color: '#D3D9D4' }}>
                        {uploadedDoc.word_count.toLocaleString()}
                      </p>
                    </div>
                  </div>
                )}

                {analysis.chapters.length > 0 && (
                  <button
                    onClick={() => setChaptersOpen(v => !v)}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-left w-full transition-all"
                    style={{ background: chaptersOpen ? 'rgba(129,140,248,0.12)' : 'rgba(33,42,49,0.6)', border: `1px solid ${chaptersOpen ? 'rgba(129,140,248,0.3)' : 'rgba(116,141,146,0.1)'}` }}
                  >
                    <BookMarked size={12} style={{ color: chaptersOpen ? '#818cf8' : '#748D92' }} />
                    <div className="flex-1">
                      <p className="text-[10px]" style={{ color: chaptersOpen ? '#818cf8' : '#748D92' }}>Chapters</p>
                      <p className="text-xs font-semibold" style={{ color: '#D3D9D4' }}>
                        {analysis.chapters.length} detected
                      </p>
                    </div>
                    {chaptersOpen ? <ChevronUp size={11} style={{ color: '#818cf8' }} /> : <ChevronDown size={11} style={{ color: '#748D92' }} />}
                  </button>
                )}
              </div>
            )}

            {/* Chapter list */}
            <AnimatePresence>
              {chaptersOpen && analysis && analysis.chapters.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  style={{ overflow: 'hidden' }}
                >
                  <div
                    className="flex flex-col gap-0.5 rounded-xl p-2 max-h-52 overflow-y-auto scroll-area"
                    style={{ background: 'rgba(20,28,34,0.7)', border: '1px solid rgba(129,140,248,0.2)' }}
                  >
                    {analysis.chapters.map((ch, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs"
                        style={{ color: '#D3D9D4' }}
                      >
                        <span className="tabular-nums flex-shrink-0 text-[10px]"
                          style={{ color: 'rgba(129,140,248,0.55)', minWidth: 20 }}>
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span className="truncate">{ch.title}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Detected title/author */}
            {analysis?.metadata.title && (
              <div className="px-3 py-2 rounded-xl"
                style={{ background: 'rgba(33,42,49,0.5)', border: '1px solid rgba(116,141,146,0.08)' }}>
                <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: '#748D92' }}>Detected</p>
                <p className="text-xs font-medium" style={{ color: '#D3D9D4' }}>{analysis.metadata.title}</p>
                {analysis.metadata.author && (
                  <p className="text-[10px] mt-0.5" style={{ color: '#748D92' }}>by {analysis.metadata.author}</p>
                )}
              </div>
            )}

            {/* Generate button */}
            {onGenerate && (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={onGenerate}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all"
                style={{
                  background: 'linear-gradient(135deg, #124E66, #2E3944)',
                  border: '1px solid rgba(18,78,102,0.6)',
                  color: '#D3D9D4',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'linear-gradient(135deg, #1a6480, #3a4a57)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'linear-gradient(135deg, #124E66, #2E3944)')}
              >
                <Mic size={14} />
                Generate Audiobook
              </motion.button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Format chips */}
      {!uploadedDoc && (
        <div className="flex flex-wrap gap-2">
          {['PDF', 'DOCX', 'TXT', 'RTF', 'ODT'].map(f => (
            <span key={f} className="px-2.5 py-1 rounded-lg text-xs font-medium"
              style={{ background: 'rgba(46,57,68,0.6)', color: '#748D92', border: '1px solid rgba(116,141,146,0.1)' }}>
              {f}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
