import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Industrial Digital Twin Command Center",
  description: "High-fidelity operations cockpit linking 3D space, P&ID topology, and live AAS telemetry.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full w-full">
      <body className="h-full w-full antialiased bg-[#0a0b0e] text-[#f3f4f6]">
        {children}
      </body>
    </html>
  );
}
