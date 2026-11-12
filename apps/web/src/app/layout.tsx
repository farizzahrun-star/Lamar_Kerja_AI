import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Lamar Kerja AI",
    template: "%s · Lamar Kerja AI",
  },
  description:
    "Otomasi melamar kerja yang transparan: profil, CV, dan lamaran tetap di bawah kendali Anda.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
