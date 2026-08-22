import type { Metadata } from "next";
import { Geist, Roboto_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const robotoMono = Roboto_Mono({
  variable: "--font-roboto-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  title: "1Vault — The Pooled Trading Vault Layer for Solana",
  description:
    "Pooled Solana trading vaults. Same vault. Degen signs. Vault pays. Close pays by share weight.",
  icons: {
    icon: "/1vault-icon.png",
  },
  openGraph: {
    title: "1Vault — The Pooled Trading Vault Layer for Solana",
    description:
      "Park SOL, set take-profit and stop-loss, and ride the book a degen signs. Close settles leftover SOL by share weight.",
    siteName: "1Vault",
    images: ["/1vault-logo.png"],
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${spaceGrotesk.variable} ${robotoMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-ink text-foreground">
        {children}
      </body>
    </html>
  );
}
