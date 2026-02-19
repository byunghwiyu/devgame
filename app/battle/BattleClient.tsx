"use client";

import Link from "next/link";
import { Cormorant_Garamond, Noto_Sans_KR } from "next/font/google";
import { useEffect, useMemo, useRef, useState } from "react";
import { advanceBattle, createBattle, type BattleState as EngineBattleState, type Fighter } from "@/lib/game/battle";
import { charUrl, monsterUrl } from "@/lib/ui/assets";
import styles from "./page.module.css";

type CombatantDto = Fighter & {
  imageKey?: string;
};

type SetupResponse = {
  nodeKey: string;
  monsterKey: string;
  player: CombatantDto;
  monster: CombatantDto;
  config?: {
    battleRoundIntervalMs?: number;
  };
};

type FightRewardApiResponse = {
  ok: boolean;
  idempotent?: boolean;
  error?: string;
  result?: {
    win: boolean;
    drops?: Array<{ itemId: string; qty: number }>;
  };
};

type Props = {
  nodeKey: string;
  userLevel: number;
  backgroundSrc: string | null;
};

type UiTextMap = Record<string, string>;

const DEFAULT_ROUND_INTERVAL_MS = 3000;
const TICK_MS = 100;

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

function Placeholder({ label, height = 220 }: { label: string; height?: number }) {
  return (
    <div
      style={{
        width: "100%",
        height,
        borderRadius: 10,
        border: "1px dashed #999",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        color: "#666",
        background: "#f7f7f7",
      }}
    >
      {label}
    </div>
  );
}

function SkillBadge({ label }: { label: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "4px 8px",
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.24)",
        background: "rgba(8, 14, 20, 0.82)",
        color: "#f3efe4",
        fontSize: 12,
        lineHeight: 1.2,
      }}
    >
      {label}
    </span>
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderColoredLogLine(line: string, playerName: string, enemyName: string) {
  const parts: Array<{ text: string; tone: "plain" | "player" | "enemy" | "up" | "down" | "damage" }> = [];
  const keywords = [playerName, enemyName].filter(Boolean).map(escapeRegExp);
  const pattern =
    keywords.length > 0
      ? new RegExp(`(${keywords.join("|")}|가한피해\\s*\\d+|[+-]\\d+)`, "g")
      : /(가한피해\s*\d+|[+-]\d+)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null = pattern.exec(line);
  while (match) {
    const start = match.index;
    if (start > lastIndex) {
      parts.push({ text: line.slice(lastIndex, start), tone: "plain" });
    }

    const token = match[0];
    if (token === playerName) {
      parts.push({ text: token, tone: "player" });
    } else if (token === enemyName) {
      parts.push({ text: token, tone: "enemy" });
    } else if (token.startsWith("가한피해")) {
      parts.push({ text: token, tone: "damage" });
    } else if (token.startsWith("+")) {
      parts.push({ text: token, tone: "up" });
    } else if (token.startsWith("-")) {
      parts.push({ text: token, tone: "down" });
    } else {
      parts.push({ text: token, tone: "plain" });
    }

    lastIndex = start + token.length;
    match = pattern.exec(line);
  }

  if (lastIndex < line.length) {
    parts.push({ text: line.slice(lastIndex), tone: "plain" });
  }

  return (
    <>
      {parts.map((part, idx) => {
        const style =
          part.tone === "player"
            ? { color: "#15803d", fontWeight: 700 }
            : part.tone === "enemy"
              ? { color: "#b91c1c", fontWeight: 700 }
              : part.tone === "up"
                ? { color: "#1d4ed8", fontWeight: 700 }
                : part.tone === "down"
                  ? { color: "#dc2626", fontWeight: 700 }
                  : part.tone === "damage"
                    ? { color: "#c2410c", fontWeight: 700 }
                  : undefined;

        return (
          <span key={`${part.text}-${idx}`} style={style}>
            {part.text}
          </span>
        );
      })}
    </>
  );
}

type TurnSummaryParsed = {
  turn: number;
  player: { hpLoss: number; dealt: number; innerDelta: number };
  enemy: { hpLoss: number; dealt: number; innerDelta: number };
};

function toInt(value: string | undefined): number {
  const n = Number(value ?? "");
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function parseSummarySide(line: string): { hpLoss: number; dealt: number; innerDelta: number } {
  const hpLoss = toInt(line.match(/HP-(\d+)/)?.[1]);
  const dealt = toInt(line.match(/가한피해\s*(\d+)/)?.[1]);
  const innerDelta = toInt(line.match(/내공\s*([+-]?\d+)/)?.[1]);
  return { hpLoss, dealt, innerDelta };
}

function parseTurnSummary(line: string): TurnSummaryParsed | null {
  if (!line.startsWith("턴 요약\n")) return null;
  const rows = line.split("\n").map((s) => s.trim());
  if (rows.length < 4) return null;

  const turn = toInt(rows[1].match(/턴수:\s*(\d+)/)?.[1]);
  const playerLine = rows.find((r) => r.startsWith("플레이어:")) ?? "";
  const enemyLine = rows.find((r) => r.startsWith("적:")) ?? "";
  if (!playerLine || !enemyLine) return null;

  return {
    turn,
    player: parseSummarySide(playerLine),
    enemy: parseSummarySide(enemyLine),
  };
}

export default function BattleClient({ nodeKey, userLevel, backgroundSrc }: Props) {
  const [uiTexts, setUiTexts] = useState<UiTextMap>({});
  const [state, setState] = useState<EngineBattleState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [chargeMs, setChargeMs] = useState(0);
  const [roundIntervalMs, setRoundIntervalMs] = useState(DEFAULT_ROUND_INTERVAL_MS);
  const [playerImageSrc, setPlayerImageSrc] = useState<string | null>(null);
  const [monsterImageSrc, setMonsterImageSrc] = useState<string | null>(null);
  const [currentMonsterKey, setCurrentMonsterKey] = useState<string>("");
  const [rewardState, setRewardState] = useState<{
    status: "pending" | "done" | "error";
    win: boolean;
    drops: Array<{ itemId: string; qty: number }>;
    message?: string;
  } | null>(null);
  const [playerImageMissing, setPlayerImageMissing] = useState(false);
  const [monsterImageMissing, setMonsterImageMissing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loopTokenRef = useRef(0);
  const logContainerRef = useRef<HTMLDivElement | null>(null);
  const pausedRef = useRef(false);
  const startedRef = useRef(false);
  const isOverRef = useRef(false);
  const chargeMsRef = useRef(0);
  const rewardRequestedRef = useRef(false);

  const isOver = state?.isOver ?? false;
  const battleTitle = uiTexts["battle.title"] ?? "무림 전장 기록";
  const battleSubtitle = uiTexts["battle.subtitle"] ?? "전투 로그와 판정 흐름을 실시간으로 확인합니다.";
  const toRpgLabel = uiTexts["battle.to_rpg"] ?? "RPG 페이지 이동";

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

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    startedRef.current = started;
  }, [started]);

  useEffect(() => {
    isOverRef.current = isOver;
  }, [isOver]);

  useEffect(() => {
    chargeMsRef.current = chargeMs;
  }, [chargeMs]);

  useEffect(() => {
    if (!state) return;
    const el = logContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [state?.log.length, state]);

  useEffect(() => {
    let mounted = true;

    async function setupBattle() {
      if (!nodeKey) {
        setError("노드 키가 없습니다. URL에 ?at=NODE_KEY 를 넣어주세요.");
        setState(null);
        return;
      }

      setLoading(true);
      setError(null);
      setStarted(false);
      setPaused(false);
      setChargeMs(0);
      chargeMsRef.current = 0;
      setRoundIntervalMs(DEFAULT_ROUND_INTERVAL_MS);
      setPlayerImageMissing(false);
      setMonsterImageMissing(false);
      setRewardState(null);
      rewardRequestedRef.current = false;

      try {
        const res = await fetch(`/api/battle/setup?at=${encodeURIComponent(nodeKey)}`, { cache: "no-store" });
        const data = (await res.json()) as SetupResponse | { error: string };

        if (!res.ok || !("player" in data) || !("monster" in data)) {
          setError("error" in data ? data.error : "전투 준비 중 오류가 발생했습니다.");
          setState(null);
          return;
        }

        if (!mounted) return;

        setState(createBattle(data.player, data.monster));
        setCurrentMonsterKey(data.monsterKey);
        setRoundIntervalMs(Math.max(500, Math.floor(data.config?.battleRoundIntervalMs ?? DEFAULT_ROUND_INTERVAL_MS)));
        setPlayerImageSrc(charUrl(data.player.imageKey ?? "char_player_01"));
        setMonsterImageSrc(monsterUrl(data.monster.imageKey));
      } catch (e) {
        if (!mounted) return;
        const message = e instanceof Error ? e.message : "전투 준비 중 오류가 발생했습니다.";
        setError(message);
        setState(null);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    setupBattle();
    return () => {
      mounted = false;
    };
  }, [nodeKey]);

  useEffect(() => {
    if (!state?.isOver) return;
    if (rewardRequestedRef.current) return;
    rewardRequestedRef.current = true;

    if (state.winner !== "player") {
      setRewardState({
        status: "done",
        win: false,
        drops: [],
      });
      return;
    }

    if (!currentMonsterKey) {
      setRewardState({
        status: "error",
        win: true,
        drops: [],
        message: "몬스터 키를 찾지 못해 보상 정산에 실패했습니다.",
      });
      return;
    }

    setRewardState({
      status: "pending",
      win: true,
      drops: [],
      message: "보상 정산 중...",
    });

    const requestId = `battle-${nodeKey}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    fetch("/api/rpg/fight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: "u1",
        monsterId: currentMonsterKey,
        requestId,
      }),
    })
      .then(async (res) => {
        const data = (await res.json()) as FightRewardApiResponse;
        if (!res.ok || !data.ok) {
          throw new Error(data.error ?? "보상 정산 실패");
        }
        setRewardState({
          status: "done",
          win: true,
          drops: data.result?.drops ?? [],
        });
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : "보상 정산 실패";
        setRewardState({
          status: "error",
          win: true,
          drops: [],
          message: msg,
        });
      });
  }, [state?.isOver, state?.winner, currentMonsterKey, nodeKey]);

  useEffect(() => {
    if (!started || paused || isOver) return;
    loopTokenRef.current += 1;
    const myToken = loopTokenRef.current;

    const runTick = () => {
      if (myToken !== loopTokenRef.current) return;
      if (pausedRef.current || !startedRef.current || isOverRef.current) return;

      let nextCharge = chargeMsRef.current + TICK_MS;
      let shouldResolve = false;
      if (nextCharge >= roundIntervalMs) {
        nextCharge = 0;
        shouldResolve = true;
      }

      chargeMsRef.current = nextCharge;
      setChargeMs(nextCharge);

      if (shouldResolve) {
        setState((prevState) => {
          if (myToken !== loopTokenRef.current) return prevState;
          if (pausedRef.current || !startedRef.current || !prevState || prevState.isOver) return prevState;
          return advanceBattle(prevState, roundIntervalMs / 1000);
        });
      }

      if (myToken !== loopTokenRef.current) return;
      timerRef.current = setTimeout(runTick, TICK_MS);
    };

    timerRef.current = setTimeout(runTick, TICK_MS);
    return () => {
      loopTokenRef.current += 1;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [started, paused, isOver, roundIntervalMs]);

  const statusText = useMemo(() => {
    if (!state) return "대기";
    if (state.isOver) return state.winner === "player" ? "플레이어 승리" : "몬스터 승리";
    if (!started) return "준비 완료";
    if (paused) return "일시 정지";
    return "자동 전투 진행 중";
  }, [state, started, paused]);

  const chargeRatio = Math.min(1, chargeMs / roundIntervalMs);
  const turnSummaries = useMemo(() => {
    if (!state) return [] as TurnSummaryParsed[];
    return state.log.map((line) => parseTurnSummary(line)).filter((v): v is TurnSummaryParsed => Boolean(v));
  }, [state]);

  const battleTotal = useMemo(() => {
    if (!state || turnSummaries.length === 0) return null;

    let playerDamageDealt = 0;
    let playerHpLost = 0;
    let enemyDamageDealt = 0;
    let enemyHpLost = 0;
    let playerInnerDelta = 0;
    let enemyInnerDelta = 0;

    for (const s of turnSummaries) {
      playerDamageDealt += s.player.dealt;
      playerHpLost += s.player.hpLoss;
      playerInnerDelta += s.player.innerDelta;
      enemyDamageDealt += s.enemy.dealt;
      enemyHpLost += s.enemy.hpLoss;
      enemyInnerDelta += s.enemy.innerDelta;
    }

    return {
      totalTurns: turnSummaries.length,
      winnerText: state.winner === "player" ? "플레이어 승리" : state.winner === "enemy" ? "몬스터 승리" : "진행 중",
      playerDamageDealt,
      playerHpLost,
      playerInnerDelta,
      enemyDamageDealt,
      enemyHpLost,
      enemyInnerDelta,
    };
  }, [state, turnSummaries]);

  function onStart() {
    if (!state || state.isOver) return;
    setStarted(true);
    setPaused(false);
    chargeMsRef.current = 0;
    setChargeMs(0);
  }

  function onPauseToggle() {
    if (!started || !state || state.isOver) return;
    if (!paused) {
      pausedRef.current = true;
      loopTokenRef.current += 1;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setPaused(true);
      return;
    }

    pausedRef.current = false;
    setPaused(false);
  }

  return (
    <main className={`${styles.page} ${displayFont.variable} ${bodyFont.variable}`}>
      <div className={styles.shell}>
      <section className={styles.hero}>
        <div>
          <h1 className={styles.title}>{battleTitle}</h1>
          <p className={styles.subtitle}>{battleSubtitle}</p>
        </div>
        <div className={styles.badge}>BATTLE</div>
      </section>
      <div className={styles.mono} style={{ marginBottom: 12 }}>
        nodeKey: <code className={styles.code}>{nodeKey || "(none)"}</code>
      </div>

      {backgroundSrc ? (
        <section
          style={{
            width: "100%",
            maxHeight: 280,
            minHeight: 220,
            borderRadius: 10,
            overflow: "hidden",
            backgroundImage: `url(${backgroundSrc})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            marginBottom: 12,
          }}
        />
      ) : (
        <section style={{ marginBottom: 12 }}>
          <Placeholder label="NO IMAGE" />
        </section>
      )}

      {loading ? <p>전투 준비 중...</p> : null}
      {error ? <p style={{ color: "crimson" }}>{error}</p> : null}

      {state ? (
        <>
          <section className={styles.panel}>
            <div className={styles.toolbar}>
              <button type="button" onClick={onStart} disabled={started || state.isOver} className={styles.btn}>
                전투 시작
              </button>
              <button
                type="button"
                onClick={onPauseToggle}
                disabled={!started || state.isOver}
                className={styles.btn}
              >
                {paused ? "재개" : "일시 정지"}
              </button>
              <div style={{ fontSize: 14, opacity: 0.85 }}>
                상태: <strong>{statusText}</strong>
              </div>
              <div style={{ fontSize: 13, opacity: 0.75 }}>전투 시간: {state.timeSec.toFixed(1)}s</div>
            </div>
          </section>

          <section className={`${styles.panel} ${styles.split}`}>
            <div>
              {playerImageSrc && !playerImageMissing ? (
                <img
                  src={playerImageSrc}
                  alt="플레이어"
                  onError={() => setPlayerImageMissing(true)}
                  className={styles.imgBox}
                />
              ) : (
                <Placeholder label="NO IMAGE" height={420} />
              )}
              <div style={{ marginTop: 8, fontWeight: 700 }}>{state.player.name}</div>
              <div>HP: {state.player.hp} / {state.player.hpMax}</div>
              <div>내공: {Math.round(state.player.inner)} / {state.player.innerMax} (턴당 +{state.player.innerRegen})</div>
              <div>공격/방어/속도: {state.player.atk} / {state.player.def} / {state.player.speed}</div>
              <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>보유 스킬: {state.player.skills.length}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                {state.player.skills.map((skill) => (
                  <SkillBadge key={`p-${skill.key}`} label={`${skill.kind} · ${skill.name}`} />
                ))}
              </div>
            </div>

            <div>
              {monsterImageSrc && !monsterImageMissing ? (
                <img
                  src={monsterImageSrc}
                  alt={state.enemy.name}
                  onError={() => setMonsterImageMissing(true)}
                  className={styles.imgBox}
                />
              ) : (
                <Placeholder label="NO IMAGE" height={420} />
              )}
              <div style={{ marginTop: 8, fontWeight: 700 }}>{state.enemy.name}</div>
              <div>HP: {state.enemy.hp} / {state.enemy.hpMax}</div>
              <div>내공: {Math.round(state.enemy.inner)} / {state.enemy.innerMax} (턴당 +{state.enemy.innerRegen})</div>
              <div>공격/방어/속도: {state.enemy.atk} / {state.enemy.def} / {state.enemy.speed}</div>
              <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>보유 스킬: {state.enemy.skills.length}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                {state.enemy.skills.map((skill) => (
                  <SkillBadge key={`e-${skill.key}`} label={`${skill.kind} · ${skill.name}`} />
                ))}
              </div>
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelTitle}>행동 판정 바</div>
            <div style={{ width: "100%", height: 14, borderRadius: 999, background: "#eee", overflow: "hidden", marginBottom: 6 }}>
              <div
                style={{
                  width: `${(chargeRatio * 100).toFixed(1)}%`,
                  height: "100%",
                  background: "linear-gradient(90deg, #60a5fa, #2563eb)",
                  transition: `width ${TICK_MS}ms linear`,
                }}
              />
            </div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              {(chargeRatio * 100).toFixed(0)}% / 100% · 100% 도달 시 전투 판정 1회 실행 (주기: {(roundIntervalMs / 1000).toFixed(1)}초)
            </div>
          </section>

          {state.isOver && rewardState ? (
            <section
              style={{
                border: "1px solid rgba(224,188,118,0.45)",
                borderRadius: 12,
                padding: 14,
                marginBottom: 12,
                background:
                  rewardState.win
                    ? "linear-gradient(140deg, rgba(58,102,82,0.20), rgba(8,14,20,0.88))"
                    : "linear-gradient(140deg, rgba(109,47,43,0.24), rgba(8,14,20,0.88))",
                color: "#f3efe4",
                boxShadow: "0 10px 26px rgba(0,0,0,0.35)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontWeight: 800, fontSize: 18 }}>전투 결과</div>
                <div
                  style={{
                    borderRadius: 999,
                    padding: "4px 10px",
                    border: `1px solid ${rewardState.win ? "rgba(106,209,164,0.7)" : "rgba(239,109,99,0.7)"}`,
                    color: rewardState.win ? "#6ad1a4" : "#ef6d63",
                    fontWeight: 800,
                    fontSize: 13,
                  }}
                >
                  {rewardState.win ? "승리" : "패배"}
                </div>
              </div>

              {rewardState.status === "pending" ? <div>보상 정산 중...</div> : null}
              {rewardState.status === "error" ? <div style={{ color: "#ef6d63" }}>{rewardState.message ?? "오류"}</div> : null}

              {rewardState.status === "done" && rewardState.win ? (
                <div>
                  <div style={{ marginBottom: 6, fontWeight: 700, color: "#e0bc76" }}>획득 아이템</div>
                  {rewardState.drops.length === 0 ? <div>없음</div> : null}
                  <div style={{ display: "grid", gap: 6 }}>
                    {rewardState.drops.map((d, idx) => (
                      <div
                        key={`${d.itemId}-${idx}`}
                        style={{
                          border: "1px solid rgba(255,255,255,0.18)",
                          borderRadius: 8,
                          padding: "6px 10px",
                          background: "rgba(8,14,20,0.62)",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          width: "fit-content",
                          maxWidth: "100%",
                        }}
                      >
                        <span>{d.itemId}</span>
                        <strong style={{ color: "#89d1de" }}>x{d.qty}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {rewardState.status === "done" && !rewardState.win ? <div>획득 아이템 없음</div> : null}
            </section>
          ) : null}

          {state.isOver && battleTotal ? (
            <section
              style={{
                border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: 10,
                padding: 14,
                marginBottom: 12,
                background: "rgba(8, 14, 20, 0.82)",
                color: "#f3efe4",
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 8 }}>전투 내용 요약</div>
              <div style={{ fontSize: 14, lineHeight: 1.6 }}>
                <div>결과: {battleTotal.winnerText}</div>
                <div>총 턴: {battleTotal.totalTurns}</div>
                <div>
                  플레이어 총합: 가한피해{" "}
                  <span style={{ color: "#c2410c", fontWeight: 700 }}>{battleTotal.playerDamageDealt}</span>, 받은피해{" "}
                  <span style={{ color: "#dc2626", fontWeight: 700 }}>{battleTotal.playerHpLost}</span>, 내공 변화{" "}
                  <span style={{ color: battleTotal.playerInnerDelta >= 0 ? "#1d4ed8" : "#dc2626", fontWeight: 700 }}>
                    {battleTotal.playerInnerDelta >= 0 ? "+" : ""}
                    {battleTotal.playerInnerDelta}
                  </span>
                </div>
                <div>
                  적 총합: 가한피해 <span style={{ color: "#c2410c", fontWeight: 700 }}>{battleTotal.enemyDamageDealt}</span>, 받은피해{" "}
                  <span style={{ color: "#dc2626", fontWeight: 700 }}>{battleTotal.enemyHpLost}</span>, 내공 변화{" "}
                  <span style={{ color: battleTotal.enemyInnerDelta >= 0 ? "#1d4ed8" : "#dc2626", fontWeight: 700 }}>
                    {battleTotal.enemyInnerDelta >= 0 ? "+" : ""}
                    {battleTotal.enemyInnerDelta}
                  </span>
                </div>
              </div>
            </section>
          ) : null}

          <section className={styles.panel}>
            <div className={styles.panelTitle}>전투 로그</div>
            <div
              ref={logContainerRef}
              className={styles.logWrap}
            >
              {state.log.map((line, idx) => {
                const parsed = parseTurnSummary(line);
                if (parsed) {
                  return (
                    <div
                      key={`${idx}-${line}`}
                      style={{
                        fontSize: 14,
                        marginTop: 8,
                        marginBottom: 8,
                        padding: "8px 10px",
                        border: "1px solid rgba(255,255,255,0.22)",
                        borderRadius: 8,
                        background: "rgba(8, 14, 20, 0.84)",
                        color: "#f3efe4",
                        lineHeight: 1.6,
                      }}
                    >
                      <div>{`턴수: ${parsed.turn}`}</div>
                      <div>
                        {renderColoredLogLine(
                          `플레이어: HP-${parsed.player.hpLoss}, 가한피해 ${parsed.player.dealt}, 내공 ${parsed.player.innerDelta >= 0 ? "+" : ""}${parsed.player.innerDelta}`,
                          state.player.name,
                          state.enemy.name,
                        )}
                      </div>
                      <div>
                        {renderColoredLogLine(
                          `적: HP-${parsed.enemy.hpLoss}, 가한피해 ${parsed.enemy.dealt}, 내공 ${parsed.enemy.innerDelta >= 0 ? "+" : ""}${parsed.enemy.innerDelta}`,
                          state.player.name,
                          state.enemy.name,
                        )}
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={`${idx}-${line}`} style={{ fontSize: 14 }}>
                    {renderColoredLogLine(line, state.player.name, state.enemy.name)}
                  </div>
                );
              })}
            </div>
          </section>
        </>
      ) : null}

      <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Link
          href={`/world?at=N1_TOWN&lv=${userLevel}`}
          className={styles.btn}
        >
          마을로 돌아가기
        </Link>
        <Link href="/rpg" className={styles.btn}>
          {toRpgLabel}
        </Link>
      </div>
      </div>
    </main>
  );
}
