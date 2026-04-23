import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Lynsight',
  description: 'Open-source Lynis audit reporter with LLM-powered insights.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="mx-auto max-w-6xl px-6 py-8">
          <header className="mb-8 flex items-center justify-between">
            <a href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
              <span className="inline-block h-3 w-3 rounded-full bg-indigo-500" />
              Lynsight
              <span className="text-xs font-normal text-slate-400">v0.1</span>
            </a>
            <nav className="text-sm text-slate-500">
              <a
                className="hover:text-indigo-500"
                href="https://github.com/coverfleet-llc/lynsight"
                target="_blank"
                rel="noreferrer"
              >
                GitHub
              </a>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
