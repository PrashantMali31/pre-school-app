'use client';
import Link from 'next/link';
import { Btn, Card, PageHeader } from '@/components/ui';

const LINKS = [
  { href: '/safety/pickup', title: 'Pickup authorization', sub: 'Contacts, PIN verify & pickup log', emoji: '🔑' },
  { href: '/safety/health', title: 'Health & incidents', sub: 'Injury / illness log + parent notify', emoji: '🩹' },
  { href: '/safety/timetable', title: 'Class timetable', sub: 'Weekly slots per class', emoji: '🗓️' },
  { href: '/safety/transport', title: 'Transport', sub: 'Bus routes & stops', emoji: '🚌' },
];

export default function SafetyHub() {
  return (
    <div>
      <PageHeader title="Safety 🛡️" sub="Pickup, health, timetable & transport" />
      <div className="grid sm:grid-cols-2 gap-4">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href}>
            <Card className="card-hover p-5">
              <p className="text-[28px]">{l.emoji}</p>
              <p className="mt-2 font-black text-[16px]">{l.title}</p>
              <p className="text-[13px] font-semibold text-[#8A84A0]">{l.sub}</p>
              <span className="mt-3 inline-block"><Btn variant="soft">Open →</Btn></span>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
