import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const parkinsans = localFont({
  src: [
    { path: "../public/fonts/Parkinsans-Regular.ttf", weight: "400", style: "normal" },
    { path: "../public/fonts/Parkinsans-SemiBold.ttf", weight: "600", style: "normal" },
    { path: "../public/fonts/Parkinsans-Bold.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-parkinsans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Gestfy — Relatórios Semanais",
  description: "Relatórios e gestão de resultados dos clientes Gestfy",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${parkinsans.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
