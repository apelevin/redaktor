import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LegalAGI',
  description: 'AI-powered legal document generator',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
