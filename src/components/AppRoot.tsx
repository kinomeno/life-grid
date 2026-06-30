"use client";

import { useRef, useState } from "react";
import styles from "../app/page.module.css";
import AppHeader from "./AppHeader";
import StartScreen, { type StartConfig } from "./StartScreen";
import SimulationView, { type SimulationViewHandle } from "./SimulationView";
import { useLocale } from "./LocaleProvider";
import { deserializeWorld } from "@/lib/serialize";
import type { World } from "@/lib/types";

type Props = {
  defaultWidth: number;
  defaultHeight: number;
  defaultInitialLifeCount: number;
};

export default function AppRoot({
  defaultWidth,
  defaultHeight,
  defaultInitialLifeCount,
}: Props) {
  const { t } = useLocale();
  const [config, setConfig] = useState<StartConfig | null>(null);
  const [showTitleConfirm, setShowTitleConfirm] = useState(false);
  // v1.31: ヘッダーのセーブ/ロードメニューから SimulationView の操作を呼ぶための参照。
  const simRef = useRef<SimulationViewHandle>(null);
  // v1.31: タイトル画面から保存データを読み込んで開始するための状態。
  const [pendingWorld, setPendingWorld] = useState<World | null>(null);
  const [startNotice, setStartNotice] = useState<string | null>(null);
  const startFileInputRef = useRef<HTMLInputElement>(null);

  const isSimulation = config !== null;

  const handleConfirmReturn = () => {
    setPendingWorld(null);
    setConfig(null);
    setShowTitleConfirm(false);
  };

  const notify = (msg: string) => {
    setStartNotice(msg);
    window.setTimeout(() => setStartNotice(null), 2800);
  };

  // v1.31: 読み込んだ World でシミュレーションを開始する。
  const enterWithWorld = (world: World) => {
    setPendingWorld(world);
    setConfig({
      width: world.width,
      height: world.height,
      initialLifeCount: world.lives.filter((l) => l.alive).length || 1,
      seed: world.seed,
    });
  };

  // タイトルから「ロード（ブラウザ内）」。
  const loadStorageStart = () => {
    let json: string | null = null;
    try {
      json = localStorage.getItem("lifegrid_save");
    } catch {
      json = null;
    }
    if (!json) {
      notify(t("save.none"));
      return;
    }
    try {
      enterWithWorld(deserializeWorld(json));
    } catch {
      notify(t("save.load_error"));
    }
  };

  // タイトルから「読み込み（ファイル）」。
  const importFileStart = () => startFileInputRef.current?.click();
  const onStartFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        enterWithWorld(deserializeWorld(String(reader.result)));
      } catch {
        notify(t("save.load_error"));
      }
    };
    reader.onerror = () => notify(t("save.load_error"));
    reader.readAsText(file);
  };

  return (
    <>
      <AppHeader
        onTitleClick={
          isSimulation ? () => setShowTitleConfirm(true) : undefined
        }
        saveLoad={
          isSimulation
            ? {
                onSave: () => simRef.current?.saveStorage(),
                onLoad: () => simRef.current?.loadStorage(),
                onExport: () => simRef.current?.exportFile(),
                onImport: () => simRef.current?.importFile(),
              }
            : { onLoad: loadStorageStart, onImport: importFileStart }
        }
      />
      <div className={styles.body}>
        {config === null ? (
          <StartScreen
            defaultWidth={defaultWidth}
            defaultHeight={defaultHeight}
            defaultInitialLifeCount={defaultInitialLifeCount}
            onStart={(c) => {
              setPendingWorld(null);
              setConfig(c);
              // 成果イベント：シミュレーション開始ボタン押下＝このアプリのゴール（匿名）
              (window as Window & { knTrack?: (e: string) => void }).knTrack?.("goal");
            }}
          />
        ) : (
          <SimulationView
            ref={simRef}
            key={`${config.seed}-${config.width}-${config.height}`}
            width={config.width}
            height={config.height}
            initialLifeCount={config.initialLifeCount}
            initialSeed={config.seed}
            initialGenes={config.initialGenes}
            initialParams={config.initialParams}
            terrainId={config.terrainId}
            initialWorld={pendingWorld ?? undefined}
          />
        )}
      </div>
      {showTitleConfirm && (
        <div
          className="modal-backdrop"
          onClick={() => setShowTitleConfirm(false)}
        >
          <div
            className="modal-panel confirm-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-section">
              <p className="confirm-title">{t("confirm.title_return")}</p>
              <p className="confirm-hint">{t("confirm.title_return_hint")}</p>
              <div className="confirm-actions">
                <button
                  className="btn"
                  onClick={() => setShowTitleConfirm(false)}
                >
                  {t("common.no")}
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleConfirmReturn}
                >
                  {t("common.yes")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* v1.31: タイトル画面からのファイル読み込み用（隠し input）。 */}
      <input
        ref={startFileInputRef}
        type="file"
        accept="application/json,.json"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onStartFile(f);
          e.target.value = "";
        }}
      />
      {startNotice && <div className="save-toast">{startNotice}</div>}
    </>
  );
}
