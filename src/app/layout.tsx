import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { LocaleProvider } from "@/components/LocaleProvider";

const APP_TITLE = "LIFE GRID — 生命進化シミュレーター";
const APP_DESCRIPTION =
  "ルールだけが定義された世界で、生命が自ら進化していく観察シミュレーション。0〜100 の連続遺伝子・天変地異・時代変化・系統交代をブラウザだけで観察できます。";

// 公開時のドメインを反映。env 経由で上書き可能。
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://life-grid.example.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: APP_TITLE,
  description: APP_DESCRIPTION,
  applicationName: "LIFE GRID",
  authors: [{ name: "キノメノ", url: "https://note.com/kinomeno" }],
  creator: "キノメノ",
  // OGP (Open Graph) — SNS シェア時に使われる
  openGraph: {
    title: APP_TITLE,
    description: APP_DESCRIPTION,
    siteName: "LIFE GRID",
    locale: "ja_JP",
    type: "website",
    // /public/og-image.png を配置（1200x630 推奨）。なくても文字情報は出る。
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "LIFE GRID",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: APP_TITLE,
    description: APP_DESCRIPTION,
    images: ["/og-image.png"],
    creator: "@kinomeno",
  },
};

// Next.js 16 では viewport は別 export として配置する
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>
        <LocaleProvider>{children}</LocaleProvider>
        {/* v1.02: Vercel Web Analytics（訪問者数・PV）と Speed Insights（Core Web Vitals）。
            無料プラン（Hobby）で月 2,500 イベント分まで利用可能。 */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
