import type { Metadata } from "next";
import { Archivo, Geist_Mono, Source_Sans_3 } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const bodyFont = Source_Sans_3({ variable: "--font-sans", subsets: ["latin"], weight: ["400", "600", "700"] });
const headingFont = Archivo({ variable: "--font-heading", subsets: ["latin"], weight: ["600", "800", "900"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "HKR System", template: "%s · HKR System" },
  description: "Internal operations platform of HK Refurbished Stock",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${bodyFont.variable} ${headingFont.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
