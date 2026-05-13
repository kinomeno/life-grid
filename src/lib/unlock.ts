/**
 * 機能ロック解除（200×200, x100 などの上級機能）。
 *
 * 仕様：
 *  - sessionStorage に解除フラグを保持し、同セッション内ではロック画面を再表示しない。
 *  - ブラウザを閉じれば自動的にロック状態へ戻る。
 *  - パスワード文字列はクライアント側で照合（簡易版）。本格的な保護は API 化が必要。
 */

const SESSION_KEY = "lgrid_unlocked_v1";
const PASSWORD = "lgrid";

export function isUnlocked(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(SESSION_KEY) === "true";
  } catch {
    return false;
  }
}

export function unlock(input: string): boolean {
  if (input.trim() !== PASSWORD) return false;
  if (typeof window === "undefined") return true;
  try {
    window.sessionStorage.setItem(SESSION_KEY, "true");
  } catch {
    // ignore (sessionStorage 不可環境)
  }
  return true;
}

/** ロック解除案内 URL。ここでパスワードが取得できる旨を表示。 */
export const UNLOCK_GUIDE_URL =
  "https://note.com/kinomeno/n/n95fdec908a26";
