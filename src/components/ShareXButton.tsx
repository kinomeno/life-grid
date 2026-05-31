"use client";

import { useCallback } from "react";
import { getShareUrl, openShareWindow } from "@/lib/share";
import { useLocale } from "./LocaleProvider";

type Props = {
  /** ツイート本文。 */
  text?: string;
  /** ボタンの追加 CSS クラス。 */
  className?: string;
  /**
   * 画像を生成する関数。Promise<Blob> を返す。
   * 指定すると「画像付きシェア」モードになる。
   *  - モバイル: Web Share API ({files, text, url}) でネイティブシェートへ。
   *  - デスクトップ: clipboard.write で画像をコピー → X 投稿画面を開く → toast 表示。
   *  - どちらも失敗: ファイルを DL して X 投稿画面を開く（ユーザーが手動添付）。
   */
  makeImageBlob?: () => Promise<Blob>;
  /** toast 表示コールバック（画像コピー完了など）。 */
  onToast?: (msg: string) => void;
};

/**
 * X(Twitter) シェアボタン。
 * makeImageBlob が渡されると「画像付きシェア」モードになる（ver 2.06〜）。
 * 画像なし（旧仕様互換）: テキスト＋URL のみ。
 */
export default function ShareXButton({
  text,
  className,
  makeImageBlob,
  onToast,
}: Props) {
  const { t } = useLocale();

  const shareText = text ?? "LIFE GRID — 生命進化シミュレーター #LIFEGRID";

  const openXIntent = useCallback(() => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    openShareWindow(
      getShareUrl({ title: "LIFE GRID", text: shareText, url })
    );
  }, [shareText]);

  const handleClick = useCallback(async () => {
    if (!makeImageBlob) {
      // 旧仕様互換：テキスト＋URL のみ
      openXIntent();
      return;
    }

    let blob: Blob;
    try {
      blob = await makeImageBlob();
    } catch {
      // 画像生成失敗 → テキストシェアにフォールバック
      openXIntent();
      return;
    }

    const file = new File([blob], "lifegrid.png", { type: "image/png" });

    // --- ① Web Share API（モバイル優先・files 対応） ---
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [file] })
    ) {
      try {
        const url = window.location.href;
        await navigator.share({
          files: [file],
          text: `${shareText}\n${url}`,
        });
        return;
      } catch {
        // キャンセル or 失敗 → デスクトップフローへフォールバック
      }
    }

    // --- ② Clipboard API（デスクトップ） ---
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      typeof ClipboardItem !== "undefined"
    ) {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
        onToast?.(t("ctrl.share_image_copied"));
        openXIntent();
        return;
      } catch {
        // clipboard 失敗 → DL フォールバックへ
      }
    }

    // --- ③ DL フォールバック（clipboard 非対応 / 権限拒否） ---
    onToast?.(t("ctrl.share_image_fallback"));
    const dlUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = dlUrl;
    a.download = "lifegrid.png";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(dlUrl), 10000);
    openXIntent();
  }, [makeImageBlob, openXIntent, onToast, t]);

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
