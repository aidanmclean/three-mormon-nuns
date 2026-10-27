import { GAME_NAME } from "@tmn/game";
import type { Metadata } from "next";
import { Bangers, Bricolage_Grotesque, Space_Mono } from "next/font/google";
import "./globals.css";

const display = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
});
const comic = Bangers({
  variable: "--font-comic",
  weight: "400",
  subsets: ["latin"],
});

const mono = Space_Mono({
  variable: "--font-typewriter",
  weight: ["400", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: GAME_NAME,
  description:
    "A team guessing game in three rounds: describe, charades, and one word.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${mono.variable} ${comic.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
