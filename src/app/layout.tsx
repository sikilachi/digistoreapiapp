import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SRD Digital — Digistore Checkout Bridge",
  description: "Admin panel for SRD Digital / Digistore Checkout Bridge",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
