import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Healthcare Appointment Manager",
  description: "Patient, doctor, and admin portals for appointment scheduling and follow-up.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
