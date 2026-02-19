"use client";

import { Cormorant_Garamond, Noto_Sans_KR } from "next/font/google";
import { useEffect, useState } from "react";
import styles from "./page.module.css";

type InvResponse = {
  ok: boolean;
  error?: string;
  wallet?: number;
  stack?: Array<{ item_id: string; qty: number }>;
  equipInventory?: Array<{
    equip_uid: string;
    item_id: string;
    level: number;
    enhance: number;
    rolled_affix_json: string;
  }>;
  equipped?: Array<{ slot: string; equipUid: string | null; itemName: string | null }>;
  progress?: { level: number; exp: number; nextExp: number; unlockedSkills?: string[] };
};

type StatsResponse = {
  ok: boolean;
  error?: string;
  progress?: { level: number; exp: number; nextExp: number; unlockedSkills?: string[] };
  stats?: { atk: number; def: number; hp: number; spd: number };
};

type UiTextMap = Record<string, string>;

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

const USER_ID = "u1";
const PENDING_FIGHT_KEY = `rpg:fight:pending:${USER_ID}`;

function makeRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function RpgPage() {
  const [uiTexts, setUiTexts] = useState<UiTextMap>({});
  const [monsterId, setMonsterId] = useState("slime");
  const [equipUidInput, setEquipUidInput] = useState("");
  const [slotInput, setSlotInput] = useState("WEAPON");
  const [inv, setInv] = useState<InvResponse | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const rpgTitle = uiTexts["rpg.title"] ?? "무림 행장 기록실";
  const rpgSubtitle = uiTexts["rpg.subtitle"] ?? "인벤토리와 장비, 성장 흐름을 이 화면에서 관리합니다.";

  async function refreshAll() {
    const [invRes, statsRes] = await Promise.all([
      fetch(`/api/rpg/inv?userId=${encodeURIComponent(USER_ID)}`, { cache: "no-store" }),
      fetch(`/api/rpg/stats?userId=${encodeURIComponent(USER_ID)}`, { cache: "no-store" }),
    ]);
    setInv((await invRes.json()) as InvResponse);
    setStats((await statsRes.json()) as StatsResponse);
  }

  useEffect(() => {
    refreshAll().catch(() => undefined);
  }, []);

  useEffect(() => {
    let mounted = true;
    fetch("/api/ui-texts", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { ok?: boolean; texts?: UiTextMap }) => {
        if (!mounted || data.ok !== true || !data.texts) return;
        setUiTexts(data.texts);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  async function post(path: string, body: Record<string, unknown>) {
    setLoading(true);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok || data.ok === false) {
        const msg = String(data.error ?? "요청 실패");
        setLogs((prev) => [...prev, `[오류] ${msg}`]);
        return null;
      }
      return data;
    } finally {
      setLoading(false);
    }
  }

  async function onInit() {
    const data = await post(`/api/rpg/init?userId=${encodeURIComponent(USER_ID)}`, {});
    if (data) setLogs((prev) => [...prev, "[초기화 완료]"]);
    await refreshAll();
  }

  async function onFight() {
    const pending = localStorage.getItem(PENDING_FIGHT_KEY);
    const requestId = pending || makeRequestId();
    if (!pending) localStorage.setItem(PENDING_FIGHT_KEY, requestId);

    const data = await post("/api/rpg/fight", { userId: USER_ID, monsterId, requestId });
    if (data && typeof data.result === "object" && data.result) {
      const result = data.result as { logs?: string[] };
      const lines = result.logs ?? ["[전투] 완료"];
      const idem = data.idempotent === true ? ["[멱등 응답] 기존 결과 재사용"] : [];
      setLogs((prev) => [...prev, ...idem, ...lines]);
      localStorage.removeItem(PENDING_FIGHT_KEY);
    }
    await refreshAll();
  }

  async function onEquip() {
    const equipUid = equipUidInput.trim();
    if (!equipUid) return;
    const data = await post("/api/rpg/equip", { userId: USER_ID, equipUid });
    if (data) setLogs((prev) => [...prev, `[장착] ${equipUid}`]);
    await refreshAll();
  }

  async function onUnequip() {
    const slot = slotInput.trim().toUpperCase();
    if (!slot) return;
    const data = await post("/api/rpg/unequip", { userId: USER_ID, slot });
    if (data) setLogs((prev) => [...prev, `[해제] ${slot}`]);
    await refreshAll();
  }

  return (
    <main className={`${styles.page} ${displayFont.variable} ${bodyFont.variable}`}>
      <div className={styles.shell}>
        <section className={styles.hero}>
          <div>
            <h1 className={styles.title}>{rpgTitle}</h1>
            <p className={styles.sub}>{rpgSubtitle}</p>
          </div>
          <div className={styles.badge}>USER : {USER_ID}</div>
        </section>

        <section className={`${styles.panel} ${styles.gridTop}`}>
          <div>
            <h2 className={styles.panelTitle}>지휘 명령</h2>
            <div className={styles.toolbar}>
              <button className={styles.btn} onClick={onInit} disabled={loading}>초기화</button>
              <input className={styles.control} value={monsterId} onChange={(e) => setMonsterId(e.target.value)} placeholder="monsterId" />
              <button className={styles.btn} onClick={onFight} disabled={loading}>전투 실행</button>
              <button className={styles.btn} onClick={() => refreshAll()} disabled={loading}>새로고침</button>
            </div>
            <div className={styles.toolbar} style={{ marginTop: 8 }}>
              <input
                className={`${styles.control} ${styles.controlWide}`}
                value={equipUidInput}
                onChange={(e) => setEquipUidInput(e.target.value)}
                placeholder="equip_uid"
              />
              <button className={styles.btn} onClick={onEquip} disabled={loading}>장착</button>
              <input className={styles.control} value={slotInput} onChange={(e) => setSlotInput(e.target.value)} placeholder="slot" />
              <button className={styles.btn} onClick={onUnequip} disabled={loading}>해제</button>
            </div>
          </div>

          <div>
            <h2 className={styles.panelTitle}>성장 지표</h2>
            <div className={styles.stats}>
              <div className={styles.statBox}>
                <div className={styles.k}>레벨</div>
                <div className={`${styles.v} ${styles.valueAccent}`}>{stats?.progress?.level ?? "-"}</div>
              </div>
              <div className={styles.statBox}>
                <div className={styles.k}>EXP</div>
                <div className={`${styles.v} ${styles.valueAccent}`}>
                  {stats?.progress ? `${stats.progress.exp}/${stats.progress.nextExp}` : "-"}
                </div>
              </div>
              <div className={styles.statBox}>
                <div className={styles.k}>ATK/DEF</div>
                <div className={styles.v}>{stats?.stats ? `${stats.stats.atk}/${stats.stats.def}` : "-"}</div>
              </div>
              <div className={styles.statBox}>
                <div className={styles.k}>HP/SPD</div>
                <div className={styles.v}>{stats?.stats ? `${stats.stats.hp}/${stats.stats.spd}` : "-"}</div>
              </div>
              <div className={styles.statBox} style={{ gridColumn: "span 2" }}>
                <div className={styles.k}>보유 골드</div>
                <div className={`${styles.v} ${styles.valueGold}`}>{inv?.wallet ?? 0}</div>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.split}>
          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>장착 상태</h2>
            <div className={styles.equipList}>
              {(inv?.equipped ?? []).map((s) => (
                <div key={s.slot} className={styles.lineItem}>
                  <strong>{s.slot}</strong>: {s.equipUid ?? "(비어있음)"} {s.itemName ? `[${s.itemName}]` : ""}
                </div>
              ))}
            </div>
          </section>

          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>스택 인벤토리</h2>
            {(inv?.stack ?? []).length === 0 ? <div className={styles.lineItem}>없음</div> : null}
            <div className={styles.list}>
              {(inv?.stack ?? []).map((s) => (
                <div key={s.item_id} className={styles.lineItem}>
                  {s.item_id} x{s.qty}
                </div>
              ))}
            </div>
          </section>
        </section>

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>장비 인벤토리</h2>
          {(inv?.equipInventory ?? []).length === 0 ? <div className={styles.lineItem}>없음</div> : null}
          <div className={styles.list}>
            {(inv?.equipInventory ?? []).map((e) => (
              <div key={e.equip_uid} className={`${styles.lineItem} ${styles.mono}`}>
                {e.equip_uid} | {e.item_id} | lv {e.level} | +{e.enhance}
              </div>
            ))}
          </div>
        </section>

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>전투 기록</h2>
          {logs.length === 0 ? <div className={styles.lineItem}>기록 없음</div> : null}
          <div className={styles.logWrap}>
            {logs.map((l, i) => (
              <div
                key={`${i}-${l}`}
                className={`${styles.log} ${l.startsWith("[오류]") ? styles.err : l.startsWith("[전투]") ? styles.ok : ""}`}
              >
                {l}
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
