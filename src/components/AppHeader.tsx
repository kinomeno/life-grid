"use client";

import styles from "../app/page.module.css";
import { useLocale } from "./LocaleProvider";
import LanguageToggle from "./LanguageToggle";

type Props = {
  /** タイトル文字クリック時に呼ばれる。シミュレーション中だけ渡してタイトルへ戻す。 */
  onTitleClick?: () => void;
};

export default function AppHeader({ onTitleClick }: Props) {
  const { t } = useLocale();
  const isClickable = !!onTitleClick;
  return (
    <header className={styles.header}>
      <h1
        className={`${styles.title} ${
          isClickable ? styles.titleClickable : ""
        }`}
        onClick={onTitleClick}
        role={isClickable ? "button" : undefined}
        tabIndex={isClickable ? 0 : undefined}
        onKeyDown={
          isClickable
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onTitleClick?.();
                }
              }
            : undefined
        }
        title={isClickable ? t("confirm.title_return") : undefined}
      >
        {t("app.title")}
      </h1>
      <span className={styles.subtitle}>
        {t("app.subtitle")} — {t("app.version")}
      </span>
      <span className={styles.headerSpacer} />
      <LanguageToggle />
    </header>
  );
}
