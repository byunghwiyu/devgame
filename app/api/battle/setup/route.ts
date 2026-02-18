import { NextResponse } from "next/server";
import { getMonsterKeyForNode } from "@/lib/data/loadEncounters";
import { getDefineNumber, loadDefineTable } from "@/lib/data/loadDefineTable";
import { buildMonsterIndex, loadMonsters } from "@/lib/data/loadMonsters";
import { loadTokens } from "@/lib/data/loadTokens";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const nodeKey = (searchParams.get("at") ?? "").replace(/\r/g, "").trim();

    if (!nodeKey) {
      return NextResponse.json({ error: "nodeKey(at) is required." }, { status: 400 });
    }

    const monsterKey = getMonsterKeyForNode(nodeKey);
    if (!monsterKey) {
      return NextResponse.json({ error: `No monster mapped for node: ${nodeKey}` }, { status: 404 });
    }

    const monsters = loadMonsters();
    const monsterIndex = buildMonsterIndex(monsters);
    const monster = monsterIndex.get(monsterKey);

    if (!monster) {
      return NextResponse.json({ error: `Monster not found: ${monsterKey}` }, { status: 404 });
    }

    const defineTable = loadDefineTable();
    const attackTimeoutMs = getDefineNumber(defineTable, "attack_timeout_ms", 6000);
    const defenseTimeoutMs = getDefineNumber(defineTable, "defense_timeout_ms", 4000);

    const tokenDefs = loadTokens().map((token) => ({
      key: token.key,
      name: token.name,
      slot: token.slot,
      category: token.category,
    }));

    return NextResponse.json({
      nodeKey,
      monsterKey,
      monster,
      tokenDefs,
      config: {
        attackTimeoutMs,
        defenseTimeoutMs,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
