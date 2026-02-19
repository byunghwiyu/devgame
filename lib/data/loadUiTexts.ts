import fs from "node:fs";
import path from "node:path";

export type UiTextMap = Record<string, string>;

const DEFAULT_UI_TEXTS: UiTextMap = {
  "world.title": "무림 세계 지도",
  "world.subtitle": "조건 충족 월드만 노출되며, 선택으로 진입합니다.",
  "world.to_rpg": "RPG 페이지 이동",
  "battle.title": "무림 전장 기록",
  "battle.subtitle": "전투 로그와 판정 흐름을 실시간으로 확인합니다.",
  "battle.to_rpg": "RPG 페이지 이동",
  "rpg.title": "무림 행장 기록실",
  "rpg.subtitle": "인벤토리와 장비, 성장 흐름을 이 화면에서 관리합니다.",
};

let cache: UiTextMap | null = null;

export function loadUiTexts(): UiTextMap {
  if (cache) return cache;

  const filePath = path.join(process.cwd(), "data", "csv", "ui_texts.csv");
  if (!fs.existsSync(filePath)) {
    cache = DEFAULT_UI_TEXTS;
    return cache;
  }

  const raw = fs.readFileSync(filePath, "utf8").replace(/\r/g, "").trim();
  if (!raw) {
    cache = DEFAULT_UI_TEXTS;
    return cache;
  }

  const lines = raw.split("\n").map((s) => s.trim()).filter(Boolean);
  if (lines.length < 2) {
    cache = DEFAULT_UI_TEXTS;
    return cache;
  }

  const headers = lines[0].split(",").map((s) => s.trim());
  const keyIdx = headers.indexOf("key");
  const valueIdx = headers.indexOf("value");
  const map: UiTextMap = { ...DEFAULT_UI_TEXTS };

  if (keyIdx < 0 || valueIdx < 0) {
    cache = map;
    return cache;
  }

  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i].split(",").map((s) => s.trim());
    const key = (cols[keyIdx] ?? "").replace(/\r/g, "").trim();
    const value = (cols[valueIdx] ?? "").replace(/\r/g, "").trim();
    if (!key || !value) continue;
    map[key] = value;
  }

  cache = map;
  return cache;
}

export function getUiText(key: string, fallback: string): string {
  const map = loadUiTexts();
  return map[key] ?? fallback;
}
