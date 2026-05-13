"use client";

import { useState } from "react";
import styles from "../app/page.module.css";
import AppHeader from "./AppHeader";
import StartScreen, { type StartConfig } from "./StartScreen";
import SimulationView from "./SimulationView";
import { useLocale } from "./LocaleProvider";

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

  const isSimulation = config !== null;

  const handleConfirmReturn = () => {
    setConfig(null);
    setShowTitleConfirm(false);
  };

  return (
    <>
      <AppHeader
        onTitleClick={
          isSimulation ? () => setShowTitleConfirm(true) : undefined
        }
      />
      <div className={styles.body}>
        {config === null ? (
          <StartScreen
            defaultWidth={defaultWidth}
            defaultHeight={defaultHeight}
            defaultInitialLifeCount={defaultInitialLifeCount}
            onStart={setConfig}
          />
        ) : (
          <SimulationView
            key={`${config.seed}-${config.width}-${config.height}`}
            width={config.width}
            height={config.height}
            initialLifeCount={config.initialLifeCount}
            initialSeed={config.seed}
            initialGenes={config.initialGenes}
            onBackToTitle={() => setShowTitleConfirm(true)}
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
    </>
  );
}
