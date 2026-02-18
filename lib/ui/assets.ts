const ASSET_BASE = "";
const ASSET_EXT = "png";

function normalizeKey(key?: string): string {
  return (key ?? "").replace(/\r/g, "").trim();
}

export function bgUrl(key?: string): string | null {
  const normalized = normalizeKey(key);
  if (!normalized) return null;
  return `${ASSET_BASE}/assets/bg/${normalized}.${ASSET_EXT}`;
}

export function monsterUrl(key?: string): string | null {
  const normalized = normalizeKey(key);
  if (!normalized) return null;
  return `${ASSET_BASE}/assets/monster/${normalized}.${ASSET_EXT}`;
}

export function charUrl(key?: string): string | null {
  const normalized = normalizeKey(key);
  if (!normalized) return null;
  return `${ASSET_BASE}/assets/char/${normalized}.${ASSET_EXT}`;
}
