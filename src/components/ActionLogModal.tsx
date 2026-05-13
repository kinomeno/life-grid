"use client";

import type { WorldEvent } from "@/lib/types";
import { useLocale } from "./LocaleProvider";

type Props = {
  events: WorldEvent[];
  onClose: () => void;
  onSpeciesClick?: (speciesId: string) => void;
  /** 時間進行 ON/OFF（true なら世界の時間が進む）。 */
  timeRunning?: boolean;
  onToggleTime?: () => void;
};

export default function ActionLogModal({
  events,
  onClose,
  onSpeciesClick,
  timeRunning = false,
  onToggleTime,
}: Props) {
  const { t, locale } = useLocale();
  // 新しい順
  const ordered = [...events].reverse();
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-panel modal-wide"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 className="modal-title">{t("log.title")}</h2>
          {onToggleTime && (
            <button
              className={`btn modal-time-toggle ${
                timeRunning ? "modal-time-on" : ""
              }`}
              onClick={onToggleTime}
              title={t("modal.time_hint")}
            >
              {timeRunning ? t("modal.time_on") : t("modal.time_off")}
            </button>
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
