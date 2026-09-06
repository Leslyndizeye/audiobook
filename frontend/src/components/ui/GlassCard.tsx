'use client';
import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';

interface CardProps {
  children: ReactNode;
  className?: string;
  teal?: boolean;
  hover?: boolean;
  onClick?: () => void;
}

export function GlassCard({ children, className, teal, hover, onClick }: CardProps) {
  return (
    <motion.div
      onClick={onClick}
      whileHover={hover ? { scale: 1.01, y: -2 } : {}}
      className={clsx('rounded-2xl p-4 transition-shadow duration-300', className)}
      style={{
        background: teal ? 'rgba(18,78,102,0.18)' : 'rgba(46,57,68,0.55)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: teal
          ? '1px solid rgba(18,78,102,0.35)'
          : '1px solid rgba(211,217,212,0.08)',
        cursor: hover ? 'pointer' : undefined,
      }}
    >
      {children}
    </motion.div>
  );
}

export function GlowButton({
  children, onClick, className, variant = 'teal', disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  variant?: 'teal' | 'slate' | 'ghost';
  disabled?: boolean;
}) {
  const styles: Record<string, React.CSSProperties> = {
    teal:  { background: 'linear-gradient(135deg, #124E66, #2E3944)', color: '#D3D9D4', border: '1px solid rgba(18,78,102,0.5)' },
    slate: { background: 'linear-gradient(135deg, #2E3944, #212A31)', color: '#D3D9D4', border: '1px solid rgba(116,141,146,0.2)' },
    ghost: { background: 'rgba(46,57,68,0.4)', color: '#748D92',      border: '1px solid rgba(211,217,212,0.08)' },
  };
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      className={clsx(
        'px-5 py-2.5 rounded-xl font-medium text-sm tracking-wide transition-all duration-200',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        className,
      )}
      style={styles[variant]}
    >
      {children}
    </motion.button>
  );
}
