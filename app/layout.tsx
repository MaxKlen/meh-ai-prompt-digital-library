import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MEH AI prompt digital library",
  description: "Search a large local-first library of reusable prompt templates across text, image, and video tasks.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.svg",
    apple: "/icons/icon-180.png",
  },
  appleWebApp: {
    capable: true,
    title: "MEH AI prompt digital library",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#204638",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
