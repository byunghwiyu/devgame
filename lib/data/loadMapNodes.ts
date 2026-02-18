import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";

export type MapNodeRow = {
  key: string;
  name: string;
  type: string;
  description: string;
  next_keys: string;
  visible_level?: string;
  required_level?: string;
  required_item_key?: string;
  bg_image_key?: string;
};

export type MapNode = {
  key: string;
  name: string;
  type: string;
  description: string;
  nextKeys: string[];
  visibleLevel?: number;
  requiredLevel?: number;
  requiredItemKey?: string;
  bgImageKey?: string;
};

type ParseResult = {
  data: MapNodeRow[];
  errors?: unknown[];
};

function normalize(raw?: string): string {
  return (raw ?? "").replace(/\r/g, "").trim();
}

function splitNextKeys(raw?: string): string[] {
  const normalized = normalize(raw);
  if (!normalized) return [];

  return normalized
    .split("|")
    .map((s) => normalize(s))
    .filter(Boolean);
}

function validateNodes(nodes: MapNode[]): void {
  const index = new Map<string, MapNode>();
  const errors: string[] = [];

  for (const node of nodes) {
    if (!node.key) errors.push("Node has empty key");
    if (!node.name) errors.push(`Node ${node.key} has empty name`);
    if (!node.type) errors.push(`Node ${node.key} has empty type`);
    if (index.has(node.key)) errors.push(`Duplicate node key: ${node.key}`);
    if (node.visibleLevel !== undefined && (!Number.isInteger(node.visibleLevel) || node.visibleLevel < 1)) {
      errors.push(`Node ${node.key} has invalid visibleLevel: ${node.visibleLevel}`);
    }
    if (node.requiredLevel !== undefined && (!Number.isInteger(node.requiredLevel) || node.requiredLevel < 1)) {
      errors.push(`Node ${node.key} has invalid requiredLevel: ${node.requiredLevel}`);
    }
    index.set(node.key, node);
  }

  for (const node of nodes) {
    for (const nextKey of node.nextKeys) {
      if (!index.has(nextKey)) {
        errors.push(`Node ${node.key} references unknown next key: ${nextKey}`);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid map_nodes.csv:\n- ${errors.join("\n- ")}`);
  }
}

export function loadMapNodes(): MapNode[] {
  const filePath = path.join(process.cwd(), "data/csv/map_nodes.csv");
  const file = fs.readFileSync(filePath, "utf8");

  const parsed: ParseResult = Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    delimiter: ",",
  }) as ParseResult;

  if (parsed.errors?.length) {
    console.warn("CSV parse errors:", parsed.errors);
  }

  const nodes = parsed.data
    .filter((x: MapNodeRow) => normalize(x?.key))
    .map((x: MapNodeRow) => {
      const visibleLevelRaw = normalize(x.visible_level);
      const visibleLevel = visibleLevelRaw ? Number(visibleLevelRaw) : undefined;
      const requiredLevelRaw = normalize(x.required_level);
      const requiredLevel = requiredLevelRaw ? Number(requiredLevelRaw) : undefined;

      return {
        key: normalize(x.key),
        name: normalize(x.name),
        type: normalize(x.type),
        description: normalize(x.description),
        nextKeys: splitNextKeys(x.next_keys),
        visibleLevel: Number.isFinite(visibleLevel) ? visibleLevel : undefined,
        requiredLevel: Number.isFinite(requiredLevel) ? requiredLevel : undefined,
        requiredItemKey: normalize(x.required_item_key) || undefined,
        bgImageKey: normalize(x.bg_image_key) || undefined,
      };
    });

  validateNodes(nodes);
  return nodes;
}
