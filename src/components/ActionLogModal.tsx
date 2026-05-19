"use client";

import type { WorldEvent } from "@/lib/types";
import { useLocale } from "./LocaleProvider";
import TimeToggle from "./TimeToggle";
import { useDraggablePanel, type DragOffset } from "./useDraggablePanel";

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
  // 新しい順
  const ordered = [...events].reverse();
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
          {ordered.length === 0 ? (
            <p className="empty-sub">{t("log.empty")}</p>
          ) : (
            <ul className="log-list">
              {ordered.map((ev, i) => {
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
