"use client";

import { useState } from "react";
import { bgUrl, charUrl, monsterUrl } from "@/lib/ui/assets";

type AssetItem = {
  label: string;
  key: string;
  url: string | null;
};

function AssetPreview({ item }: { item: AssetItem }) {
  const [missing, setMissing] = useState(false);

  return (
    <div
      style={{
        border: "1px solid #ddd",
        borderRadius: 10,
        padding: 12,
        width: 260,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{item.label}</div>
      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
        key: <code>{item.key}</code>
      </div>
      {item.url && !missing ? (
        <img
          src={item.url}
          alt={item.key}
          onError={() => setMissing(true)}
          style={{ width: "100%", height: 160, objectFit: "cover", borderRadius: 8, border: "1px solid #eee" }}
        />
      ) : (
        <div
          style={{
            width: "100%",
            height: 160,
            borderRadius: 8,
            border: "1px dashed #999",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#666",
          }}
        >
          missing
        </div>
      )}
      <div style={{ fontSize: 12, marginTop: 8, opacity: 0.75 }}>{item.url ?? "null"}</div>
    </div>
  );
}

export default function DebugAssetsPage() {
  const bgItems: AssetItem[] = [
    { label: "BG", key: "bg_town_01", url: bgUrl("bg_town_01") },
    { label: "BG", key: "bg_bamboo_01", url: bgUrl("bg_bamboo_01") },
    { label: "BG", key: "bg_hideout_01", url: bgUrl("bg_hideout_01") },
  ];

  const monsterItems: AssetItem[] = [
    { label: "Monster", key: "mon_bandit_01", url: monsterUrl("mon_bandit_01") },
    { label: "Monster", key: "mon_hideout_boss", url: monsterUrl("mon_hideout_boss") },
  ];

  const charItems: AssetItem[] = [
    { label: "Char", key: "char_player_01", url: charUrl("char_player_01") },
    { label: "Char", key: "char_player_99", url: charUrl("char_player_99") },
  ];

  const items = [...bgItems, ...monsterItems, ...charItems];

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 24, marginBottom: 12 }}>Assets Debug</h1>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {items.map((item) => (
          <AssetPreview key={`${item.label}-${item.key}`} item={item} />
        ))}
      </div>
    </main>
  );
}
