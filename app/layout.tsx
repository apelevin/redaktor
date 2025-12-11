import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LegalAGI - Legal Document Workspace",
  description: "AI-powered legal document workspace with Human-in-the-Loop",
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

