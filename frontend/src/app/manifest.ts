import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Little Sprouts · Preschool OS',
    short_name: 'Sprouts',
    description: 'Buttery-smooth preschool management — students, attendance, fees, events.',
    start_url: '/',
    display: 'standalone',
    background_color: '#FFF9F1',
    theme_color: '#1E1B2E',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
    ],
  };
}
