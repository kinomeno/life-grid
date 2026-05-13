"use client";

/**
 * 制作者「キノメノ」note リンク。
 *  - タイトル画面・メイン画面の枠下に共通配置。
 *  - 小さめのグレーテキスト、hover でアンダーライン。
 */
export default function KinomenoLink() {
  return (
    <div className="kinomeno-link-wrap">
      <a
        className="kinomeno-link"
        href="https://note.com/kinomeno/n/n95fdec908a26"
        target="_blank"
        rel="noopener noreferrer"
      >
        キノメノ：https://note.com/kinomeno/n/n95fdec908a26
      </a>
    </div>
  );
}
