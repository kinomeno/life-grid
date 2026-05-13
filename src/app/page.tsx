import styles from "./page.module.css";
import AppRoot from "@/components/AppRoot";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <div className={styles.page}>
      <AppRoot
        defaultWidth={50}
        defaultHeight={50}
        defaultInitialLifeCount={40}
      />
    </div>
  );
}
