import { loadMapNodes, type MapNode } from "@/lib/data/loadMapNodes";

export type WorldOption = {
  node: MapNode;
  canEnter: boolean;
  requiredLevel: number;
};

export type WorldState = {
  userLevel: number;
  current: MapNode;
  worldOptions: WorldOption[];
};

function normalizeKey(raw: string): string {
  return raw.replace(/\r/g, "").trim();
}

function buildWorldIndex(nodes: MapNode[]): Map<string, MapNode> {
  const index = new Map<string, MapNode>();

  for (const node of nodes) {
    const key = normalizeKey(node.key);
    if (!key) continue;

    index.set(key, {
      ...node,
      key,
      nextKeys: node.nextKeys.map((k) => normalizeKey(k)).filter(Boolean),
    });
  }

  return index;
}

function getVisibleLevel(node: MapNode): number {
  return node.visibleLevel ?? node.requiredLevel ?? 1;
}

function getRequiredLevel(node: MapNode): number {
  return node.requiredLevel ?? 1;
}

function isVisible(node: MapNode, userLevel: number): boolean {
  return userLevel >= getVisibleLevel(node);
}

function canEnter(node: MapNode, userLevel: number): boolean {
  return userLevel >= getRequiredLevel(node);
}

export function getWorldState(currentKey: string, userLevel: number): WorldState {
  const nodes = loadMapNodes();
  const index = buildWorldIndex(nodes);
  const normalizedLevel = Number.isFinite(userLevel) && userLevel > 0 ? Math.floor(userLevel) : 1;

  const visibleNodes = nodes.filter((node) => isVisible(node, normalizedLevel));
  if (visibleNodes.length === 0) {
    throw new Error(`No worlds are visible for level ${normalizedLevel}.`);
  }

  const worldOptions: WorldOption[] = visibleNodes.map((node) => ({
    node,
    canEnter: canEnter(node, normalizedLevel),
    requiredLevel: getRequiredLevel(node),
  }));

  const normalizedCurrentKey = normalizeKey(currentKey);
  let current = index.get(normalizedCurrentKey);

  if (!current || !isVisible(current, normalizedLevel) || !canEnter(current, normalizedLevel)) {
    current =
      worldOptions.find((x) => x.node.key === "N1_TOWN" && x.canEnter)?.node ??
      worldOptions.find((x) => x.canEnter)?.node;
  }

  if (!current) {
    throw new Error(`No enterable world for level ${normalizedLevel}.`);
  }

  return {
    userLevel: normalizedLevel,
    current,
    worldOptions,
  };
}
