import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Chess Tracker",
  description: "Real-time šahovski turniri - chess-results.com",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sr">
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
