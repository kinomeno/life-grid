"use client";

import { getShareUrl, openShareWindow } from "@/lib/share";

type Props = {
  /** ツイート本文（タイトル＋URL のみのテキストシェア）。 */
  text?: string;
  /** ボタンの追加位置クラス（既定: 画面右下固定）。 */
  className?: string;
};

/**
 * フラットUIに調和した X(Twitter) シェアボタン（白黒・固定位置）。
 * 仕様：
 *  - 枠外（画面右下）に固定配置、シンプルな白黒デザイン。
 *  - シェア内容はテキスト＋URLのみ（画像合成は行わない）。
 */
export default function ShareXButton({ text, className }: Props) {
  function handleClick() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const shareUrl = getShareUrl({
      title: "LIFE GRID",
      text: text ?? "LIFE GRID — 生命進化シミュレーター",
      url,
    });
    openShareWindow(shareUrl);
  }

  return (
    <button
      type="button"
      className={`x-share-btn ${className ?? ""}`}
      onClick={handleClick}
      aria-label="X でシェア"
      title="X でシェア"
    >
      <span className="x-share-glyph">𝕏</span>
    </button>
  );
}
