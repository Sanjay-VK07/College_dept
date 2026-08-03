import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'GSMAS - GATE Secure Mock Test & Analytics System',
  description: 'Production-ready full-stack online examination system with GATE marking, live invigilation, browser anti-cheating security, and detailed performance analytics.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased font-sans">
        {children}
      </body>
    </html>
  );
}
