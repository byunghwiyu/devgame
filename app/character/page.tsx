"use client";

import { Cormorant_Garamond, Noto_Sans_KR } from "next/font/google";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";

type Character = {
  characterId: string;
  name: string;
  class: string;
  createdAt: string;
  level: number;
  exp: number;
  expToNext: number;
  stats: {
    atk: number;
    def: number;
    hp: number;
    spd: number;
  };
  imageKey?: string | null;
  imageUrl?: string | null;
};

type Template = {
  key: string;
  name: string;
  job: string;
  imageKey?: string | null;
  imageUrl?: string | null;
  hp: number;
  atk: number;
  def: number;
  speed: number;
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

export default function CharacterPage() {
  const router = useRouter();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [authChecked, setAuthChecked] = useState(false);
  const [name, setName] = useState("");
  const [job, setJob] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const selectedTemplate = useMemo(() => templates.find((t) => t.job === job) ?? null, [templates, job]);

  async function loadList() {
    const res = await fetch("/api/character/list", { cache: "no-store" });
    const data = (await res.json()) as { ok: boolean; error?: string; characters?: Character[] };
    if (!res.ok || !data.ok) {
      setMessage(data.error ?? "캐릭터 목록 조회 실패");
      if (res.status === 401) router.replace("/auth");
      return;
    }
    setCharacters(data.characters ?? []);
  }

  async function loadTemplates() {
    const res = await fetch("/api/character/templates", { cache: "no-store" });
    const data = (await res.json()) as { ok: boolean; error?: string; templates?: Template[] };
    if (!res.ok || !data.ok) {
      setMessage(data.error ?? "템플릿 조회 실패");
      return;
    }
    const list = data.templates ?? [];
    setTemplates(list);
    if (list.length > 0 && !job) setJob(list[0].job);
  }

  useEffect(() => {
    async function bootstrap() {
      const meRes = await fetch("/api/auth/me", { cache: "no-store" });
      const me = (await meRes.json()) as { ok: boolean; loggedIn?: boolean };
      if (!me.ok || !me.loggedIn) {
        router.replace("/auth");
        return;
      }

      await Promise.all([loadList(), loadTemplates()]);
      setAuthChecked(true);
    }

    bootstrap().catch(() => {
      router.replace("/auth");
    });
  }, []);

  if (!authChecked) {
    return (
      <main className={`${styles.page} ${displayFont.variable} ${bodyFont.variable}`}>
        <section className={styles.shell}>
          <section className={styles.panel}>인증 확인 중...</section>
        </section>
      </main>
    );
  }

  async function logout() {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setMessage(data.error ?? "로그아웃 실패");
        return;
      }
      router.push("/auth");
    } finally {
      setLoading(false);
    }
  }

  async function createCharacter() {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/character/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, class: job }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setMessage(data.error ?? "생성 실패");
        return;
      }
      setName("");
      await loadList();
    } finally {
      setLoading(false);
    }
  }

  async function selectCharacter(characterId: string) {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/character/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setMessage(data.error ?? "선택 실패");
        return;
      }
      router.push("/world");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={`${styles.page} ${displayFont.variable} ${bodyFont.variable}`}>
      <section className={styles.shell}>
        <header className={styles.hero}>
          <div>
            <h1 className={styles.title}>캐릭터 선택</h1>
            <p className={styles.sub}>보유 캐릭터를 확인하고 세계로 입장하세요.</p>
          </div>
          <button className={styles.ghostBtn} onClick={logout} disabled={loading}>
            로그아웃
          </button>
        </header>

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>신규 캐릭터 생성</h2>
          <div className={styles.creatorGrid}>
            <div className={styles.formCol}>
              <label className={styles.label}>이름</label>
              <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="캐릭터 이름" />

              <label className={styles.label}>직업 템플릿</label>
              <select className={styles.input} value={job} onChange={(e) => setJob(e.target.value)}>
                {templates.map((t) => (
                  <option key={t.key} value={t.job}>
                    {t.name} ({t.job})
                  </option>
                ))}
              </select>

              <button className={styles.primaryBtn} onClick={createCharacter} disabled={loading || !name.trim() || !job || characters.length >= 3}>
                생성
              </button>
              <div className={styles.helper}>현재 {characters.length}/3</div>
            </div>

            <div className={styles.previewCol}>
              <div className={styles.previewTitle}>선택 템플릿 미리보기</div>
              {selectedTemplate?.imageUrl ? (
                <img src={selectedTemplate.imageUrl} alt={selectedTemplate.name} className={styles.previewImg} />
              ) : (
                <div className={styles.noImage}>NO IMAGE</div>
              )}
              {selectedTemplate ? (
                <div className={styles.previewMeta}>
                  <div>
                    <strong>{selectedTemplate.name}</strong> ({selectedTemplate.job})
                  </div>
                  <div>HP {selectedTemplate.hp} / ATK {selectedTemplate.atk} / DEF {selectedTemplate.def} / SPD {selectedTemplate.speed}</div>
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>보유 캐릭터</h2>
          <div className={styles.list}>
            {characters.length === 0 ? <div className={styles.empty}>생성된 캐릭터가 없습니다.</div> : null}
            {characters.map((c) => {
              const expRatio = c.expToNext > 0 ? Math.min(100, Math.round((c.exp / c.expToNext) * 100)) : 100;
              return (
                <div key={c.characterId} className={styles.charCard}>
                  <div className={styles.charThumbWrap}>
                    {c.imageUrl ? <img src={c.imageUrl} alt={c.name} className={styles.charThumb} /> : <div className={styles.charNoImage}>NO IMAGE</div>}
                  </div>

                  <div className={styles.charBody}>
                    <div className={styles.charTopRow}>
                      <div>
                        <div className={styles.name}>{c.name}</div>
                        <div className={styles.meta}>{c.class}</div>
                      </div>
                      <div className={styles.levelBadge}>Lv. {c.level}</div>
                    </div>

                    <div className={styles.expRow}>
                      <div className={styles.expLabel}>EXP {c.exp} / {c.expToNext}</div>
                      <div className={styles.expTrack}>
                        <div className={styles.expFill} style={{ width: `${expRatio}%` }} />
                      </div>
                    </div>

                    <div className={styles.statGrid}>
                      <span>HP {c.stats.hp}</span>
                      <span>ATK {c.stats.atk}</span>
                      <span>DEF {c.stats.def}</span>
                      <span>SPD {c.stats.spd}</span>
                    </div>
                  </div>

                  <div className={styles.charAction}>
                    <button className={styles.primaryBtn} onClick={() => selectCharacter(c.characterId)} disabled={loading}>
                      선택
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {message ? <p className={styles.message}>{message}</p> : null}
        </section>
      </section>
    </main>
  );
}
