import type { Metadata, Viewport } from "next";
import { Josefin_Sans, Mukta, Lekton } from "next/font/google";
import { EvmProvider } from "@/components/providers/EvmProvider";
import { ToastProvider } from "@/components/ui/Toast";
import WrongNetworkBar from "@/components/botchain/WrongNetworkBar";
import { app } from "@/lib/app-config";
import "./globals.css";

const josefin = Josefin_Sans({ variable: "--font-heading", subsets: ["latin"], display: "swap" });
const mukta = Mukta({ weight: ["400", "500", "600", "700"], variable: "--font-sans", subsets: ["latin"], display: "swap" });
const lekton = Lekton({ weight: ["400", "700"], variable: "--font-mono", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: `${app.name} — ${app.tagline}`,
  description: app.tagline,
  openGraph: { title: app.name, description: app.tagline, type: "website", url: app.url },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#6B1F7B",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${josefin.variable} ${mukta.variable} ${lekton.variable} h-full`}
      style={{ ["--accent" as string]: app.accent }}
    >
      <body className="min-h-full antialiased font-sans bg-[var(--bg-base)] text-[var(--text-primary)]">
        <EvmProvider>
          <WrongNetworkBar />
          <ToastProvider>{children}</ToastProvider>
        </EvmProvider>
      </body>
    </html>
  );
}
