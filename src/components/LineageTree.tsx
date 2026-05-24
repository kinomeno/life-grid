"use client";

import { useMemo, useState } from "react";
import type { Life, LineageNode } from "@/lib/types";
import { speciesDisplayName } from "@/lib/species";
import { useLocale } from "./LocaleProvider";

type Props = {
  lineage: LineageNode[];
  lives: Life[];
  onSelect?: (speciesId: string) => void;
};

type TreeNode = LineageNode & {
  children: TreeNode[];
  aliveCount: number;
  /** 自身か子孫に現存種がいるか（＝生存サブツリー＝幹）。 */
  living: boolean;
};

/**
 * v1.31 (A5): 系統樹（行動ログのタブ内に表示する提示用コンポーネント）。
 * 既定では「生存サブツリー（幹）」のみ表示し、純絶滅枝（生存子孫なし）は畳む。
 * トグルで全系統を表示。可読性のため絶滅ノードはグレー表示。
 */
export default function LineageTree({ lineage, lives, onSelect }: Props) {
  const { t, locale } = useLocale();
  const [showExtinct, setShowExtinct] = useState(false);

  const { roots, totalCount, aliveSpecies, hiddenCount } = useMemo(() => {
    const counts = new Map<number, number>();
    for (const l of lives) {
      if (!l.alive || l.lineageId == null) continue;
      counts.set(l.lineageId, (counts.get(l.lineageId) ?? 0) + 1);
    }
    const byId = new Map<number, TreeNode>();
    for (const n of lineage) {
      byId.set(n.id, {
        ...n,
        children: [],
        aliveCount: counts.get(n.id) ?? 0,
        living: false,
      });
    }
    const roots: TreeNode[] = [];
    for (const node of byId.values()) {
      const parent =
        node.parentId !== null ? byId.get(node.parentId) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    const sortRec = (arr: TreeNode[]) => {
      arr.sort((a, b) => a.birthTurn - b.birthTurn);
      for (const c of arr) sortRec(c.children);
    };
    sortRec(roots);
    // 生存サブツリー判定（post-order）。自身か子孫に現存種がいれば living=true。
    const markLiving = (node: TreeNode): boolean => {
      let any = node.aliveCount > 0;
      for (const c of node.children) {
        if (markLiving(c)) any = true;
      }
      node.living = any;
      return any;
    };
    for (const r of roots) markLiving(r);
    let hidden = 0;
    for (const n of byId.values()) if (!n.living) hidden++;
    return {
      roots,
      totalCount: byId.size,
      aliveSpecies: counts.size,
      hiddenCount: hidden,
    };
  }, [lineage, lives]);

  const rows: React.ReactElement[] = [];
  const visited = new Set<number>();
  const pushNode = (node: TreeNode, depth: number) => {
    if (visited.has(node.id)) return;
    visited.add(node.id);
    // 既定では純絶滅枝（生存子孫なし）を畳む。
    if (!showExtinct && !node.living) return;
    const isAlive = node.aliveCount > 0;
    rows.push(
      <li
        key={node.id}
        className={`lineage-row ${isAlive ? "lineage-alive" : "lineage-extinct"} ${
          onSelect ? "lineage-clickable" : ""
        }`}
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
        onClick={() => onSelect?.(node.speciesId)}
      >
        <span
          className="lineage-dot"
          style={{ backgroundColor: `rgb(${node.r}, ${node.g}, ${node.b})` }}
        />
        <span className="lineage-name">{speciesDisplayName(node.speciesId, node, locale)}</span>
        <span className="lineage-born">T{node.birthTurn.toLocaleString()}</span>
        <span className="lineage-pop">
          {isAlive ? `×${node.aliveCount}` : t("lineage.extinct")}
        </span>
      </li>
    );
    for (const c of node.children) pushNode(c, depth + 1);
  };
  for (const r of roots) pushNode(r, 0);

  return (
    <div className="lineage-wrap">
      <div className="lineage-head">
        <span className="lineage-summary">
          {t("lineage.summary", { total: totalCount, alive: aliveSpecies })}
        </span>
        {hiddenCount > 0 && (
          <button
            type="button"
            className="btn lineage-toggle"
            onClick={() => setShowExtinct((v) => !v)}
          >
            {showExtinct
              ? t("lineage.hide_extinct")
              : t("lineage.show_extinct", { n: hiddenCount })}
          </button>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="empty-sub">{t("lineage.empty")}</p>
      ) : (
        <ul className="lineage-list">{rows}</ul>
      )}
    </div>
  );
}
