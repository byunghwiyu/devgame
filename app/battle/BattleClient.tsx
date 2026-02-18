"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { applyPlayerAction, createBattle, type BattleState as EngineBattleState, type Fighter } from "@/lib/game/battle";
import { calcSynergy } from "@/lib/game/synergy";
import { BattleState as InputPhase } from "@/lib/game/battleState";
import { charUrl, monsterUrl } from "@/lib/ui/assets";

type MonsterDto = {
  key: string;
  name: string;
  hp: number;
  atk: number;
  def: number;
  exp: number;
  goldMin: number;
  goldMax: number;
  imageKey?: string;
  element?: string;
  yinyang?: string;
  speed?: number;
};

type UiTokenDef = {
  key: string;
  name: string;
  slot: "MOVE" | "ATTACK" | "DEFENSE" | "BUFF";
  category: string;
};

type SetupResponse = {
  nodeKey: string;
  monsterKey: string;
  monster: MonsterDto;
  tokenDefs?: UiTokenDef[];
  config?: {
    attackTimeoutMs?: number;
    defenseTimeoutMs?: number;
  };
};

type Props = {
  nodeKey: string;
  userLevel: number;
  backgroundSrc: string | null;
};

type LogMode = "SUMMARY" | "DETAIL";

type EnemyResponseCandidate = {
  id: string;
  tokens: string[];
  reason: string;
  weight: number;
};

const playerTemplate: Fighter = {
  name: "플레이어",
  hp: 50,
  atk: 12,
  def: 3,
  speed: 12,
  element: "METAL",
  yinyang: "YANG",
};

const FALLBACK_TOKEN_DEFS: UiTokenDef[] = [
  { key: "JUMP", name: "점프", slot: "MOVE", category: "이동" },
  { key: "MOVE", name: "경공", slot: "MOVE", category: "이동" },
  { key: "ATTACK", name: "선인지로", slot: "ATTACK", category: "공격" },
  { key: "DEFENSE", name: "보법", slot: "DEFENSE", category: "방어" },
  { key: "BUFF", name: "기공", slot: "BUFF", category: "버프" },
  { key: "BLOCK", name: "막기", slot: "DEFENSE", category: "방어" },
];

const DEFAULT_TIMEOUT_ATTACK_INPUT = "[기공][선인지로]";
const DEFAULT_TIMEOUT_ATTACK_TOKENS = ["BUFF", "ATTACK"];

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

function parseTokenKeys(inputText: string, nameToKey: Map<string, string>): string[] {
  const matches = inputText.matchAll(/\[(.*?)\]/g);
  const keys: string[] = [];

  for (const match of matches) {
    const rawName = (match[1] ?? "").replace(/\r/g, "").trim();
    if (!rawName) continue;
    const mapped = nameToKey.get(rawName) ?? rawName.toUpperCase();
    keys.push(mapped);
  }

  return keys;
}

function pickRandomTokens(count: number, tokenDefs: UiTokenDef[]): string[] {
  if (tokenDefs.length === 0) return ["ATTACK"];

  const result: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const idx = Math.floor(Math.random() * tokenDefs.length);
    result.push(tokenDefs[idx].key);
  }
  return result;
}

function buildSummaryLogs(logs: string[], playerName: string, enemyName: string): string[] {
  if (logs.length === 0) return [];

  type RoundSummary = {
    round: number;
    initiative?: string;
    dealtToEnemy: number;
    tookFromEnemy: number;
    timeouts: string[];
    endings: string[];
  };

  const rounds: RoundSummary[] = [];
  let current: RoundSummary | null = null;

  for (const line of logs) {
    if (line === "라운드 시작") {
      current = {
        round: rounds.length + 1,
        dealtToEnemy: 0,
        tookFromEnemy: 0,
        timeouts: [],
        endings: [],
      };
      rounds.push(current);
      continue;
    }

    if (!current) continue;

    if (line.startsWith("공격권:")) {
      current.initiative = line.replace("공격권:", "").trim();
      continue;
    }

    if (line.includes("시간 초과!")) {
      current.timeouts.push(line);
      continue;
    }

    const dealtMatch = line.match(/dealt\s+(\d+)\s+damage\s+to\s+(.+)\./i);
    if (dealtMatch) {
      const dmg = Number(dealtMatch[1]);
      const target = dealtMatch[2]?.trim() ?? "";
      if (target.includes(enemyName)) current.dealtToEnemy += Number.isFinite(dmg) ? dmg : 0;
      if (target.includes(playerName)) current.tookFromEnemy += Number.isFinite(dmg) ? dmg : 0;
      continue;
    }

    if (line.includes("was defeated") || line.includes("전투 종료") || line.includes("승리")) {
      current.endings.push(line);
    }
  }

  const lines = rounds.map((r) => {
    const parts: string[] = [
      `R${r.round}`,
      `선공 ${r.initiative ?? "-"}`,
      `가한 피해 ${r.dealtToEnemy}`,
      `받은 피해 ${r.tookFromEnemy}`,
    ];

    if (r.timeouts.length > 0) parts.push(`시간초과 ${r.timeouts.join(" / ")}`);
    if (r.endings.length > 0) parts.push(r.endings.join(" / "));

    return parts.join(" | ");
  });

  return lines.length > 0 ? lines : ["아직 라운드 로그가 없습니다."];
}

function countTagPrefix(tags: string[], prefix: string): number {
  let count = 0;
  for (const tag of tags) {
    if (tag.startsWith(prefix)) count += 1;
  }
  return count;
}

function getEnemyResponseCandidates(playerAttackTokens: string[]): EnemyResponseCandidate[] {
  const analysis = calcSynergy(playerAttackTokens);
  const allTags = analysis.applied.flatMap((r) => r.tags);
  const topTag = allTags[0] ?? "none";

  const airCount = countTagPrefix(allTags, "air_");
  const approachCount = countTagPrefix(allTags, "approach_");
  const burstCount = countTagPrefix(allTags, "burst_");
  const highPressure = analysis.rawScore > 300;
  const pressureBonus = highPressure ? 3 : 0;

  const candidates: EnemyResponseCandidate[] = [
    {
      id: "solid_guard",
      tokens: ["DEFENSE", "BUFF"],
      reason: highPressure ? `고압 방어(air 대응, topTag=${topTag})` : airCount > 0 ? "air_combo 대응" : "기본 방어",
      weight: 1 + airCount * 2 + pressureBonus,
    },
    {
      id: "evade_guard",
      tokens: ["MOVE", "DEFENSE"],
      reason: approachCount > 0 ? `approach_combo 대응(topTag=${topTag})` : "진입 대응",
      weight: 1 + approachCount * 2,
    },
    {
      id: "counter_guard",
      tokens: ["DEFENSE", "ATTACK"],
      reason: highPressure ? "고압 카운터 태세" : "카운터 태세",
      weight: 1 + Math.floor((airCount + approachCount + burstCount) / 2),
    },
    {
      id: "prepared_guard",
      tokens: ["BUFF", "DEFENSE"],
      reason: highPressure ? `고압 방어 준비(burst 대응, topTag=${topTag})` : burstCount > 0 ? "burst_combo 대응" : "준비 방어",
      weight: 1 + burstCount * 2 + pressureBonus,
    },
  ];

  candidates.sort((a, b) => b.weight - a.weight);
  return candidates;
}

export default function BattleClient({ nodeKey, userLevel, backgroundSrc }: Props) {
  const [state, setState] = useState<EngineBattleState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isStarted, setIsStarted] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [monsterImageSrc, setMonsterImageSrc] = useState<string | null>(null);
  const [playerImageMissing, setPlayerImageMissing] = useState(false);
  const [monsterImageMissing, setMonsterImageMissing] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [tokenDefs, setTokenDefs] = useState<UiTokenDef[]>(FALLBACK_TOKEN_DEFS);
  const [inputPhase, setInputPhase] = useState<InputPhase>(InputPhase.IDLE);
  const [attackCountdownMs, setAttackCountdownMs] = useState(6000);
  const [attackTimeoutConfigMs, setAttackTimeoutConfigMs] = useState(6000);
  const [logMode, setLogMode] = useState<LogMode>("SUMMARY");

  const isOver = state?.isOver ?? false;
  const playerImageSrc = charUrl("char_player_01");

  const tokenNameToKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const token of tokenDefs) map.set(token.name, token.key);
    return map;
  }, [tokenDefs]);

  const tokenKeyToName = useMemo(() => {
    const map = new Map<string, string>();
    for (const token of tokenDefs) map.set(token.key, token.name);
    return map;
  }, [tokenDefs]);

  const formatTokenNames = (keys: string[]) => keys.map((k) => tokenKeyToName.get(k) ?? k).join(">");

  const tokenGroups = useMemo(() => {
    const groups = new Map<string, UiTokenDef[]>();
    for (const token of tokenDefs) {
      const category = token.category || token.slot;
      const list = groups.get(category) ?? [];
      list.push(token);
      groups.set(category, list);
    }
    return [...groups.entries()];
  }, [tokenDefs]);

  const summaryLogs = useMemo(() => {
    if (!state) return [];
    return buildSummaryLogs(state.log, state.player.name, state.enemy.name);
  }, [state]);

  const currentAttackTokens = useMemo(() => {
    const parsed = parseTokenKeys(chatInput, tokenNameToKey);
    return parsed.length > 0 ? parsed : DEFAULT_TIMEOUT_ATTACK_TOKENS;
  }, [chatInput, tokenNameToKey]);

  const enemyResponseCandidates = useMemo(() => {
    return getEnemyResponseCandidates(currentAttackTokens);
  }, [currentAttackTokens]);

  const enemyPrimaryResponse = enemyResponseCandidates[0] ?? {
    id: "fallback",
    tokens: ["DEFENSE", "BUFF"],
    reason: "기본 방어",
    weight: 1,
  };

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
      setIsStarted(false);
      setIsPaused(false);
      setMonsterImageSrc(null);
      setPlayerImageMissing(false);
      setMonsterImageMissing(false);
      setChatInput("");
      setInputPhase(InputPhase.IDLE);
      setAttackCountdownMs(6000);
      setAttackTimeoutConfigMs(6000);
      setLogMode("SUMMARY");
      setTokenDefs(FALLBACK_TOKEN_DEFS);

      try {
        const res = await fetch(`/api/battle/setup?at=${encodeURIComponent(nodeKey)}`, { cache: "no-store" });
        const data = (await res.json()) as SetupResponse | { error: string };

        if (!res.ok || !("monster" in data)) {
          setError("error" in data ? data.error : "전투 준비 중 오류가 발생했습니다.");
          setState(null);
          return;
        }

        const enemy: Fighter = {
          name: data.monster.name,
          hp: data.monster.hp,
          atk: data.monster.atk,
          def: data.monster.def,
          speed: data.monster.speed ?? 10,
          element: data.monster.element ?? "EARTH",
          yinyang: data.monster.yinyang ?? "YIN",
        };

        if (mounted) {
          const timeoutMs = Math.max(1000, Math.floor(data.config?.attackTimeoutMs ?? 6000));
          setAttackTimeoutConfigMs(timeoutMs);
          setAttackCountdownMs(timeoutMs);
          setState(createBattle(playerTemplate, enemy));
          setMonsterImageSrc(monsterUrl(data.monster.imageKey));
          if (Array.isArray(data.tokenDefs) && data.tokenDefs.length > 0) {
            setTokenDefs(
              data.tokenDefs.map((token) => ({
                key: token.key,
                name: token.name,
                slot: token.slot,
                category: token.category || token.slot,
              })),
            );
          }
        }
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
    if (!isStarted || isPaused || isOver || inputPhase !== InputPhase.ATTACK_INPUT) return;

    const timer = setInterval(() => {
      setAttackCountdownMs((prev) => {
        const next = Math.max(0, prev - 100);
        if (next <= 0) {
          const timeoutResponse = getEnemyResponseCandidates(DEFAULT_TIMEOUT_ATTACK_TOKENS)[0] ?? enemyPrimaryResponse;

          setState((prevState) => {
            if (!prevState || prevState.isOver) return prevState;
            const withTimeoutLog = {
              ...prevState,
              log: [...prevState.log, "시간 초과! 기본 공격 발동"],
            };
            return applyPlayerAction(withTimeoutLog, "ATTACK", {
              playerAttackInput: DEFAULT_TIMEOUT_ATTACK_INPUT,
              playerAttackTokens: DEFAULT_TIMEOUT_ATTACK_TOKENS,
              enemyDefenseTokens: timeoutResponse.tokens,
              enemyAttackTokens: pickRandomTokens(2, tokenDefs),
              playerDefenseTokens: [],
            });
          });
          setInputPhase(InputPhase.IDLE);
          return 0;
        }
        return next;
      });
    }, 100);

    return () => clearInterval(timer);
  }, [inputPhase, isStarted, isPaused, isOver, tokenDefs, enemyPrimaryResponse]);

  useEffect(() => {
    if (!isStarted || isPaused || isOver || inputPhase !== InputPhase.IDLE) return;

    const timer = setTimeout(() => {
      setChatInput("");
      setAttackCountdownMs(attackTimeoutConfigMs);
      setInputPhase(InputPhase.ATTACK_INPUT);
    }, 500);

    return () => clearTimeout(timer);
  }, [attackTimeoutConfigMs, inputPhase, isOver, isPaused, isStarted]);

  function appendToken(label: string) {
    if (!isStarted || inputPhase !== InputPhase.ATTACK_INPUT || isPaused) return;
    setChatInput((prev) => `${prev}[${label}]`);
  }

  function startBattle() {
    if (!state || state.isOver) return;
    setIsStarted(true);
    setIsPaused(false);
    setChatInput("");
    setAttackCountdownMs(attackTimeoutConfigMs);
    setInputPhase(InputPhase.ATTACK_INPUT);
  }

  function togglePause() {
    if (!isStarted || isOver) return;
    setIsPaused((prev) => !prev);
  }

  function submitChatCombo(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isStarted || isPaused || inputPhase !== InputPhase.ATTACK_INPUT) return;

    const parsed = parseTokenKeys(chatInput, tokenNameToKey);
    if (parsed.length === 0) return;

    const response = getEnemyResponseCandidates(parsed)[0] ?? enemyPrimaryResponse;

    setState((prevState) => {
      if (!prevState || prevState.isOver) return prevState;
      return applyPlayerAction(prevState, "ATTACK", {
        playerAttackInput: chatInput,
        playerAttackTokens: parsed,
        enemyDefenseTokens: response.tokens,
        enemyAttackTokens: pickRandomTokens(2, tokenDefs),
        playerDefenseTokens: [],
      });
    });

    setInputPhase(InputPhase.IDLE);
  }

  return (
    <main style={{ padding: 24, maxWidth: 980, margin: "0 auto", fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>전투</h1>
      <div style={{ opacity: 0.7, marginBottom: 12 }}>
        nodeKey: <code>{nodeKey || "(none)"}</code>
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
          <section
            style={{
              border: "1px solid #ddd",
              borderRadius: 10,
              padding: 14,
              marginBottom: 12,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 14,
            }}
          >
            <div>
              {playerImageSrc && !playerImageMissing ? (
                <img
                  src={playerImageSrc}
                  alt="플레이어"
                  onError={() => setPlayerImageMissing(true)}
                  style={{
                    width: "100%",
                    height: 420,
                    objectFit: "contain",
                    borderRadius: 10,
                    marginBottom: 8,
                    border: "1px solid #eee",
                    background: "#fafafa",
                  }}
                />
              ) : (
                <Placeholder label="NO IMAGE" height={420} />
              )}
              <div style={{ fontSize: 13, opacity: 0.7 }}>플레이어</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{state.player.name}</div>
              <div>HP: {state.player.hp}</div>
            </div>

            <div>
              {monsterImageSrc && !monsterImageMissing ? (
                <img
                  src={monsterImageSrc}
                  alt={state.enemy.name}
                  onError={() => setMonsterImageMissing(true)}
                  style={{
                    width: "100%",
                    height: 420,
                    objectFit: "contain",
                    borderRadius: 10,
                    marginBottom: 8,
                    border: "1px solid #eee",
                    background: "#fafafa",
                  }}
                />
              ) : (
                <Placeholder label="NO IMAGE" height={420} />
              )}
              <div style={{ fontSize: 13, opacity: 0.7 }}>몬스터</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{state.enemy.name}</div>
              <div>HP: {state.enemy.hp}</div>
            </div>

            {state.isOver ? (
              <div style={{ gridColumn: "1 / span 2", marginTop: 4, fontWeight: 700 }}>
                전투 종료: {state.winner === "player" ? "플레이어 승리" : "적 승리"}
              </div>
            ) : null}
          </section>

          <section style={{ border: "1px solid #ddd", borderRadius: 10, padding: 14, marginBottom: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>전투 시작</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={startBattle}
                disabled={isStarted || state.isOver}
                style={{ padding: "8px 12px" }}
              >
                전투 시작
              </button>
              <button
                type="button"
                onClick={togglePause}
                disabled={!isStarted || state.isOver}
                style={{ padding: "8px 12px" }}
              >
                {isPaused ? "재개" : "일시 정지"}
              </button>
              <div style={{ alignSelf: "center", fontSize: 13, opacity: 0.75 }}>
                {!isStarted ? "대기 중" : isPaused ? "일시 정지" : "자동 다음 라운드 진행 중"}
              </div>
            </div>
            {isStarted && inputPhase === InputPhase.ATTACK_INPUT ? (
              <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
                ATTACK_INPUT 남은 시간: {(attackCountdownMs / 1000).toFixed(1)}s
              </div>
            ) : null}
          </section>

          <section style={{ border: "1px solid #ddd", borderRadius: 10, padding: 14, marginBottom: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>대상 상태 (공격 전 확인)</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, fontSize: 14 }}>
              <div>이름: <strong>{state.enemy.name}</strong></div>
              <div>HP: <strong>{state.enemy.hp}</strong></div>
              <div>속도: <strong>{state.enemy.speed}</strong></div>
              <div>공격력: <strong>{state.enemy.atk}</strong></div>
              <div>방어력: <strong>{state.enemy.def}</strong></div>
              <div>속성: <strong>{state.enemy.element ?? "NEUTRAL"}/{state.enemy.yinyang ?? "NEUTRAL"}</strong></div>
            </div>
            <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: "#f8f8f8", border: "1px solid #eee" }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>예상 대응 토큰</div>
              <div>대표 대응: <strong>{formatTokenNames(enemyPrimaryResponse.tokens)}</strong></div>
              <div style={{ fontSize: 13, opacity: 0.85 }}>이유: {enemyPrimaryResponse.reason}</div>
              <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
                후보: {enemyResponseCandidates.slice(0, 3).map((c) => `${formatTokenNames(c.tokens)}(w=${c.weight})`).join(" | ")}
              </div>
            </div>
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
              상태이상: 현재 구현 없음 (기본 스탯/속성 + 대응 토큰 예측 표시)
            </div>
          </section>

          <section style={{ border: "1px solid #ddd", borderRadius: 10, padding: 14, marginBottom: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>콤보 입력</div>
            {tokenGroups.map(([category, tokens]) => (
              <div key={category} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 6 }}>
                  {category}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {tokens.map((token) => (
                    <button
                      key={`${token.key}-${token.name}`}
                      type="button"
                      onClick={() => appendToken(token.name)}
                      disabled={!isStarted || inputPhase !== InputPhase.ATTACK_INPUT || state.isOver || isPaused}
                      style={{
                        border: "1px solid #ccc",
                        borderRadius: 999,
                        padding: "6px 10px",
                        background: "#fff",
                        cursor: "pointer",
                      }}
                    >
                      {token.name} ({token.slot})
                    </button>
                  ))}
                </div>
              </div>
            ))}

            <form onSubmit={submitChatCombo} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 6 }}>채팅 입력</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="[점프][경공][기공][선인지로]"
                  disabled={!isStarted || inputPhase !== InputPhase.ATTACK_INPUT || state.isOver || isPaused}
                  style={{
                    flex: 1,
                    border: "1px solid #ccc",
                    borderRadius: 8,
                    padding: "8px 10px",
                  }}
                />
                <button
                  type="submit"
                  style={{ padding: "8px 12px" }}
                  disabled={!isStarted || inputPhase !== InputPhase.ATTACK_INPUT || state.isOver || isPaused}
                >
                  제출
                </button>
              </div>
            </form>

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div style={{ fontWeight: 700 }}>로그</div>
              <button
                type="button"
                onClick={() => setLogMode("SUMMARY")}
                style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  border: logMode === "SUMMARY" ? "1px solid #333" : "1px solid #ccc",
                  background: logMode === "SUMMARY" ? "#f1f1f1" : "#fff",
                }}
              >
                간략
              </button>
              <button
                type="button"
                onClick={() => setLogMode("DETAIL")}
                style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  border: logMode === "DETAIL" ? "1px solid #333" : "1px solid #ccc",
                  background: logMode === "DETAIL" ? "#f1f1f1" : "#fff",
                }}
              >
                디테일
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 260, overflowY: "auto" }}>
              {(logMode === "SUMMARY" ? [...summaryLogs].reverse() : [...state.log].reverse()).map((line, idx) => (
                <div key={`${idx}-${line}`} style={{ fontSize: 14 }}>
                  {line}
                </div>
              ))}
            </div>
          </section>
        </>
      ) : null}

      <div style={{ marginTop: 12 }}>
        <Link
          href={`/world?at=N1_TOWN&lv=${userLevel}`}
          style={{
            display: "inline-block",
            border: "1px solid #ccc",
            borderRadius: 8,
            padding: "8px 12px",
            textDecoration: "none",
          }}
        >
          마을로 돌아가기
        </Link>
      </div>
    </main>
  );
}


