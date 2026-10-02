import type { Metadata, Viewport } from "next";
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
  title: "RouteRix",
  description: "QPSO traffic allocation simulator on Bhopal roads",
  openGraph: {
    title: "RouteRix",
    description: "QPSO traffic allocation simulator on Bhopal roads",
  },
};

export const viewport: Viewport = { colorScheme: "light dark" };

// Runs before paint so a pinned theme doesn't flash.
const themeScript = `try{const s=localStorage.getItem("color-scheme");if(s){document.documentElement.classList.add(s);document.querySelector('meta[name="color-scheme"]').content=s}}catch{}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
