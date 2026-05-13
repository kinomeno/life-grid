/**
 * X(Twitter) シェア機能。
 *
 * 仕様：
 *  - テキスト + URL のみを X の intent エンドポイントへ渡す。
 *  - 画像合成・キャンバスキャプチャは行わない（ブラウザ制約のため断念）。
 *  - 起動するシェアウィンドウはユーザー操作により直接ハンドルされる。
 */

export interface ShareContent {
  title: string;
  url: string;
  /** ツイート本文。未指定時は title が使われる。 */
  text?: string;
}

export function getShareUrl(content: ShareContent): string {
  const url = encodeURIComponent(content.url);
  const text = encodeURIComponent(content.text || content.title);
  return `https://twitter.com/intent/tweet?text=${text}&url=${url}`;
}

export function openShareWindow(url: string): void {
  window.open(url, "share", "width=550,height=420");
}
