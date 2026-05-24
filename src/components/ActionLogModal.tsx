"use client";

import { useEffect, useState } from "react";
import type {
  Life,
  SpeciesLineageNode,
  WorldEvent,
  WorldEventType,
} from "@/lib/types";
import { useLocale } from "./LocaleProvider";
import TimeToggle from "./TimeToggle";
import LineageTree from "./LineageTree";
import { useDraggablePanel, type DragOffset } from "./useDraggablePanel";

// v1.30 (H7): 「年表」タブに出す主要イベント（物語性の高いもの）。
const CHRONICLE_TYPES = new Set<WorldEventType>([
  "epoch",
  "cataclysm",
  "massExtinction",
  "survival",
  "totalExtinction",
  "predatorRise",
  "intelligentRise",
  "milestone",
  "longevity",
  "topSpecies",
  "worldDomination",
  "originExtinction",
]);

type LogTab = "log" | "chronicle" | "lineage";

type Props = {
  events: WorldEvent[];
  /** v1.31 (A5): 系統樹タブ用。系統ノードと現存個体。 */
  lineage?: SpeciesLineageNode[];
  lives?: Life[];
  onClose: () => void;
  onSpeciesClick?: (speciesId: string) => void;
  /** 時間進行 ON/OFF（true なら世界の時間が進む）。 */
  timeRunning?: boolean;
  onToggleTime?: () => void;
  // v1.20: モーダル位置記録
  initialOffset?: DragOffset;
  onOffsetChange?: (o: DragOffset) => void;
  /** ver.2: 選択タブ（親で保持＝モーダルを開閉してもリセットされない）。 */
  tab: LogTab;
  onTabChange: (t: LogTab) => void;
};

// ver.2: 一度に表示する件数（描画負荷を抑え、超過分は「もっと見る」で展開）。
const PAGE = 1000;

export default function ActionLogModal({
  events,
  lineage,
  lives,
  onClose,
  onSpeciesClick,
  timeRunning = false,
  onToggleTime,
  initialOffset,
  onOffsetChange,
  tab,
  onTabChange,
}: Props) {
  const { t, locale } = useLocale();
  // v1.11/v1.20: モーダルドラッグ + 位置記録
  const { offset, dragging, dragHandlers } = useDraggablePanel(
    initialOffset,
    onOffsetChange
  );
  const setTab = onTabChange;
  const hasLineage = !!lineage;
  // ver.2: ログ・年表とも「新しい順（最新が上）」に統一。
  const ordered = [...events].reverse();
  const chronicle = [...events]
    .filter((e) => CHRONICLE_TYPES.has(e.type))
    .reverse();
  const shown = tab === "chronicle" ? chronicle : ordered;
  // ver.2: 1000件ずつ表示。タブ切替で先頭に戻す。
  const [visibleCount, setVisibleCount] = useState(PAGE);
  useEffect(() => {
    setVisibleCount(PAGE);
  }, [tab]);
  const visible = shown.slice(0, visibleCount);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-panel modal-wide"
        onClick={(e) => e.stopPropagation()}
        style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
      >
        <div
          className="modal-head modal-draggable"
          data-dragging={dragging}
          {...dragHandlers}
        >
          <h2 className="modal-title">{t("log.title")}</h2>
          {onToggleTime && (
            <TimeToggle running={timeRunning} onToggle={onToggleTime} />
          )}
          <button className="btn modal-close" onClick={onClose}>
            {t("common.close")}
          </button>
        </div>

        <section className="modal-section">
          <div className="graph-tabs">
            <button
              className={`btn ${tab === "log" ? "btn-active" : ""}`}
              onClick={() => setTab("log")}
            >
              {t("log.tab.log")}
            </button>
            <button
              className={`btn ${tab === "chronicle" ? "btn-active" : ""}`}
              onClick={() => setTab("chronicle")}
            >
              {t("log.tab.chronicle")}
            </button>
            {hasLineage && (
              <button
                className={`btn ${tab === "lineage" ? "btn-active" : ""}`}
                onClick={() => setTab("lineage")}
              >
                {t("log.tab.lineage")}
              </button>
            )}
          </div>
          {tab === "lineage" ? (
            <LineageTree
              lineage={lineage ?? []}
              lives={lives ?? []}
              onSelect={(id) => {
                onSpeciesClick?.(id);
                onClose();
              }}
            />
          ) : shown.length === 0 ? (
            <p className="empty-sub">
              {tab === "chronicle" ? t("log.chronicle_empty") : t("log.empty")}
            </p>
          ) : (
            <>
            <ul className="log-list">
              {visible.map((ev, i) => {
                const isClickable =
                  ev.speciesId &&
                  onSpeciesClick &&
                  (ev.type === "birth" ||
                    ev.type === "extinction" ||
                    ev.type === "topSpecies" ||
                    ev.type === "longevity" ||
                    ev.type === "survival" ||
                    ev.type === "predatorRise" ||
                    ev.type === "intelligentRise");

                return (
                  <li
                    key={`${ev.turn}-${i}-${ev.type}`}
                    className={`log-item log-${ev.type} ${isClickable ? "log-item-clickable" : ""}`}
                    onClick={() => {
                      if (isClickable && ev.speciesId) {
                        onSpeciesClick(ev.speciesId);
                        onClose();
                      }
                    }}
                  >
                    <span className="log-turn">T{ev.turn.toLocaleString()}</span>
                    {ev.rgb && (
                      <span
                        className="log-dot"
                        style={{
                          backgroundColor: `rgb(${ev.rgb.r}, ${ev.rgb.g}, ${ev.rgb.b})`,
                        }}
                      />
                    )}
                    {!ev.rgb && <span className="log-dot log-dot-empty" />}
                    <span className="log-msg">{ev.message[locale]}</span>
                  </li>
                );
              })}
            </ul>
            {shown.length > visibleCount && (
              <button
                type="button"
                className="btn log-more"
                onClick={() => setVisibleCount((n) => n + PAGE)}
              >
                {t("log.show_more", { n: shown.length - visibleCount })}
              </button>
            )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
