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
    battleFloatFadeMs?: number;
    battleFloatXMin?: number;
    battleFloatXMax?: number;
    battleFloatYMin?: number;
    battleFloatYMax?: number;
  };
};

type FightRewardApiResponse = {
  ok: boolean;
  idempotent?: boolean;
  error?: string;
  result?: {
    win: boolean;
    drops?: Array<{ itemId: string; qty: number }>;
    loot?: {
      items?: Array<{ itemId: string; qty: number }>;
      currencies?: Array<{ currencyId: string; amount: number }>;
      exp?: number;
    };
  };
};

type Props = {
  nodeKey: string;
  userLevel: number;
  backgroundSrc: string | null;
};

type UiTextMap = Record<string, string>;

const DEFAULT_ROUND_INTERVAL_MS = 3000;
const DEFAULT_FLOAT_FADE_MS = 1200;
const DEFAULT_FLOAT_RANGE = { xMin: 40, xMax: 60, yMin: 28, yMax: 50 };
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

function SkillBadge({ label, tooltip }: { label: string; tooltip?: string }) {
  return (
    <span className={styles.skillBadgeWrap}>
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
      {tooltip ? <span className={styles.skillTooltip}>{tooltip}</span> : null}
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

type ActionEvent = {
  attacker: "player" | "enemy";
  defender?: "player" | "enemy";
  text: string;
  kind: "attack" | "wait";
};

type StatDelta = {
  hp: number;
  inner: number;
  atk: number;
  def: number;
  spd: number;
};

type SideSnapshot = {
  hp: number;
  inner: number;
  atk: number;
  def: number;
  spd: number;
};

type FloatingDelta = {
  id: string;
  dedupeKey: string;
  text: string;
  x: number;
  y: number;
  tone: "damage" | "inner" | "stat";
};

function zeroDelta(): StatDelta {
  return { hp: 0, inner: 0, atk: 0, def: 0, spd: 0 };
}

function findLatestTurnSummary(lines: string[]): { summary: TurnSummaryParsed; index: number } | null {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const summary = parseTurnSummary(lines[i]);
    if (summary) return { summary, index: i };
  }
  return null;
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
  const [floatFadeMs, setFloatFadeMs] = useState(DEFAULT_FLOAT_FADE_MS);
  const [floatRange, setFloatRange] = useState(DEFAULT_FLOAT_RANGE);
  const [playerImageSrc, setPlayerImageSrc] = useState<string | null>(null);
  const [monsterImageSrc, setMonsterImageSrc] = useState<string | null>(null);
  const [currentMonsterKey, setCurrentMonsterKey] = useState<string>("");
  const [rewardState, setRewardState] = useState<{
    status: "pending" | "done" | "error";
    win: boolean;
    drops: Array<{ itemId: string; qty: number }>;
    currencies: Array<{ currencyId: string; amount: number }>;
    exp: number;
    message?: string;
  } | null>(null);
  const [playerImageMissing, setPlayerImageMissing] = useState(false);
  const [monsterImageMissing, setMonsterImageMissing] = useState(false);
  const [actionEvent, setActionEvent] = useState<ActionEvent | null>(null);
  const [actionPulse, setActionPulse] = useState(0);
  const [statDelta, setStatDelta] = useState<{ player: StatDelta; enemy: StatDelta }>({
    player: zeroDelta(),
    enemy: zeroDelta(),
  });
  const [floatingDelta, setFloatingDelta] = useState<{ player: FloatingDelta[]; enemy: FloatingDelta[] }>({
    player: [],
    enemy: [],
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loopTokenRef = useRef(0);
  const logContainerRef = useRef<HTMLDivElement | null>(null);
  const pausedRef = useRef(false);
  const startedRef = useRef(false);
  const isOverRef = useRef(false);
  const chargeMsRef = useRef(0);
  const rewardRequestedRef = useRef(false);
  const lastSummaryIndexRef = useRef(-1);
  const prevSnapshotRef = useRef<{ player: SideSnapshot; enemy: SideSnapshot } | null>(null);
  const floatTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const activeFloatKeysRef = useRef<Set<string>>(new Set());

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
    if (!state || state.log.length === 0) return;
    const found = findLatestTurnSummary(state.log);
    if (!found) return;
    if (found.index <= lastSummaryIndexRef.current) return;
    lastSummaryIndexRef.current = found.index;

    const playerDealt = found.summary.player.dealt;
    const enemyDealt = found.summary.enemy.dealt;
    const attacker: "player" | "enemy" = playerDealt >= enemyDealt ? "player" : "enemy";
    const defender: "player" | "enemy" = attacker === "player" ? "enemy" : "player";
    const topDamage = Math.max(playerDealt, enemyDealt);
    const attackerName = attacker === "player" ? state.player.name : state.enemy.name;
    const defenderName = defender === "player" ? state.player.name : state.enemy.name;
    const text = `턴 ${found.summary.turn} 연출: ${attackerName} 우세 (피해 ${topDamage}) -> ${defenderName}`;

    setActionEvent({
      attacker,
      defender,
      text,
      kind: "attack",
    });
    setActionPulse((v) => v + 1);
  }, [state?.log.length, state]);

  useEffect(() => {
    if (!state) return;
    const current = {
      player: {
        hp: state.player.hp,
        inner: Math.round(state.player.inner),
        atk: state.player.atk,
        def: state.player.def,
        spd: state.player.speed,
      },
      enemy: {
        hp: state.enemy.hp,
        inner: Math.round(state.enemy.inner),
        atk: state.enemy.atk,
        def: state.enemy.def,
        spd: state.enemy.speed,
      },
    };

    const prev = prevSnapshotRef.current;
    if (!prev) {
      prevSnapshotRef.current = current;
      setStatDelta({ player: zeroDelta(), enemy: zeroDelta() });
      return;
    }

    setStatDelta({
      player: {
        hp: current.player.hp - prev.player.hp,
        inner: current.player.inner - prev.player.inner,
        atk: current.player.atk - prev.player.atk,
        def: current.player.def - prev.player.def,
        spd: current.player.spd - prev.player.spd,
      },
      enemy: {
        hp: current.enemy.hp - prev.enemy.hp,
        inner: current.enemy.inner - prev.enemy.inner,
        atk: current.enemy.atk - prev.enemy.atk,
        def: current.enemy.def - prev.enemy.def,
        spd: current.enemy.spd - prev.enemy.spd,
      },
    });

    const nextFloating: Array<{ side: "player" | "enemy"; text: string; tone: "damage" | "inner" | "stat" }> = [];
    const pushIfDown = (side: "player" | "enemy", label: string, value: number, tone: "damage" | "inner" | "stat") => {
      if (value < 0) nextFloating.push({ side, text: `${label}${value}`, tone });
    };
    pushIfDown("player", "HP ", current.player.hp - prev.player.hp, "damage");
    pushIfDown("player", "내공 ", current.player.inner - prev.player.inner, "inner");
    pushIfDown("player", "ATK ", current.player.atk - prev.player.atk, "stat");
    pushIfDown("player", "DEF ", current.player.def - prev.player.def, "stat");
    pushIfDown("player", "SPD ", current.player.spd - prev.player.spd, "stat");
    pushIfDown("enemy", "HP ", current.enemy.hp - prev.enemy.hp, "damage");
    pushIfDown("enemy", "내공 ", current.enemy.inner - prev.enemy.inner, "inner");
    pushIfDown("enemy", "ATK ", current.enemy.atk - prev.enemy.atk, "stat");
    pushIfDown("enemy", "DEF ", current.enemy.def - prev.enemy.def, "stat");
    pushIfDown("enemy", "SPD ", current.enemy.spd - prev.enemy.spd, "stat");

      if (nextFloating.length > 0) {
        const now = Date.now();
        const playerAdds: FloatingDelta[] = [];
        const enemyAdds: FloatingDelta[] = [];

        nextFloating.forEach((entry, idx) => {
          const dedupeKey = `${entry.side}|${entry.tone}`;
          if (activeFloatKeysRef.current.has(dedupeKey)) return;
          activeFloatKeysRef.current.add(dedupeKey);
          const item: FloatingDelta = {
            id: `${entry.side}-${now}-${idx}-${Math.random().toString(16).slice(2, 6)}`,
            dedupeKey,
            text: entry.text,
            x: floatRange.xMin + Math.random() * Math.max(0, floatRange.xMax - floatRange.xMin),
            y: floatRange.yMin + Math.random() * Math.max(0, floatRange.yMax - floatRange.yMin),
            tone: entry.tone,
          };
          if (entry.side === "player") playerAdds.push(item);
          else enemyAdds.push(item);
        });

      if (playerAdds.length > 0 || enemyAdds.length > 0) {
        setFloatingDelta((prevFloat) => ({
          player: [...prevFloat.player, ...playerAdds],
          enemy: [...prevFloat.enemy, ...enemyAdds],
        }));

        const removeIds = new Set([...playerAdds.map((v) => v.id), ...enemyAdds.map((v) => v.id)]);
        const t = setTimeout(() => {
          for (const item of [...playerAdds, ...enemyAdds]) {
            activeFloatKeysRef.current.delete(item.dedupeKey);
          }
          setFloatingDelta((prevFloat) => ({
            player: prevFloat.player.filter((v) => !removeIds.has(v.id)),
            enemy: prevFloat.enemy.filter((v) => !removeIds.has(v.id)),
          }));
        }, floatFadeMs);
        floatTimersRef.current.push(t);
      }
    }

    prevSnapshotRef.current = current;
  }, [state?.turn, state?.player.hp, state?.player.inner, state?.player.atk, state?.player.def, state?.player.speed, state?.enemy.hp, state?.enemy.inner, state?.enemy.atk, state?.enemy.def, state?.enemy.speed, state, floatFadeMs, floatRange]);

  useEffect(() => {
    return () => {
      floatTimersRef.current.forEach((t) => clearTimeout(t));
      floatTimersRef.current = [];
      activeFloatKeysRef.current.clear();
    };
  }, []);

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
      setFloatFadeMs(DEFAULT_FLOAT_FADE_MS);
      setFloatRange(DEFAULT_FLOAT_RANGE);
      setPlayerImageMissing(false);
      setMonsterImageMissing(false);
      setRewardState(null);
      setActionEvent(null);
      setActionPulse(0);
      setFloatingDelta({ player: [], enemy: [] });
      floatTimersRef.current.forEach((t) => clearTimeout(t));
      floatTimersRef.current = [];
      activeFloatKeysRef.current.clear();
      rewardRequestedRef.current = false;
      lastSummaryIndexRef.current = -1;
      prevSnapshotRef.current = null;
      setStatDelta({ player: zeroDelta(), enemy: zeroDelta() });

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
        setFloatFadeMs(Math.max(300, Math.floor(data.config?.battleFloatFadeMs ?? DEFAULT_FLOAT_FADE_MS)));
        const xMin = Number(data.config?.battleFloatXMin ?? DEFAULT_FLOAT_RANGE.xMin);
        const xMax = Number(data.config?.battleFloatXMax ?? DEFAULT_FLOAT_RANGE.xMax);
        const yMin = Number(data.config?.battleFloatYMin ?? DEFAULT_FLOAT_RANGE.yMin);
        const yMax = Number(data.config?.battleFloatYMax ?? DEFAULT_FLOAT_RANGE.yMax);
        setFloatRange({
          xMin: Math.max(0, Math.min(100, Math.min(xMin, xMax))),
          xMax: Math.max(0, Math.min(100, Math.max(xMin, xMax))),
          yMin: Math.max(0, Math.min(100, Math.min(yMin, yMax))),
          yMax: Math.max(0, Math.min(100, Math.max(yMin, yMax))),
        });
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
        currencies: [],
        exp: 0,
      });
      return;
    }

    if (!currentMonsterKey) {
      setRewardState({
        status: "error",
        win: true,
        drops: [],
        currencies: [],
        exp: 0,
        message: "몬스터 키를 찾지 못해 보상 정산에 실패했습니다.",
      });
      return;
    }

    setRewardState({
      status: "pending",
      win: true,
      drops: [],
      currencies: [],
      exp: 0,
      message: "보상 정산 중...",
    });

    const requestId = `battle-${nodeKey}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    fetch("/api/rpg/fight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        monsterId: currentMonsterKey,
        requestId,
      }),
    })
      .then(async (res) => {
        const data = (await res.json()) as FightRewardApiResponse;
        if (!res.ok || !data.ok) {
          throw new Error(data.error ?? "보상 정산 실패");
        }
        const items = data.result?.loot?.items ?? data.result?.drops ?? [];
        const currencies = data.result?.loot?.currencies ?? [];
        const exp = Number(data.result?.loot?.exp ?? 0);
        setRewardState({
          status: "done",
          win: true,
          drops: items,
          currencies,
          exp: Number.isFinite(exp) ? exp : 0,
        });
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : "보상 정산 실패";
        setRewardState({
          status: "error",
          win: true,
          drops: [],
          currencies: [],
          exp: 0,
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

  function renderDelta(value: number) {
    if (!value || value < 0) return null;
    const positive = value > 0;
    return <span className={positive ? styles.deltaUp : styles.deltaDown}>{positive ? `+${value}` : `${value}`}</span>;
  }

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
            <div
              key={`player-card-${actionPulse}`}
              className={[
                styles.infoCard,
                actionEvent?.attacker === "player" ? styles.attackPulseLeft : "",
                actionEvent?.defender === "player" ? styles.hitPulse : "",
              ].join(" ")}
            >
              {playerImageSrc && !playerImageMissing ? (
                <div className={styles.imgFrame}>
                  <img
                    src={playerImageSrc}
                    alt="플레이어"
                    onError={() => setPlayerImageMissing(true)}
                    className={styles.imgBox}
                  />
                  <div className={styles.floatLayer}>
                    {floatingDelta.player.map((f) => (
                      <span
                        key={f.id}
                        className={[styles.floatDown, f.tone === "inner" ? styles.floatInner : f.tone === "stat" ? styles.floatStat : styles.floatDamage].join(" ")}
                        style={{ left: `${f.x}%`, top: `${f.y}%`, animationDuration: `${floatFadeMs}ms` }}
                      >
                        {f.text}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <Placeholder label="NO IMAGE" height={420} />
              )}
              <div style={{ marginTop: 8, fontWeight: 700 }}>{state.player.name}</div>
              <div className={styles.statLine}>
                HP: {state.player.hp} / {state.player.hpMax} ({Math.round((state.player.hp / Math.max(1, state.player.hpMax)) * 100)}%) {renderDelta(statDelta.player.hp)}
              </div>
              <div className={styles.statLine}>
                내공: {Math.round(state.player.inner)} / {state.player.innerMax} ({Math.round((Math.round(state.player.inner) / Math.max(1, state.player.innerMax)) * 100)}%) {renderDelta(statDelta.player.inner)}
                <span style={{ opacity: 0.72, marginLeft: 6 }}>(턴당 +{state.player.innerRegen})</span>
              </div>
              <div className={styles.statLine}>
                공격: {state.player.atk} {renderDelta(statDelta.player.atk)}
                <span style={{ marginLeft: 8 }}>방어: {state.player.def} {renderDelta(statDelta.player.def)}</span>
                <span style={{ marginLeft: 8 }}>속도: {state.player.speed} {renderDelta(statDelta.player.spd)}</span>
              </div>
              <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>보유 스킬: {state.player.skills.length}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                {state.player.skills.map((skill) => (
                  <SkillBadge key={`p-${skill.key}`} label={`${skill.kind} · ${skill.name}`} tooltip={skill.effectText ?? "효과 설명 없음"} />
                ))}
              </div>
            </div>

            <div
              key={`enemy-card-${actionPulse}`}
              className={[
                styles.infoCard,
                actionEvent?.attacker === "enemy" ? styles.attackPulseRight : "",
                actionEvent?.defender === "enemy" ? styles.hitPulse : "",
              ].join(" ")}
            >
              {monsterImageSrc && !monsterImageMissing ? (
                <div className={styles.imgFrame}>
                  <img
                    src={monsterImageSrc}
                    alt={state.enemy.name}
                    onError={() => setMonsterImageMissing(true)}
                    className={styles.imgBox}
                  />
                  <div className={styles.floatLayer}>
                    {floatingDelta.enemy.map((f) => (
                      <span
                        key={f.id}
                        className={[styles.floatDown, f.tone === "inner" ? styles.floatInner : f.tone === "stat" ? styles.floatStat : styles.floatDamage].join(" ")}
                        style={{ left: `${f.x}%`, top: `${f.y}%`, animationDuration: `${floatFadeMs}ms` }}
                      >
                        {f.text}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <Placeholder label="NO IMAGE" height={420} />
              )}
              <div style={{ marginTop: 8, fontWeight: 700 }}>{state.enemy.name}</div>
              <div className={styles.statLine}>
                HP: {state.enemy.hp} / {state.enemy.hpMax} ({Math.round((state.enemy.hp / Math.max(1, state.enemy.hpMax)) * 100)}%) {renderDelta(statDelta.enemy.hp)}
              </div>
              <div className={styles.statLine}>
                내공: {Math.round(state.enemy.inner)} / {state.enemy.innerMax} ({Math.round((Math.round(state.enemy.inner) / Math.max(1, state.enemy.innerMax)) * 100)}%) {renderDelta(statDelta.enemy.inner)}
                <span style={{ opacity: 0.72, marginLeft: 6 }}>(턴당 +{state.enemy.innerRegen})</span>
              </div>
              <div className={styles.statLine}>
                공격: {state.enemy.atk} {renderDelta(statDelta.enemy.atk)}
                <span style={{ marginLeft: 8 }}>방어: {state.enemy.def} {renderDelta(statDelta.enemy.def)}</span>
                <span style={{ marginLeft: 8 }}>속도: {state.enemy.speed} {renderDelta(statDelta.enemy.spd)}</span>
              </div>
              <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>보유 스킬: {state.enemy.skills.length}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                {state.enemy.skills.map((skill) => (
                  <SkillBadge key={`e-${skill.key}`} label={`${skill.kind} · ${skill.name}`} tooltip={skill.effectText ?? "효과 설명 없음"} />
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
                  {(rewardState.currencies.length > 0 || rewardState.exp > 0) ? (
                    <div style={{ marginTop: 10, display: "grid", gap: 4 }}>
                      {rewardState.currencies.map((c) => (
                        <div key={c.currencyId} style={{ fontSize: 13 }}>
                          {c.currencyId} <strong style={{ color: "#89d1de" }}>+{c.amount}</strong>
                        </div>
                      ))}
                      {rewardState.exp > 0 ? (
                        <div style={{ fontSize: 13 }}>
                          EXP <strong style={{ color: "#89d1de" }}>+{rewardState.exp}</strong>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
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
