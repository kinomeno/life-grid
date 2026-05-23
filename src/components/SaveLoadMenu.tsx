"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "./LocaleProvider";

type Props = {
  /** セーブ＝ブラウザ内（localStorage）に保存。世界がある時のみ。 */
  onSave?: () => void;
  /** ロード＝ブラウザ内（localStorage）から読み出し。 */
  onLoad?: () => void;
  /** 書き出し＝ファイルへダウンロード。世界がある時のみ。 */
  onExport?: () => void;
  /** 読み込み＝ファイルから読み込み。 */
  onImport?: () => void;
};

/**
 * v1.31: ヘッダー右（JA/EN の隣）の小さな「セーブ／ロード」メニュー。
 * フッターを増やさないため、4 項目（ブラウザ内セーブ/ロード・ファイル書き出し/読み込み）を
 * ドロップダウンに収める。
 */
export default function SaveLoadMenu({
  onSave,
  onLoad,
  onExport,
  onImport,
}: Props) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const run = (fn: () => void) => () => {
    fn();
    setOpen(false);
  };

  return (
    <div className="saveload-menu" ref={rootRef}>
      <button
        type="button"
        className="saveload-btn"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {t("saveload.button")}
      </button>
      {open && (
        <div className="saveload-dropdown" role="menu">
          {onSave && (
            <button
              type="button"
              className="saveload-item"
              role="menuitem"
              onClick={run(onSave)}
            >
              {t("saveload.save")}
            </button>
          )}
          {onLoad && (
            <button
              type="button"
              className="saveload-item"
              role="menuitem"
              onClick={run(onLoad)}
            >
              {t("saveload.load")}
            </button>
          )}
          {(onSave || onLoad) && (onExport || onImport) && (
            <div className="saveload-sep" />
          )}
          {onExport && (
            <button
              type="button"
              className="saveload-item"
              role="menuitem"
              onClick={run(onExport)}
            >
              {t("saveload.export")}
            </button>
          )}
          {onImport && (
            <button
              type="button"
              className="saveload-item"
              role="menuitem"
              onClick={run(onImport)}
            >
              {t("saveload.import")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
