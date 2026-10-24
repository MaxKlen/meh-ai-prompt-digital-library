import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MEH AI prompt digital library",
  description: "Search a large local-first library of reusable prompt templates across text, image, and video tasks.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
