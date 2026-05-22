"use client";

import { useState } from "react";
import type { WorldEvent, WorldEventType } from "@/lib/types";
import { useLocale } from "./LocaleProvider";
import TimeToggle from "./TimeToggle";
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
]);

type Props = {
  events: WorldEvent[];
  onClose: () => void;
  onSpeciesClick?: (speciesId: string) => void;
  /** 時間進行 ON/OFF（true なら世界の時間が進む）。 */
  timeRunning?: boolean;
  onToggleTime?: () => void;
  // v1.20: モーダル位置記録
  initialOffset?: DragOffset;
  onOffsetChange?: (o: DragOffset) => void;
};

export default function ActionLogModal({
  events,
  onClose,
  onSpeciesClick,
  timeRunning = false,
  onToggleTime,
  initialOffset,
  onOffsetChange,
}: Props) {
  const { t, locale } = useLocale();
  // v1.11/v1.20: モーダルドラッグ + 位置記録
  const { offset, dragging, dragHandlers } = useDraggablePanel(
    initialOffset,
    onOffsetChange
  );
  // v1.30 (H7): ログ（全件・新しい順）／年表（主要イベント・古い順＝時系列）。
  const [tab, setTab] = useState<"log" | "chronicle">("log");
  const ordered = [...events].reverse();
  const chronicle = events.filter((e) => CHRONICLE_TYPES.has(e.type));
  const shown = tab === "chronicle" ? chronicle : ordered;
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
          </div>
          {shown.length === 0 ? (
            <p className="empty-sub">
              {tab === "chronicle" ? t("log.chronicle_empty") : t("log.empty")}
            </p>
          ) : (
            <ul className="log-list">
              {shown.map((ev, i) => {
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
          )}
        </section>
      </div>
    </div>
  );
}
