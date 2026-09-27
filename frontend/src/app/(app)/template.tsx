'use client';
import { motion } from 'framer-motion';
import { usePathname } from 'next/navigation';

/** Buttery route transitions: every navigation fades + rises into view. */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
