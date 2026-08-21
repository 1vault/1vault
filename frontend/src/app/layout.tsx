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
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  title: "1Vault — Capital in Motion",
  description:
    "Pooled Solana trading vaults. Same vault. Degen signs. Vault pays. Close pays by share weight.",
  icons: {
    icon: "/1vault-icon.png",
  },
  openGraph: {
    title: "1Vault — Capital in Motion",
    description:
      "Pooled Solana trading vaults. Park SOL, set take-profit and stop-loss, and ride the book a degen signs.",
    siteName: "1Vault",
    images: ["/1vault-logo.png"],
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
