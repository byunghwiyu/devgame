import Link from "next/link";
import { Cormorant_Garamond, Noto_Sans_KR } from "next/font/google";
import { getUiText } from "@/lib/data/loadUiTexts";
import { getWorldState } from "@/lib/game/world";
import { bgUrl } from "@/lib/ui/assets";
import styles from "./page.module.css";

type Props = {
  searchParams: Promise<{
    at?: string;
    lv?: string;
  }>;
};

const displayFont = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["600", "700"],
});

const bodyFont = Noto_Sans_KR({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "700"],
});

function parseLevel(raw?: string): number {
  const value = Number(raw ?? "1");
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.floor(value);
}

export default async function WorldPage({ searchParams }: Props) {
  const params = await searchParams;
  const userLevel = parseLevel(params?.lv);
  const currentKey = params?.at ?? "N1_TOWN";
  const { current, worldOptions } = getWorldState(currentKey, userLevel);
  const currentBgSrc = bgUrl(current.bgImageKey);
  const worldTitle = getUiText("world.title", "무림 세계 지도");
  const worldSubtitle = getUiText("world.subtitle", "조건 충족 월드만 노출되며, 선택으로 진입합니다.");
  const toRpgLabel = getUiText("world.to_rpg", "RPG 페이지 이동");

  return (
    <main className={`${styles.page} ${displayFont.variable} ${bodyFont.variable}`}>
      <div className={styles.shell}>
        <section className={styles.hero}>
          <div>
            <h1 className={styles.title}>{worldTitle}</h1>
            <p className={styles.subtitle}>{worldSubtitle}</p>
          </div>
          <div className={styles.badge}>LV {userLevel}</div>
        </section>

        <section className={styles.panel}>
          <Link href="/rpg" className={styles.btn}>
            {toRpgLabel}
          </Link>
          <Link href="/character" className={styles.btn} style={{ marginLeft: 8 }}>
            캐릭터 선택
          </Link>
        </section>

        <section className={styles.panel}>
          {currentBgSrc ? (
            <div className={styles.bgHeader} style={{ backgroundImage: `url(${currentBgSrc})` }}>
              <div className={styles.overlay}>
                <div className={styles.meta}>Current World</div>
                <div className={styles.nodeName}>
                  {current.name} <span style={{ opacity: 0.8, fontSize: 14 }}>({current.key} / {current.type})</span>
                </div>
                <div className={styles.nodeDesc}>{current.description}</div>
              </div>
            </div>
          ) : (
            <>
              <div className={styles.meta}>Current World</div>
              <div className={styles.nodeName}>
                {current.name} <span style={{ opacity: 0.6, fontSize: 14 }}>({current.key} / {current.type})</span>
              </div>
              <div className={styles.nodeDesc}>{current.description}</div>
            </>
          )}

          {current.type === "BATTLE" ? (
            <div style={{ marginTop: 12 }}>
              <Link href={`/battle?at=${encodeURIComponent(current.key)}&lv=${userLevel}`} className={styles.btn}>
                전투 시작
              </Link>
            </div>
          ) : null}
        </section>

        <section className={styles.panel}>
          <div className={styles.meta}>Visible Worlds</div>

          {worldOptions.length === 0 ? (
            <div>No visible worlds.</div>
          ) : (
            <div className={styles.grid}>
              {worldOptions.map(({ node, canEnter, requiredLevel }) => (
                <div key={node.key} className={`${styles.card} ${canEnter ? "" : styles.cardLocked}`}>
                  <div style={{ fontWeight: 700 }}>{node.name}</div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>{node.type} | {node.key}</div>
                  <div style={{ fontSize: 12, marginTop: 6 }}>Required Lv: {requiredLevel}</div>
                  {canEnter ? (
                    <Link href={`/world?lv=${userLevel}&at=${encodeURIComponent(node.key)}`} className={styles.btn} style={{ marginTop: 8 }}>
                      Enter
                    </Link>
                  ) : (
                    <div style={{ marginTop: 8, fontSize: 12 }}>Locked</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <div className={styles.tip}>
          Tip: change level with <code>?lv=2</code> in URL.
        </div>
      </div>
    </main>
  );
}
