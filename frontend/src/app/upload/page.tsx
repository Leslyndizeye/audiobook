'use client';

import { AnimatePresence } from 'framer-motion';
import IntroGate from '@/components/intro/IntroGate';
import Dashboard from '@/components/dashboard/Dashboard';
import { useApp } from '@/context/AppContext';

export default function UploadPage() {
  const { state, dispatch } = useApp();
  return (
    <main className="fixed inset-0 overflow-hidden" style={{ background: '#050508' }}>
      <AnimatePresence mode="wait">
        {!state.unlocked ? (
          <IntroGate key="intro" onUnlock={() => dispatch({ type: 'UNLOCK' })} />
        ) : (
          <Dashboard key="dashboard" defaultTab="upload" />
        )}
      </AnimatePresence>
    </main>
  );
}
