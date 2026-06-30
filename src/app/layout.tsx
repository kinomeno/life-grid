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
        {/* キノメノ共通アクセス計測（匿名・入力は送らない）。詳細: claude用\アクセス計測_導入ガイド.txt */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){if(typeof window==='undefined'||typeof document==='undefined'||typeof Image==='undefined')return;try{if(!/^https?:$/.test(location.protocol))return;}catch(e){return;}try{if(/[?&]kn_notrack=1(?:&|$)/.test(location.search)){window.knTrack=function(){};return;}}catch(e){}var APP='lifegrid',EP='https://song2game-publish.kinomeno.workers.dev/track',sentOpen=false;function send(ev){ev=String(ev||'').toLowerCase();if(!/^[a-z0-9_]{1,32}$/.test(ev))return;try{var ref='';try{ref=(document.referrer||'').slice(0,300);}catch(e){}var u=EP+'?app='+encodeURIComponent(APP)+'&event='+encodeURIComponent(ev)+(ref?'&ref='+encodeURIComponent(ref):'')+'&_='+(new Date()).getTime();var img=new Image();img.referrerPolicy='no-referrer';img.src=u;}catch(e){}}window.knTrack=function(ev){if(String(ev||'').toLowerCase()==='open'){if(sentOpen)return;sentOpen=true;}send(ev);};sentOpen=true;send('open');})();",
          }}
        />
      </body>
    </html>
  );
}
