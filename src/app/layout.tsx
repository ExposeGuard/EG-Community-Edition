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
  title: "ExposeGuard Community",
  description: "Find your exposed services. Safe, local-only exposure visibility tool.",
  icons: {
    icon: "/eglogo.png",
    shortcut: "/eglogo.png",
    apple: "/eglogo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <div className="min-h-screen flex flex-col">
          <header className="border-b border-card-border bg-card/50 backdrop-blur-sm">
            <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
              <a href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                <img src="/eglogo.png" alt="ExposeGuard" className="w-10 h-10" />
                <span className="text-lg font-semibold tracking-tight">ExposeGuard Community</span>
              </a>
              <span className="text-xs text-muted hidden sm:block">
                Exposure Visibility Tool
              </span>
            </div>
          </header>
          <main className="flex-1">{children}</main>
          <footer className="border-t border-card-border py-6 text-center text-xs text-muted">
            <p>ExposeGuard Community &mdash; <a href="https://exposeguard.com" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors underline">exposeguard.com</a>. Not a vulnerability scanner.</p>
          </footer>
        </div>
      </body>
    </html>
  );
}
