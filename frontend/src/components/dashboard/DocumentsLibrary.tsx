'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText, FileType, File, Trash2, CheckCircle2,
  RefreshCw, Loader2, BookOpen, AlertCircle, ScanSearch,
  Briefcase, GraduationCap, Newspaper, Mail, Scale, Film,
  BarChart2, Feather, HelpCircle, ChevronDown, ChevronRight,
  BookMarked,
} from 'lucide-react';
import { documents as docsApi } from '@/lib/api';
import { useApp } from '@/context/AppContext';
import type { Document, DocumentAnalysis } from '@/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatSize(bytes: number) {
  if (bytes < 1024)      return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function formatDate(iso: string | Date | undefined) {
  if (!iso) return '—';
  return new Date(iso as string).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

// ── Category config ───────────────────────────────────────────────────────────

const CATEGORY_ORDER = [
  'resume', 'book', 'academic', 'article', 'report',
  'letter', 'legal', 'poetry', 'script', 'other', 'unanalyzed',
];

const CATEGORY_META: Record<string, { label: string; color: string; Icon: React.ElementType }> = {
  resume:     { label: 'Resumes & CVs',       color: '#06b6d4', Icon: Briefcase     },
  book:       { label: 'Books',                color: '#818cf8', Icon: BookOpen      },
  academic:   { label: 'Academic Papers',      color: '#f59e0b', Icon: GraduationCap },
  article:    { label: 'Articles',             color: '#60a5fa', Icon: Newspaper     },
  report:     { label: 'Reports',              color: '#38bdf8', Icon: BarChart2     },
  letter:     { label: 'Letters',              color: '#34d399', Icon: Mail          },
  legal:      { label: 'Legal Documents',      color: '#94a3b8', Icon: Scale         },
  poetry:     { label: 'Poetry',               color: '#818cf8', Icon: Feather       },
  script:     { label: 'Scripts',              color: '#64748b', Icon: Film          },
  other:      { label: 'Other',               color: '#748D92', Icon: File          },
  unanalyzed: { label: 'Not yet classified',   color: '#748D92', Icon: HelpCircle    },
};

const FILE_TYPE_COLORS: Record<string, string> = {
  pdf:  '#e25555',
  docx: '#3b82f6',
  txt:  '#748D92',
  rtf:  '#f59e0b',
  odt:  '#10b981',
};

function TypeIcon({ type }: { type: string }) {
  const color = FILE_TYPE_COLORS[type] ?? '#748D92';
  const Icon = type === 'pdf' ? FileType : type === 'docx' ? FileText : File;
  return (
    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
      style={{ background: `${color}18`, border: `1px solid ${color}30` }}>
      <Icon size={18} style={{ color }} />
    </div>
  );
}

function SubtypeBadge({ analysis }: { analysis: DocumentAnalysis }) {
  const color = CATEGORY_META[analysis.type]?.color ?? '#748D92';
  return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize"
      style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}>
      {analysis.subtype || analysis.type}
    </span>
  );
}

// ── Document card ─────────────────────────────────────────────────────────────

interface CardProps {
  doc: Document;
  index: number;
  isActive: boolean;
  isDeleting: boolean;
  isAnalyzing: boolean;
  onSelect: () => void;
  onAnalyze: () => void;
  onDelete: () => void;
}

function DocCard({ doc, index, isActive, isDeleting, isAnalyzing, onSelect, onAnalyze, onDelete }: CardProps) {
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const chapters = doc.analysis?.chapters ?? [];
  const hasChapters = chapters.length > 0;

  return (
    <motion.div
      key={doc.id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20, height: 0, marginBottom: 0 }}
      transition={{ delay: index * 0.03, duration: 0.2 }}
      className="flex flex-col rounded-2xl group transition-all duration-200 overflow-hidden"
      style={{
        background: isActive ? 'rgba(18,78,102,0.2)' : 'rgba(46,57,68,0.4)',
        border: `1px solid ${isActive ? 'rgba(18,78,102,0.45)' : 'rgba(211,217,212,0.06)'}`,
      }}
      onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(18,78,102,0.25)'; }}
      onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.borderColor = isActive ? 'rgba(18,78,102,0.45)' : 'rgba(211,217,212,0.06)'; }}
    >
      {/* Main row */}
      <div className="flex items-center gap-4 p-4">
        <TypeIcon type={doc.type} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium truncate" style={{ color: '#D3D9D4' }}>{doc.name}</p>
            {isActive && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] flex-shrink-0"
                style={{ background: 'rgba(18,78,102,0.4)', color: '#748D92' }}>
                <CheckCircle2 size={9} style={{ color: '#124E66' }} />
                Selected
              </span>
            )}
            {doc.analysis && <SubtypeBadge analysis={doc.analysis} />}
          </div>
          {/* Compact single-row metadata — dots as separators, no wrapping */}
          <div className="flex items-center gap-1.5 mt-1 overflow-hidden" style={{ color: '#748D92' }}>
            <span className="text-[10px] font-semibold uppercase flex-shrink-0"
              style={{ color: FILE_TYPE_COLORS[doc.type] ?? '#748D92' }}>
              {doc.type}
            </span>
            <span className="text-[10px] flex-shrink-0" style={{ color: '#2E3944' }}>·</span>
            <span className="text-[10px] flex-shrink-0">{formatSize(doc.size)}</span>
            {doc.page_count != null && (
              <>
                <span className="text-[10px] flex-shrink-0" style={{ color: '#2E3944' }}>·</span>
                <span className="text-[10px] flex-shrink-0">{doc.page_count}p</span>
              </>
            )}
            {doc.word_count != null && (
              <>
                <span className="text-[10px] flex-shrink-0" style={{ color: '#2E3944' }}>·</span>
                <span className="text-[10px] flex-shrink-0">~{(doc.word_count / 1000).toFixed(0)}k words</span>
              </>
            )}
            {hasChapters && (
              <>
                <span className="text-[10px] flex-shrink-0" style={{ color: '#2E3944' }}>·</span>
                <button
                  onClick={() => setChaptersOpen(v => !v)}
                  className="flex items-center gap-0.5 text-[10px] flex-shrink-0 rounded px-1 transition-all"
                  style={{ color: chaptersOpen ? '#818cf8' : '#748D92' }}
                >
                  <BookMarked size={9} />
                  {chapters.length} ch.
                  {chaptersOpen ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
                </button>
              </>
            )}
            {doc.analysis?.metadata.estimatedListeningMinutes && (
              <>
                <span className="text-[10px] flex-shrink-0" style={{ color: '#2E3944' }}>·</span>
                <span className="text-[10px] flex-shrink-0">~{doc.analysis.metadata.estimatedListeningMinutes}m</span>
              </>
            )}
            {doc.uploadedAt && (
              <>
                <span className="text-[10px] flex-shrink-0" style={{ color: '#2E3944' }}>·</span>
                <span className="text-[10px] truncate" style={{ color: 'rgba(116,141,146,0.6)' }}>
                  {formatDate(doc.uploadedAt)}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {!isActive && (
            <motion.button
              whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
              onClick={onSelect}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all opacity-0 group-hover:opacity-100"
              style={{ background: 'rgba(18,78,102,0.3)', border: '1px solid rgba(18,78,102,0.5)', color: '#D3D9D4' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(18,78,102,0.5)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(18,78,102,0.3)')}
            >
              Use this
            </motion.button>
          )}
          <motion.button
            whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}
            onClick={onAnalyze}
            disabled={isAnalyzing}
            title={doc.analysis ? 'Re-analyze' : 'Classify document'}
            className="p-2 rounded-lg transition-all opacity-0 group-hover:opacity-100"
            style={{ color: '#748D92' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#06b6d4'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(6,182,212,0.12)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#748D92'; (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
          >
            {isAnalyzing ? <Loader2 size={14} className="animate-spin" /> : <ScanSearch size={14} />}
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}
            onClick={onDelete}
            disabled={isDeleting}
            className="p-2 rounded-lg transition-all opacity-0 group-hover:opacity-100"
            style={{ color: '#748D92' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#f87171'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(180,40,40,0.15)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#748D92'; (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
          >
            {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          </motion.button>
        </div>
      </div>

      {/* Chapter list (expandable) */}
      <AnimatePresence>
        {chaptersOpen && hasChapters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: 'hidden' }}
          >
            <div
              className="mx-4 mb-4 rounded-xl p-2 flex flex-col gap-0.5 max-h-48 overflow-y-auto scroll-area"
              style={{ background: 'rgba(20,28,34,0.7)', border: '1px solid rgba(129,140,248,0.18)' }}
            >
              {chapters.map((ch, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs"
                >
                  <span className="tabular-nums text-[10px] flex-shrink-0"
                    style={{ color: 'rgba(129,140,248,0.5)', minWidth: 22 }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="truncate" style={{ color: '#D3D9D4' }}>{ch.title}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Category section ──────────────────────────────────────────────────────────

interface SectionProps {
  categoryKey: string;
  docs: Document[];
  startIndex: number;
  activeId: string | null;
  deleting: string | null;
  analyzing: string | null;
  onSelect: (doc: Document) => void;
  onAnalyze: (doc: Document) => void;
  onDelete: (doc: Document) => void;
}

function CategorySection({
  categoryKey, docs, startIndex,
  activeId, deleting, analyzing,
  onSelect, onAnalyze, onDelete,
}: SectionProps) {
  const [open, setOpen] = useState(true);
  const meta = CATEGORY_META[categoryKey] ?? CATEGORY_META.other;
  const { Icon, label, color } = meta;

  return (
    <div className="flex flex-col gap-2">
      {/* Section header */}
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2.5 px-1 py-1 rounded-lg transition-all w-full text-left"
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(46,57,68,0.4)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: `${color}18`, border: `1px solid ${color}30` }}>
          <Icon size={12} style={{ color }} />
        </div>
        <span className="text-xs font-semibold uppercase tracking-wider flex-1" style={{ color }}>
          {label}
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full"
          style={{ background: `${color}18`, color }}>
          {docs.length}
        </span>
        {open
          ? <ChevronDown size={12} style={{ color: '#748D92' }} />
          : <ChevronRight size={12} style={{ color: '#748D92' }} />}
      </button>

      {/* Cards */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: 'hidden' }}
            className="flex flex-col gap-2 pl-2"
          >
            {docs.map((doc, i) => (
              <DocCard
                key={doc.id}
                doc={doc}
                index={startIndex + i}
                isActive={activeId === doc.id}
                isDeleting={deleting === doc.id}
                isAnalyzing={analyzing === doc.id}
                onSelect={() => onSelect(doc)}
                onAnalyze={() => onAnalyze(doc)}
                onDelete={() => onDelete(doc)}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  onSelect?: () => void;
}

export default function DocumentsLibrary({ onSelect }: Props) {
  const { state, dispatch } = useApp();
  const [docs, setDocs]         = useState<Document[]>([]);
  const [loading, setLoading]   = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [error, setError]       = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setDocs(await docsApi.list()); }
    catch { setError('Could not load documents. Is the backend running?'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSelect = (doc: Document) => {
    dispatch({ type: 'SET_DOCUMENT', payload: doc });
    onSelect?.();
  };

  const handleAnalyze = async (doc: Document) => {
    setAnalyzing(doc.id);
    try {
      const updated = await docsApi.analyze(doc.id);
      setDocs(prev => prev.map(d => d.id === updated.id ? updated : d));
      if (state.currentDocument?.id === updated.id)
        dispatch({ type: 'SET_DOCUMENT', payload: updated });
    } catch { /* silent */ }
    finally { setAnalyzing(null); }
  };

  const handleDelete = async (doc: Document) => {
    setDeleting(doc.id);
    try {
      await docsApi.delete(doc.id);
      setDocs(prev => prev.filter(d => d.id !== doc.id));
      if (state.currentDocument?.id === doc.id)
        dispatch({ type: 'SET_DOCUMENT', payload: null as unknown as Document });
    } catch { /* silent */ }
    finally { setDeleting(null); }
  };

  // Group documents by detected category
  const grouped = docs.reduce<Record<string, Document[]>>((acc, doc) => {
    const key = doc.analysis?.type ?? 'unanalyzed';
    if (!acc[key]) acc[key] = [];
    acc[key].push(doc);
    return acc;
  }, {});

  // Sort each group newest-first (already sorted from API, but ensure it)
  const orderedKeys = CATEGORY_ORDER.filter(k => grouped[k]?.length);

  // Running index for staggered animations
  let cardIndex = 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-widest" style={{ color: '#748D92' }}>
          {docs.length} document{docs.length !== 1 ? 's' : ''} · {orderedKeys.length} categor{orderedKeys.length !== 1 ? 'ies' : 'y'}
        </p>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all"
          style={{ background: 'rgba(46,57,68,0.6)', border: '1px solid rgba(116,141,146,0.15)', color: '#748D92' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#D3D9D4')}
          onMouseLeave={e => (e.currentTarget.style.color = '#748D92')}
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-center gap-2 px-4 py-3 rounded-xl text-xs"
            style={{ background: 'rgba(180,40,40,0.1)', border: '1px solid rgba(180,40,40,0.3)', color: '#f87171' }}
          >
            <AlertCircle size={14} />{error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading skeleton */}
      {loading && !error && (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-3 p-4 rounded-2xl"
              style={{ background: 'rgba(46,57,68,0.35)', border: '1px solid rgba(211,217,212,0.05)' }}>
              <div className="w-10 h-10 rounded-xl animate-pulse" style={{ background: 'rgba(116,141,146,0.15)' }} />
              <div className="flex-1 flex flex-col gap-2">
                <div className="h-3 w-2/3 rounded animate-pulse" style={{ background: 'rgba(116,141,146,0.15)' }} />
                <div className="h-2 w-1/3 rounded animate-pulse" style={{ background: 'rgba(116,141,146,0.1)' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && docs.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center gap-4 py-16 rounded-2xl"
          style={{ background: 'rgba(46,57,68,0.3)', border: '1px solid rgba(211,217,212,0.06)' }}
        >
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(46,57,68,0.8)' }}>
            <BookOpen size={24} style={{ color: '#748D92' }} />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium" style={{ color: '#D3D9D4' }}>No documents yet</p>
            <p className="text-xs mt-1" style={{ color: '#748D92' }}>Upload a PDF, DOCX, or TXT in the Upload tab</p>
          </div>
        </motion.div>
      )}

      {/* Categorized sections */}
      {!loading && docs.length > 0 && (
        <div className="flex flex-col gap-5">
          {orderedKeys.map(key => {
            const section = grouped[key];
            const sectionStart = cardIndex;
            cardIndex += section.length;
            return (
              <CategorySection
                key={key}
                categoryKey={key}
                docs={section}
                startIndex={sectionStart}
                activeId={state.currentDocument?.id ?? null}
                deleting={deleting}
                analyzing={analyzing}
                onSelect={handleSelect}
                onAnalyze={handleAnalyze}
                onDelete={handleDelete}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
