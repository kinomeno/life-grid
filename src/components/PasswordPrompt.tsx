"use client";

import { useEffect, useRef, useState } from "react";
import { unlock, UNLOCK_GUIDE_URL } from "@/lib/unlock";
import { useLocale } from "./LocaleProvider";

type Props = {
  /** モーダルタイトルに使うラベル（例: "200 × 200 マップ", "× 100 速度"）。 */
  featureLabel: string;
  /** 解除成功時の通知。 */
  onUnlock: () => void;
  /** キャンセル時の通知。 */
  onCancel: () => void;
};

/**
 * 上級機能のロック解除モーダル。
 * 仕様：
 *  - パスワード入力欄＋ロック解除ボタン。
 *  - 「こちらでゲットできます！」と note 記事へのリンクを併記。
 *  - 成功時 sessionStorage に保存し、以降は再表示しない。
 */
export default function PasswordPrompt({
  featureLabel,
  onUnlock,
  onCancel,
}: Props) {
  const { t } = useLocale();
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleSubmit() {
    if (unlock(input)) {
      onUnlock();
    } else {
      setError(t("password.error"));
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal-panel password-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 className="modal-title">{t("password.title")}</h2>
          <button className="btn modal-close" onClick={onCancel}>
            {t("common.close")}
          </button>
        </div>
        <section className="modal-section">
          <p className="password-feature">
            <span className="password-lock-glyph">🔒</span>
            {featureLabel}
          </p>
          <p className="password-hint">{t("password.message")}</p>
          <input
            ref={inputRef}
            type="password"
            className="seed-input"
            placeholder={t("password.placeholder")}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
          {error && <p className="gene-error">{error}</p>}
          <p className="password-cta">
            {t("password.cta")}{" "}
            <a
              href={UNLOCK_GUIDE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="password-link"
            >
              {UNLOCK_GUIDE_URL}
            </a>
          </p>
          <div className="password-actions">
            <button className="btn" onClick={onCancel}>
              {t("common.cancel")}
            </button>
            <button className="btn btn-primary" onClick={handleSubmit}>
              {t("common.unlock")}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
