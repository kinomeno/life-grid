"use client";

import { useEffect, useState } from "react";
import { randomSeed } from "@/lib/random";
import { decodeGeneId, GENE_ID_LENGTH } from "@/lib/geneId";
import { decodeParamsPreset } from "@/lib/serialize";
import { isUnlocked } from "@/lib/unlock";
import StartGridPreview from "./StartGridPreview";
import RulesScreen from "./RulesScreen";
import ShareXButton from "./ShareXButton";
import PasswordPrompt from "./PasswordPrompt";
import KinomenoLink from "./KinomenoLink";
import SupportLink from "./SupportLink";
import { useLocale } from "./LocaleProvider";
import type { Genes, SimulationParams } from "@/lib/types";

export type StartConfig = {
  width: number;
  height: number;
  initialLifeCount: number;
  seed: number;
  initialGenes?: Genes;
  /** v1.31: 共有URLの設定プリセット（環境設定）。あれば SimulationView の初期 params に反映。 */
  initialParams?: Partial<SimulationParams>;
  /** ver.2: 地形プリセット識別子（"world"=世界地図）。未指定＝従来のトーラス全面陸。 */
  terrainId?: string;
};

type Props = {
  defaultWidth: number;
  defaultHeight: number;
  defaultInitialLifeCount: number;
  onStart: (config: StartConfig) => void;
};

type MapPreset = {
  id: string;
  label: string;
  width: number;
  height: number;
  /** ver.2: ロケール対応の表示名キー（あれば label より優先して t() で表示）。 */
  labelKey?: string;
  /** ver.2: 地形プリセット識別子（指定時は固定地形＝海あり）。 */
  terrainId?: string;
  locked?: boolean;
};
const MAP_PRESETS: MapPreset[] = [
  { id: "s25", label: "25 × 25", width: 25, height: 25 },
  { id: "s50", label: "50 × 50", width: 50, height: 50 },
  { id: "s100", label: "100 × 100", width: 100, height: 100 },
  { id: "s200", label: "200 × 200", width: 200, height: 200, locked: true },
  { id: "world", label: "🌍 世界地図", labelKey: "start.map_world", width: 200, height: 100, terrainId: "world" },
];

const LIFE_COUNT_OPTIONS = [10, 20, 40, 50, 100];

export default function StartScreen({
  defaultWidth,
  defaultInitialLifeCount,
  onStart,
}: Props) {
  const { t } = useLocale();
  const [selectedId, setSelectedId] = useState<string>(
    MAP_PRESETS.find((p) => p.width === defaultWidth && !p.terrainId)?.id ?? "s50"
  );
  const selectedPreset =
    MAP_PRESETS.find((p) => p.id === selectedId) ?? MAP_PRESETS[1];
  const [lifeCount, setLifeCount] = useState<number>(
    LIFE_COUNT_OPTIONS.includes(defaultInitialLifeCount)
      ? defaultInitialLifeCount
      : 40
  );
  const [seedText, setSeedText] = useState<string>("");
  const [geneText, setGeneText] = useState<string>("");
  const [geneError, setGeneError] = useState<string | null>(null);
  // v1.31: 共有URLの設定プリセット（環境設定）。start() で StartConfig に載せる。
  const [presetParams, setPresetParams] = useState<
    Partial<SimulationParams> | undefined
  >(undefined);
  const [showRules, setShowRules] = useState(false);
  // ロック解除状態（sessionStorage 同期）
  const [unlocked, setUnlocked] = useState(false);
  // パスワード要求対象機能（null なら非表示）
  const [pwTarget, setPwTarget] = useState<{
    label: string;
    onUnlock: () => void;
  } | null>(null);

  useEffect(() => {
    setUnlocked(isUnlocked());
  }, []);

  // URL クエリパラメータからフォームを復元（シード共有用）
  // ?seed=12345&w=100&n=40&gene=XXXX
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const seedParam = sp.get("seed");
    const wParam = sp.get("w");
    const nParam = sp.get("n");
    const geneParam = sp.get("gene");
    if (seedParam) setSeedText(seedParam);
    if (wParam) {
      const wn = Number(wParam);
      const preset = MAP_PRESETS.find((p) => p.width === wn && !p.terrainId);
      // ロックされている場合は採用しない（ユーザーがロック解除する必要あり）
      if (preset && !preset.locked) setSelectedId(preset.id);
    }
    if (nParam) {
      const nn = Number(nParam);
      if (LIFE_COUNT_OPTIONS.includes(nn)) setLifeCount(nn);
    }
    if (geneParam) setGeneText(geneParam);
    // v1.31: 設定プリセット（共有URLの ?p=）を復元。
    const pParam = sp.get("p");
    if (pParam) {
      const decoded = decodeParamsPreset(pParam);
      if (Object.keys(decoded).length > 0) setPresetParams(decoded);
    }
  }, []);

  function start() {
    // シード値の解決
    const trimmedSeed = seedText.trim();
    let seedNum: number;
    if (trimmedSeed.length === 0) {
      seedNum = randomSeed();
    } else {
      const n = Number(trimmedSeed);
      seedNum = Number.isFinite(n) ? (n >>> 0) || randomSeed() : randomSeed();
    }

    // 遺伝子フォームの解決
    let initialGenes: Genes | undefined;
    const trimmedGene = geneText.trim();
    if (
      trimmedGene.length > 0 &&
      trimmedGene !== t("start.placeholder.random") &&
      trimmedGene !== "ランダム" &&
      trimmedGene !== "Random"
    ) {
      const decoded = decodeGeneId(trimmedGene);
      if (decoded === null) {
        setGeneError(t("start.gene_error", { n: GENE_ID_LENGTH }));
        return;
      }
      initialGenes = decoded;
    }
    setGeneError(null);

    onStart({
      width: selectedPreset.width,
      height: selectedPreset.height,
      initialLifeCount: lifeCount,
      seed: seedNum,
      initialGenes,
      initialParams: presetParams,
      terrainId: selectedPreset.terrainId,
    });
  }

  return (
    <div className="start-screen">
      <div className="start-card">
        <div className="start-hero">
          <h1 className="start-title">{t("app.title")}</h1>
          <p className="start-sub">{t("app.subtitle")}</p>
          <div className="start-grid-wrap">
            <StartGridPreview />
          </div>
        </div>

        <section className="start-section">
          <h3 className="start-section-title">{t("start.map_size")}</h3>
          <div className="ctrl-group start-presets">
            {MAP_PRESETS.map((p) => {
              const locked = p.locked && !unlocked;
              return (
                <button
                  key={p.id}
                  className={`btn ${selectedId === p.id ? "btn-active" : ""} ${
                    locked ? "btn-locked" : ""
                  }`}
                  onClick={() => {
                    if (locked) {
                      setPwTarget({
                        label: t("password.feature.map", { label: p.label }),
                        onUnlock: () => {
                          setUnlocked(true);
                          setSelectedId(p.id);
                          setPwTarget(null);
                        },
                      });
                      return;
                    }
                    setSelectedId(p.id);
                  }}
                  title={locked ? t("common.locked_hint") : undefined}
                >
                  {locked && <span className="btn-lock-glyph">🔒</span>}
                  {p.labelKey ? t(p.labelKey) : p.label}
                </button>
              );
            })}
          </div>
        </section>

        <section className="start-section">
          <h3 className="start-section-title">{t("start.life_count")}</h3>
          <select
            className="seed-input"
            value={lifeCount}
            onChange={(e) => setLifeCount(Number(e.target.value))}
          >
            {LIFE_COUNT_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          {selectedPreset.terrainId ? (
            <p className="empty-sub">{t("start.life_count_preset_note")}</p>
          ) : null}
        </section>

        {/* ver.2: 初期生命遺伝子・シード値は「その他の設定」に折りたたみ（既定は閉） */}
        <details className="start-other">
          <summary className="start-other-summary">
            {t("start.other_settings")}
          </summary>
          <section className="start-section">
            <h3 className="start-section-title">{t("start.initial_genes")}</h3>
            <input
              type="text"
              className="seed-input gene-form"
              placeholder={t("start.placeholder.random")}
              value={geneText}
              onChange={(e) => {
                setGeneText(e.target.value);
                setGeneError(null);
              }}
            />
            {geneError ? (
              <p className="gene-error">{geneError}</p>
            ) : (
              <p className="empty-sub">
                {t("start.gene_hint", { n: GENE_ID_LENGTH })}
              </p>
            )}
          </section>

          <section className="start-section">
            <h3 className="start-section-title">{t("start.seed")}</h3>
            <input
              type="text"
              className="seed-input"
              placeholder={t("start.placeholder.seed")}
              value={seedText}
              onChange={(e) => setSeedText(e.target.value)}
            />
          </section>
        </details>

        <div className="start-actions">
          <button className="btn" onClick={() => setShowRules(true)}>
            {t("start.button.rules")}
          </button>
          <button className="btn btn-primary" onClick={start}>
            {t("start.button.start")}
          </button>
        </div>
        {/* v1.32 (J1): 開発を応援する（SUPPORT_URL 設定時のみ表示） */}
        <SupportLink className="start-support" />
      </div>

      {showRules && <RulesScreen onClose={() => setShowRules(false)} />}
      {pwTarget && (
        <PasswordPrompt
          featureLabel={pwTarget.label}
          onUnlock={pwTarget.onUnlock}
          onCancel={() => setPwTarget(null)}
        />
      )}
      <ShareXButton
        text="LIFE GRID — 生命進化シミュレーター"
        className="x-share-fixed"
      />
      <KinomenoLink />
    </div>
  );
}
