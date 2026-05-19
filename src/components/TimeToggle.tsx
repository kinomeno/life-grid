"use client";

import { useLocale } from "./LocaleProvider";

/**
 * v1.11: 時間進行 ON/OFF のトグルスイッチ。
 *
 * iOS Switch 風の見た目（トラック + ノブのスライド）+ ON 時はパルスアニメ。
 * StatsGraphModal / ActionLogModal で使用。グラフを見ながらでも一目で
 * 「時間が進んでいるか」が分かる UI が目的。
 */
export default function TimeToggle({
  running,
  onToggle,
}: {
  running: boolean;
  onToggle: () => void;
}) {
  const { t } = useLocale();
  return (
    <button
      type="button"
      className={`time-switch ${running ? "on" : ""}`}
      onClick={onToggle}
      title={t("modal.time_hint")}
      aria-pressed={running}
      aria-label={running ? t("modal.time_on") : t("modal.time_off")}
    >
      <span className={`time-switch-track ${running ? "on" : ""}`}>
        <span className="time-switch-knob" />
      </span>
      <span className={`time-switch-label ${running ? "on" : ""}`}>
        {running ? t("modal.time_on") : t("modal.time_off")}
      </span>
      {running && <span className="time-switch-pulse" aria-hidden="true" />}
    </button>
  );
}
