import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Mission Control",
  description:
    "Rocket engineering challenge — design, build, and launch rockets to complete space missions",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <div className="min-h-screen flex flex-col">
          {/* NASA-style header */}
          <header className="border-b border-[var(--border)] bg-[var(--surface)]">
            {/* Red accent stripe */}
            <div className="h-[2px] bg-gradient-to-r from-transparent via-[var(--nasa-red)] to-transparent" />

            <div className="px-6 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-4">
                {/* Agency mark */}
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full border-2 border-[var(--nasa-red)] flex items-center justify-center">
                    <div className="w-5 h-5 rounded-full border border-[var(--nasa-blue-light)] flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-[var(--nasa-red)]" />
                    </div>
                  </div>
                  <div>
                    <h1 className="text-base font-bold tracking-[0.2em] uppercase text-[var(--foreground)]">
                      Mission Control
                    </h1>
                    <p className="font-mono text-[0.7rem] tracking-[0.15em] uppercase text-[var(--muted)]">
                      Rocket Engineering Division
                    </p>
                  </div>
                </div>

                <div className="h-6 w-px bg-[var(--border)]" />

                {/* Status indicator */}
                <div className="flex items-center gap-1.5">
                  <span className="status-dot status-dot--active" />
                  <span className="font-mono text-[0.75rem] tracking-wider uppercase text-[var(--nasa-green)]">
                    Systems Nominal
                  </span>
                </div>
              </div>

              <nav className="flex items-center gap-5">
                <a
                  href="/"
                  className="font-mono text-[0.8rem] tracking-[0.15em] uppercase text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                >
                  Missions
                </a>
                <span className="font-mono text-[0.75rem] tracking-wider text-[var(--border-light)]">
                  v0.1.0
                </span>
              </nav>
            </div>
          </header>

          <main className="flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
