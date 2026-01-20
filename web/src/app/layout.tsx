import type { Metadata } from "next";
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import "./globals.css";

export const metadata: Metadata = {
  title: "Integra Markets - AI-Powered Commodity Trading Intelligence",
  description: "Get real-time AI sentiment analysis, trade ideas, and market insights for commodities. Track oil, gold, natural gas, and agricultural markets with intelligent alerts.",
  keywords: ["commodity trading", "oil prices", "gold trading", "AI sentiment analysis", "market intelligence", "natural gas", "commodities", "trading platform"],
  authors: [{ name: "Integra Markets" }],
  creator: "Integra Markets",
  publisher: "Integra Markets",
  robots: "index, follow",
  icons: {
    icon: "/NewLogoInt.png.png",
    shortcut: "/NewLogoInt.png.png",
    apple: "/NewLogoInt.png.png",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://integramarkets.app",
    siteName: "Integra Markets",
    title: "Integra Markets - AI-Powered Commodity Trading Intelligence",
    description: "Get real-time AI sentiment analysis, trade ideas, and market insights for commodities. Track oil, gold, natural gas, and agricultural markets.",
    images: [
      {
        url: "/NewLogoInt.png.png",
        width: 512,
        height: 512,
        alt: "Integra Markets Logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Integra Markets - AI-Powered Commodity Trading Intelligence",
    description: "Real-time AI sentiment analysis and trade ideas for commodity traders.",
    images: ["/NewLogoInt.png.png"],
  },
  viewport: "width=device-width, initial-scale=1",
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <head>
        <link rel="icon" href="/NewLogoInt.png.png" type="image/png" />
        <link rel="apple-touch-icon" href="/NewLogoInt.png.png" />
      </head>
      <body className="antialiased bg-black text-white selection:bg-emerald-500/30">
        {children}
      </body>
    </html>
  );
}
