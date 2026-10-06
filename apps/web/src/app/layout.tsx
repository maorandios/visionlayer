import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";
import { Providers } from "@/app/providers";
import { t } from "@/i18n/he";
import "./globals.css";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  variable: "--font-heebo",
  display: "swap",
});

export const metadata: Metadata = {
  title: t("appName"),
  description: t("tagline"),
  applicationName: t("appName"),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#171717",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={heebo.variable}>
      <body className="font-sans antialiased safe-pt safe-pb">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
