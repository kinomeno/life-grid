"use client";

import { useLocale } from "./LocaleProvider";
import type { Locale } from "@/lib/i18n";

/**
 * 言語切り替えボタン（JA / EN）。
 * 上部バー右端にモノクロ調で配置する。
 */
export default function LanguageToggle() {
  const { locale, setLocale } = useLocale();
  const targets: Locale[] = ["ja", "en"];

  return (
    <div className="lang-toggle" role="group" aria-label="Language">
      {targets.map((l) => (
        <button
          key={l}
          type="button"
          className={`lang-toggle-btn ${
            locale === l ? "lang-toggle-active" : ""
          }`}
          onClick={() => setLocale(l)}
          aria-pressed={locale === l}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
