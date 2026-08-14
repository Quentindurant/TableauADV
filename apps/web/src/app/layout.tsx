import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Archivo } from 'next/font/google';
import './globals.css';

// Archivo est téléchargée AU BUILD par next/font puis auto-hébergée :
// aucune dépendance à un CDN au runtime, aucun <link> externe.
const archivo = Archivo({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-archivo',
});

export const metadata: Metadata = {
  title: 'Suivi commandes',
  description: 'Tableau de suivi des commandes et installations',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={archivo.variable}>
      <body>{children}</body>
    </html>
  );
}
