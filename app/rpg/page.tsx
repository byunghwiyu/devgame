"use client";

import Link from "next/link";
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
    item_name?: string | null;
    item_slot?: string | null;
    item_base_stat?: StatBlock;
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

type StatBlock = {
  atk?: number;
  def?: number;
  hp?: number;
  spd?: number;
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

const PENDING_FIGHT_KEY = "rpg:fight:pending:selected";
const BASE_STATS = { atk: 10, def: 5, hp: 100, spd: 10 };

function makeRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseStatJson(raw: string): StatBlock {
  try {
    const parsed = JSON.parse(raw) as StatBlock;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function sumStats(a: StatBlock, b: StatBlock): StatBlock {
  return {
    atk: (a.atk ?? 0) + (b.atk ?? 0),
    def: (a.def ?? 0) + (b.def ?? 0),
    hp: (a.hp ?? 0) + (b.hp ?? 0),
    spd: (a.spd ?? 0) + (b.spd ?? 0),
  };
}

function diffStats(next: StatBlock, prev: StatBlock): StatBlock {
  return {
    atk: (next.atk ?? 0) - (prev.atk ?? 0),
    def: (next.def ?? 0) - (prev.def ?? 0),
    hp: (next.hp ?? 0) - (prev.hp ?? 0),
    spd: (next.spd ?? 0) - (prev.spd ?? 0),
  };
}

function formatSigned(value: number | undefined): string {
  const n = Math.trunc(value ?? 0);
  if (n > 0) return `+${n}`;
  return `${n}`;
}

export default function RpgPage() {
  const [uiTexts, setUiTexts] = useState<UiTextMap>({});
  const [monsterId, setMonsterId] = useState("slime");
  const [inv, setInv] = useState<InvResponse | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const rpgTitle = uiTexts["rpg.title"] ?? "무림 행장 기록실";
  const rpgSubtitle = uiTexts["rpg.subtitle"] ?? "인벤토리와 장비, 성장 흐름을 이 화면에서 관리합니다.";

  async function refreshAll() {
    const [invRes, statsRes] = await Promise.all([
      fetch("/api/rpg/inv", { cache: "no-store" }),
      fetch("/api/rpg/stats", { cache: "no-store" }),
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
    const data = await post("/api/rpg/init", {});
    if (data) setLogs((prev) => [...prev, "[초기화 완료]"]);
    await refreshAll();
  }

  async function onFight() {
    const pending = localStorage.getItem(PENDING_FIGHT_KEY);
    const requestId = pending || makeRequestId();
    if (!pending) localStorage.setItem(PENDING_FIGHT_KEY, requestId);

    const data = await post("/api/rpg/fight", { monsterId, requestId });
    if (data && typeof data.result === "object" && data.result) {
      const result = data.result as { logs?: string[] };
      const lines = result.logs ?? ["[전투] 완료"];
      const idem = data.idempotent === true ? ["[멱등 응답] 기존 결과 재사용"] : [];
      setLogs((prev) => [...prev, ...idem, ...lines]);
      localStorage.removeItem(PENDING_FIGHT_KEY);
    }
    await refreshAll();
  }

  const equippedSlotByUid = new Map(
    (inv?.equipped ?? [])
      .filter((e): e is { slot: string; equipUid: string; itemName: string | null } => Boolean(e.equipUid))
      .map((e) => [e.equipUid, e.slot]),
  );
  const equippedUidBySlot = new Map(
    (inv?.equipped ?? [])
      .filter((e): e is { slot: string; equipUid: string; itemName: string | null } => Boolean(e.equipUid))
      .map((e) => [e.slot, e.equipUid]),
  );
  const equipByUid = new Map((inv?.equipInventory ?? []).map((e) => [e.equip_uid, e]));
  const worldLevel = stats?.progress?.level ?? inv?.progress?.level ?? 1;

  const statIncrease = {
    atk: (stats?.stats?.atk ?? BASE_STATS.atk) - BASE_STATS.atk,
    def: (stats?.stats?.def ?? BASE_STATS.def) - BASE_STATS.def,
    hp: (stats?.stats?.hp ?? BASE_STATS.hp) - BASE_STATS.hp,
    spd: (stats?.stats?.spd ?? BASE_STATS.spd) - BASE_STATS.spd,
  };

  function getEquipStat(equipUid: string): StatBlock {
    const target = equipByUid.get(equipUid);
    if (!target) return {};
    return sumStats(target.item_base_stat ?? {}, parseStatJson(target.rolled_affix_json));
  }

  function getExpectedDelta(equipUid: string): StatBlock {
    const target = equipByUid.get(equipUid);
    if (!target) return {};
    const targetStat = getEquipStat(equipUid);
    const slot = target.item_slot ?? "";

    if (equippedSlotByUid.has(equipUid)) {
      return diffStats({}, targetStat);
    }

    if (!slot) return targetStat;
    const prevUid = equippedUidBySlot.get(slot);
    if (!prevUid) return targetStat;
    const prevStat = getEquipStat(prevUid);
    return diffStats(targetStat, prevStat);
  }

  async function onToggleEquip(equipUid: string) {
    const equippedSlot = equippedSlotByUid.get(equipUid);
    if (equippedSlot) {
      const data = await post("/api/rpg/unequip", { slot: equippedSlot });
      if (data) setLogs((prev) => [...prev, `[해제] ${equippedSlot} (${equipUid})`]);
      await refreshAll();
      return;
    }

    const data = await post("/api/rpg/equip", { equipUid });
    if (data) setLogs((prev) => [...prev, `[장착] ${equipUid}`]);
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
          <div className={styles.badge}>RPG</div>
        </section>

        <section className={`${styles.panel} ${styles.gridTop}`}>
          <div>
            <h2 className={styles.panelTitle}>지휘 명령</h2>
            <div className={styles.toolbar}>
              <button className={styles.btn} onClick={onInit} disabled={loading}>초기화</button>
              <input className={styles.control} value={monsterId} onChange={(e) => setMonsterId(e.target.value)} placeholder="monsterId" />
              <button className={styles.btn} onClick={onFight} disabled={loading}>전투 실행</button>
              <button className={styles.btn} onClick={() => refreshAll()} disabled={loading}>새로고침</button>
              <Link href={`/world?at=N1_TOWN&lv=${worldLevel}`} className={`${styles.btn} ${styles.linkBtn}`}>
                월드로 이동
              </Link>
              <Link href="/character" className={`${styles.btn} ${styles.linkBtn}`}>
                캐릭터 선택
              </Link>
            </div>
            <div className={styles.helperText}>장비 장착/해제는 아래 장비 인벤토리에서 버튼 한 번으로 처리됩니다.</div>
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
                <div className={styles.deltaLine}>
                  <span className={styles.deltaUp}>ATK {formatSigned(statIncrease.atk)}</span>
                  <span className={styles.deltaUp}>DEF {formatSigned(statIncrease.def)}</span>
                </div>
              </div>
              <div className={styles.statBox}>
                <div className={styles.k}>HP/SPD</div>
                <div className={styles.v}>{stats?.stats ? `${stats.stats.hp}/${stats.stats.spd}` : "-"}</div>
                <div className={styles.deltaLine}>
                  <span className={styles.deltaUp}>HP {formatSigned(statIncrease.hp)}</span>
                  <span className={styles.deltaUp}>SPD {formatSigned(statIncrease.spd)}</span>
                </div>
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
                <div key={s.slot} className={`${styles.lineItem} ${styles.slotItem}`}>
                  <div>
                    <strong>{s.slot}</strong>
                    <div className={styles.slotSub}>
                      {s.itemName ?? "미장착"} {s.equipUid ? `(${s.equipUid})` : ""}
                    </div>
                  </div>
                  <span className={s.equipUid ? styles.badgeOn : styles.badgeOff}>{s.equipUid ? "적용 중" : "비어 있음"}</span>
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
              <div key={e.equip_uid} className={`${styles.lineItem} ${styles.itemRow}`}>
                <div className={styles.itemMeta}>
                  <div>
                    <strong>{e.item_name ?? e.item_id}</strong>{" "}
                    <span className={styles.mono}>({e.equip_uid})</span>
                  </div>
                  <div className={styles.slotSub}>slot {e.item_slot ?? "-"} / lv {e.level} / +{e.enhance}</div>
                  <div className={styles.previewLine}>
                    {(() => {
                      const delta = getExpectedDelta(e.equip_uid);
                      return (
                        <>
                          <span className={(delta.atk ?? 0) >= 0 ? styles.deltaUp : styles.deltaDown}>ATK {formatSigned(delta.atk)}</span>
                          <span className={(delta.def ?? 0) >= 0 ? styles.deltaUp : styles.deltaDown}>DEF {formatSigned(delta.def)}</span>
                          <span className={(delta.hp ?? 0) >= 0 ? styles.deltaUp : styles.deltaDown}>HP {formatSigned(delta.hp)}</span>
                          <span className={(delta.spd ?? 0) >= 0 ? styles.deltaUp : styles.deltaDown}>SPD {formatSigned(delta.spd)}</span>
                        </>
                      );
                    })()}
                  </div>
                </div>
                <button
                  className={`${styles.btn} ${styles.smallBtn}`}
                  onClick={() => onToggleEquip(e.equip_uid)}
                  disabled={loading}
                >
                  {equippedSlotByUid.has(e.equip_uid) ? "해제" : "장착"}
                </button>
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

