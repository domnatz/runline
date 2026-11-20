import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Runline", template: "%s | Runline" },
  description: "Offline-first field service management and real-time dispatch for HVAC contractors.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={GeistSans.variable}>
      <body>
        {children}
        <Toaster position="bottom-right" theme="light" visibleToasts={2} closeButton />
      </body>
    </html>
  );
}
