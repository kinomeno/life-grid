"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";

export type DragOffset = { x: number; y: number };

/**
 * v1.11: モーダルパネルのドラッグ機能。
 * v1.20: 親から初期 offset を受け取り、変更を通知できるよう拡張（位置記録対応）。
 *
 * 仕様（合意済み）:
 *   - 画面外への移動は許容（境界クランプなし）
 *   - 位置の永続化（オプション）：親が initialOffset を渡せば再オープン時に復元
 *   - ドラッグハンドルは modal-head 全体（カーソル明示で示す）
 *   - ボタン・リンク等の対話要素は通常動作（ドラッグしない）
 *
 * 使い方:
 *   const { offset, dragHandlers, dragging } = useDraggablePanel(savedOffset, setSavedOffset);
 *   <div style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}>
 *     <div className="modal-head" {...dragHandlers} data-dragging={dragging}>...</div>
 *   </div>
 */
export function useDraggablePanel(
  initialOffset?: DragOffset,
  onOffsetChange?: (next: DragOffset) => void
) {
  const [offset, setOffsetState] = useState<DragOffset>(
    initialOffset ?? { x: 0, y: 0 }
  );
  const [dragging, setDragging] = useState(false);
  const startRef = useRef({ mx: 0, my: 0, ox: 0, oy: 0 });
  const onOffsetChangeRef = useRef(onOffsetChange);
  useEffect(() => {
    onOffsetChangeRef.current = onOffsetChange;
  }, [onOffsetChange]);

  // 親に通知するラッパ（onOffsetChange はオプション）
  const setOffset = useCallback(
    (updater: DragOffset | ((prev: DragOffset) => DragOffset)) => {
      setOffsetState((prev) => {
        const next =
          typeof updater === "function"
            ? (updater as (p: DragOffset) => DragOffset)(prev)
            : updater;
        if (next.x !== prev.x || next.y !== prev.y) {
          onOffsetChangeRef.current?.(next);
        }
        return next;
      });
    },
    []
  );

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      // 対話要素はドラッグの対象外（ボタンクリックなどを邪魔しない）
      const target = e.target as HTMLElement;
      if (target.closest("button, a, input, select, label, textarea")) return;
      e.preventDefault();
      startRef.current = {
        mx: e.clientX,
        my: e.clientY,
        ox: offset.x,
        oy: offset.y,
      };
      setDragging(true);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
    },
    [offset.x, offset.y]
  );

  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      if (!startRef.current) return;
      if (e.buttons === 0) return;
      setOffset((prev) => {
        const nx = startRef.current.ox + (e.clientX - startRef.current.mx);
        const ny = startRef.current.oy + (e.clientY - startRef.current.my);
        if (prev.x === nx && prev.y === ny) return prev;
        return { x: nx, y: ny };
      });
    },
    [setOffset]
  );

  const onPointerUp = useCallback((e: PointerEvent<HTMLElement>) => {
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  }, []);

  return {
    offset,
    dragging,
    dragHandlers: { onPointerDown, onPointerMove, onPointerUp },
  };
}
