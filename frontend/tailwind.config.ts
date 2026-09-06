import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        teal: {
          DEFAULT: '#124E66',
          light:   '#1a6b8a',
          dark:    '#0d3a4d',
          glow:    'rgba(18,78,102,0.5)',
        },
        slate: {
          darkest: '#212A31',
          dark:    '#2E3944',
          mid:     '#748D92',
          light:   '#D3D9D4',
        },
        dark: {
          void: '#212A31',
          card: '#2E3944',
        },
      },
      fontFamily: {
        cinematic: ['Cinzel', 'serif'],
        body:      ['Inter', 'sans-serif'],
      },
      animation: {
        'spin-slow':    'spin 8s linear infinite',
        'spin-reverse': 'spinReverse 12s linear infinite',
        'shimmer':      'shimmer 3s linear infinite',
        'float':        'float 6s ease-in-out infinite',
        'waveform':     'waveform 1.2s ease-in-out infinite',
        'pulse-teal':   'pulseTeal 2s ease-in-out infinite',
      },
      keyframes: {
        spinReverse: {
          from: { transform: 'rotate(360deg)' },
          to:   { transform: 'rotate(0deg)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition: '200% center' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':      { transform: 'translateY(-12px)' },
        },
        waveform: {
          '0%, 100%': { transform: 'scaleY(0.3)' },
          '50%':      { transform: 'scaleY(1)' },
        },
        pulseTeal: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(18,78,102,0.4), 0 0 60px rgba(18,78,102,0.2)' },
          '50%':      { boxShadow: '0 0 40px rgba(18,78,102,0.8), 0 0 100px rgba(18,78,102,0.4)' },
        },
      },
      boxShadow: {
        teal:     '0 0 30px rgba(18,78,102,0.5)',
        'teal-lg':'0 0 60px rgba(18,78,102,0.4), 0 0 120px rgba(18,78,102,0.2)',
        glass:    '0 8px 32px rgba(0,0,0,0.4)',
      },
    },
  },
  plugins: [],
};

export default config;
