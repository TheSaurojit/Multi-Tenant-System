import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DataPulse SaaS - Multi-Tenant Analytics Dashboard",
  description: "Enterprise multi-tenant analytics platform with RBAC and Stripe subscription billing.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
