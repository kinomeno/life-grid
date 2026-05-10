import styles from "./page.module.css";
import SimulationView from "@/components/SimulationView";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>LIFE GRID</h1>
        <span className={styles.subtitle}>
          生命進化シミュレーター — ver 0.23
        </span>
      </header>
      <div className={styles.body}>
        <SimulationView width={100} height={100} initialLifeCount={200} />
      </div>
    </div>
  );
}
