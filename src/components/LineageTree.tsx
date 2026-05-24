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

  // 表示対象ノードを DFS 順で収集（絶滅枝は既定で畳む）。JSX と PNG 書き出しで共用する。
  const visibleNodes: { node: TreeNode; depth: number }[] = [];
  const visited = new Set<number>();
  const collect = (node: TreeNode, depth: number) => {
    if (visited.has(node.id)) return;
    visited.add(node.id);
    if (!showExtinct && !node.living) return;
    visibleNodes.push({ node, depth });
    for (const c of node.children) collect(c, depth + 1);
  };
  for (const r of roots) collect(r, 0);

  const rows = visibleNodes.map(({ node, depth }) => {
    const isAlive = node.aliveCount > 0;
    return (
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
        <span className="lineage-name">
          {speciesDisplayName(node.speciesId, node, locale)}
        </span>
        <span className="lineage-born">T{node.birthTurn.toLocaleString()}</span>
        <span className="lineage-pop">
          {isAlive ? `×${node.aliveCount}` : t("lineage.extinct")}
        </span>
      </li>
    );
  });

  // ver.2: 表示中の系統樹を PNG として書き出す（色ドット＋親子接続線＋ラベルのキャンバス描画）。
  const exportPng = () => {
    if (visibleNodes.length === 0) return;
    const ROW_H = 22;
    const COL_W = 26;
    const PAD = 16;
    const DOT_R = 5;
    const FONT = 13;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.font = `${FONT}px sans-serif`;
    const labeled = visibleNodes.map(({ node, depth }) => {
      const name = speciesDisplayName(node.speciesId, node, locale);
      const pop =
        node.aliveCount > 0 ? `×${node.aliveCount}` : t("lineage.extinct");
      const text = `${name}  T${node.birthTurn.toLocaleString()}  ${pop}`;
      const x = PAD + depth * COL_W;
      const right = x + DOT_R * 2 + 6 + ctx.measureText(text).width;
      return { node, x, text, right };
    });
    const W = Math.ceil(Math.max(...labeled.map((l) => l.right)) + PAD);
    const H = visibleNodes.length * ROW_H + PAD * 2;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);
    ctx.font = `${FONT}px sans-serif`;
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    const pos = new Map<number, { x: number; y: number }>();
    labeled.forEach((l, i) => {
      pos.set(l.node.id, { x: l.x, y: PAD + i * ROW_H + ROW_H / 2 });
    });
    // 親→子の接続線（エルボ）。
    ctx.strokeStyle = "#c8c8c8";
    ctx.lineWidth = 1;
    for (const l of labeled) {
      if (l.node.parentId == null) continue;
      const p = pos.get(l.node.parentId);
      const c = pos.get(l.node.id);
      if (!p || !c) continue;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x, c.y);
      ctx.lineTo(c.x, c.y);
      ctx.stroke();
    }
    // ノード（色ドット＋ラベル）。絶滅はグレー。
    labeled.forEach((l, i) => {
      const y = PAD + i * ROW_H + ROW_H / 2;
      const alive = l.node.aliveCount > 0;
      ctx.beginPath();
      ctx.arc(l.x, y, DOT_R, 0, Math.PI * 2);
      ctx.fillStyle = `rgb(${l.node.r}, ${l.node.g}, ${l.node.b})`;
      ctx.fill();
      if (!alive) {
        ctx.strokeStyle = "#aaaaaa";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.fillStyle = alive ? "#222222" : "#999999";
      ctx.fillText(l.text, l.x + DOT_R + 6, y);
    });
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "lineage-tree.png";
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  };

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
        {visibleNodes.length > 0 && (
          <button
            type="button"
            className="btn lineage-toggle"
            onClick={exportPng}
          >
            {t("lineage.save_png")}
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
