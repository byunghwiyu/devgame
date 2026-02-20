"use client";

import Link from "next/link";
import { Cormorant_Garamond, Noto_Sans_KR } from "next/font/google";
import { useEffect, useState } from "react";
import styles from "./page.module.css";

type MeResponse = { ok: boolean; loggedIn?: boolean };
type SelectedResponse = { ok: boolean; selected?: { characterId: string; name: string; class: string } | null };

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

export default function HomePage() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [selectedName, setSelectedName] = useState<string | null>(null);

  async function refreshAuth() {
    const meRes = await fetch("/api/auth/me", { cache: "no-store" });
    const me = (await meRes.json()) as MeResponse;
    if (me.ok && me.loggedIn) {
      setLoggedIn(true);
      const selRes = await fetch("/api/character/selected", { cache: "no-store" });
      const sel = (await selRes.json()) as SelectedResponse;
      setSelectedName(sel.ok && sel.selected ? sel.selected.name : null);
    } else {
      setLoggedIn(false);
      setSelectedName(null);
    }
  }

  useEffect(() => {
    refreshAuth().catch(() => undefined);
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    await refreshAuth();
  }

  return (
    <main className={`${styles.page} ${displayFont.variable} ${bodyFont.variable}`}>
      <section className={styles.card}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Murim Text RPG</h1>
            <p className={styles.sub}>계정, 캐릭터, 월드, 전투를 한 흐름으로 진행합니다.</p>
          </div>
          {loggedIn ? (
            <button className={styles.ghostBtn} onClick={logout}>
              로그아웃
            </button>
          ) : null}
        </div>

        <div className={styles.links}>
          {!loggedIn ? <Link href="/auth" className={styles.linkCard}>로그인/회원가입</Link> : null}
          {loggedIn ? <Link href="/character" className={styles.linkCard}>캐릭터 선택</Link> : null}
          {loggedIn ? <Link href="/world" className={styles.linkCard}>월드</Link> : null}
          {loggedIn ? <Link href="/rpg" className={styles.linkCard}>RPG 인벤/성장</Link> : null}
        </div>

        {selectedName ? <div className={styles.selected}>선택 캐릭터: {selectedName}</div> : null}
      </section>
    </main>
  );
}
