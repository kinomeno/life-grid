"use client";

import { SUPPORT_URL } from "@/lib/constants";
import { useLocale } from "./LocaleProvider";

/**
 * v1.32 (J1): 開発を応援する外部リンク（投げ銭）。
 * SUPPORT_URL が未設定（空文字）のときは何も表示しない＝デッドリンクを出さない。
 * 外部リンクのみ・非侵襲（押し売りしない）。
 */
export default function SupportLink({ className }: { className?: string }) {
  const { t } = useLocale();
  if (!SUPPORT_URL) return null;
  return (
    <a
      className={`support-link ${className ?? ""}`}
      href={SUPPORT_URL}
      target="_blank"
      rel="noopener noreferrer"
    >
      {t("support.label")}
    </a>
  );
}
