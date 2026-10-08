import type { Metadata, Viewport } from "next";
import { Assistant } from "next/font/google";
import { Providers } from "@/app/providers";
import { t } from "@/i18n/he";
import "./globals.css";

/**
 * Google Sans (self-hosted TTFs in /public/fonts) is the primary UI face for
 * Latin + Hebrew. Assistant remains a fallback glyph companion.
 */
const assistant = Assistant({
  subsets: ["hebrew", "latin"],
  variable: "--font-heebo",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: t("appName"),
  description: t("tagline"),
  applicationName: t("appName"),
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#050506",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={`dark ${assistant.variable}`}>
      <body className="font-sans antialiased safe-pt safe-pb ops-ambient text-ink">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
