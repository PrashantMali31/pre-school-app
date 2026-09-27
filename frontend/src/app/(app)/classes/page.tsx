'use client';
import { motion } from 'framer-motion';
import { Clock, MapPin, Users } from 'lucide-react';
import { useDB } from '@/lib/store';
import { Card, PageHeader, Pill } from '@/components/ui';

export default function ClassesPage() {
  const { db } = useDB();
  return (
    <div>
      <PageHeader title="Classrooms 🏫" sub="Age-wise batches · capacity tracking live" />
      <div className="grid sm:grid-cols-2 gap-4">
        {db.classes.map((c, i) => {
          const kids = db.students.filter((s) => s.classId === c.id && s.status === 'active');
          const teacher = db.teachers.find((t) => t.id === c.teacherId);
          const pct = Math.min(100, Math.round((kids.length / c.capacity) * 100));
          return (
            <motion.div key={c.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
              <Card className="card-hover overflow-hidden">
                <div className="h-2.5" style={{ background: `linear-gradient(90deg, ${c.color}, #7C9DFF)` }} />
                <div className="p-6">
                  <div className="flex items-start justify-between">
                    <div><h3 className="text-[20px] font-black">{c.name}</h3><p className="text-[13px] font-bold text-[#8A84A0]">{c.ageGroup}</p></div>
                    <Pill color={`${c.color}44`} text="#1E1B2E">{kids.length}/{c.capacity}</Pill>
                  </div>
                  <div className="mt-3 flex items-center gap-3 rounded-2xl bg-[#FFFEFB] border border-[#F5EEDF] p-3">
                    <span className="grid h-10 w-10 place-items-center rounded-xl text-xl" style={{ background: teacher?.color ?? '#eee' }}>{teacher?.emoji ?? '🦉'}</span>
                    <div><p className="text-[13px] font-extrabold">{teacher?.name ?? 'To assign'}</p><p className="text-[12px] text-[#8A84A0] font-semibold">{teacher?.role}</p></div>
                  </div>
                  <div className="mt-4 space-y-2 text-[13px] font-bold text-[#5B5670]">
                    <p className="flex items-center gap-2"><MapPin size={14} /> {c.room}</p>
                    <p className="flex items-center gap-2"><Clock size={14} /> {c.time}</p>
                    <p className="flex items-center gap-2"><Users size={14} /> {kids.length} enrolled</p>
                  </div>
                  <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-[#F6F0E6]">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ delay: 0.3 + i * 0.1 }} className="h-full rounded-full" style={{ background: c.color }} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {kids.slice(0, 8).map((k) => (
                      <span key={k.id} title={k.name} className="grid h-9 w-9 place-items-center rounded-xl text-lg border border-white shadow-sm" style={{ background: k.color }}>{k.emoji}</span>
                    ))}
                    {kids.length > 8 && <span className="grid h-9 px-2 place-items-center rounded-xl bg-[#1E1B2E] text-white text-[11px] font-black">+{kids.length - 8}</span>}
                  </div>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
