import type { Metadata } from 'next';
import './globals.css';
import { AppProvider } from '@/context/AppContext';

export const metadata: Metadata = {
  title: 'Lesly Refresh Reader',
  description: 'A cinematic AI audiobook experience. Voice-entry only.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body style={{ background: '#212A31', overflow: 'hidden', height: '100vh', width: '100vw' }}>
        <AppProvider>
          {children}
        </AppProvider>
      </body>
    </html>
  );
}
