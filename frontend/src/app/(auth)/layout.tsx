'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';

export default function AuthGroupLayout({ children }: { children: React.ReactNode }) {
  const { theme, toggle } = useTheme();
  return (
    <div className="min-h-screen">
      <motion.button
        onClick={toggle}
        aria-label="Toggle theme"
        whileTap={{ scale: 0.88 }}
        className="fixed top-4 right-4 z-50 grid h-11 w-11 place-items-center rounded-2xl border border-[#F1E6D8] bg-white shadow-lg cursor-pointer overflow-hidden"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={theme}
            initial={{ y: 14, opacity: 0, rotate: -90 }}
            animate={{ y: 0, opacity: 1, rotate: 0 }}
            exit={{ y: -14, opacity: 0, rotate: 90 }}
            transition={{ duration: 0.22 }}
            className="grid place-items-center"
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </motion.span>
        </AnimatePresence>
      </motion.button>
      {children}
    </div>
  );
}
