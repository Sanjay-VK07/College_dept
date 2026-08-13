import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'University Examination Management System (EMS)',
  description: 'Institutional online examination management system with live invigilation, security monitoring, question bank governance, and academic performance analytics.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#F8FAFC] text-slate-900 antialiased font-sans">
        {children}
      </body>
    </html>
  );
}

