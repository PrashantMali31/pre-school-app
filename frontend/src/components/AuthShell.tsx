'use client';
import { motion } from 'framer-motion';
import { BadgeCheck, ClipboardCheck, Wallet } from 'lucide-react';
import React from 'react';

const FLOATERS = ['🎨', '🧸', '🌈', '📚', '⚽'];

export default function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden p-4">
      {/* ambient blobs */}
      <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-[#FF8FB1]/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-[#7C9DFF]/25 blur-3xl" />
      <div className="pointer-events-none absolute top-1/2 left-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#FFC46B]/10 blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 26 }}
        className="relative grid w-full max-w-5xl overflow-hidden rounded-[32px] border border-[#F1E6D8] bg-white shadow-[0_30px_80px_-30px_rgba(30,27,46,0.35)] md:grid-cols-2 dark:bg-[#14141f] dark:border-white/10"
      >
        {/* brand panel */}
        <div className="relative hidden flex-col justify-between overflow-hidden bg-[#1E1B2E] p-8 text-white md:flex">
          <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-gradient-to-br from-pink-400/40 to-indigo-400/40 blur-3xl" />
          <div className="absolute -bottom-28 -left-20 h-72 w-72 rounded-full bg-gradient-to-br from-amber-300/25 to-pink-400/25 blur-3xl" />
          {FLOATERS.map((e, i) => (
            <motion.span
              key={e}
              className="absolute text-3xl"
              style={{ left: `${12 + i * 18}%`, top: `${22 + ((i * 37) % 55)}%` }}
              animate={{ y: [0, -12, 0], rotate: [-6, 6, -6] }}
              transition={{ duration: 4 + i, repeat: Infinity, ease: 'easeInOut' }}
            >
              {e}
            </motion.span>
          ))}

          <div className="relative flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-[#FF8FB1] to-[#FFC46B] text-2xl shadow-lg">🌱</div>
            <div>
              <p className="text-[18px] font-black leading-tight">Little Sprouts</p>
              <p className="text-[12px] font-medium text-white/60">Where little minds bloom</p>
            </div>
          </div>

          <div className="relative">
            <h2 className="text-[32px] font-black leading-[1.05] tracking-tight">
              The preschool OS your teachers will actually love.
            </h2>
            <div className="mt-6 space-y-3">
              {[
                { icon: ClipboardCheck, t: '30-second attendance', c: '#4ADE80' },
                { icon: Wallet, t: 'Fees & reminders on autopilot', c: '#FFC46B' },
                { icon: BadgeCheck, t: 'Parent updates in one tap', c: '#7C9DFF' },
              ].map((f) => (
                <div key={f.t} className="flex items-center gap-3 rounded-2xl bg-white/8 border border-white/10 px-4 py-3 backdrop-blur">
                  <span className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: f.c }}>
                    <f.icon size={16} className="text-[#1E1B2E]" />
                  </span>
                  <p className="text-[13.5px] font-bold">{f.t}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative flex items-center gap-6 rounded-2xl bg-white/5 border border-white/10 p-4">
            {[['500+', 'happy kids'], ['40+', 'educators'], ['4.9★', 'parent rating']].map(([v, l]) => (
              <div key={l}>
                <p className="text-[20px] font-black">{v}</p>
                <p className="text-[11px] font-bold text-white/55">{l}</p>
              </div>
            ))}
          </div>
        </div>

        {/* form side */}
        <div className="relative p-6 sm:p-10">{children}</div>
      </motion.div>
    </div>
  );
}
