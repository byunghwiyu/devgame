import Link from "next/link";
import { getWorldState } from "@/lib/game/world";
import { bgUrl } from "@/lib/ui/assets";

type Props = {
  searchParams: Promise<{
    at?: string;
    lv?: string;
  }>;
};

function parseLevel(raw?: string): number {
  const value = Number(raw ?? "1");
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.floor(value);
}

export default async function WorldPage({ searchParams }: Props) {
  const params = await searchParams;
  const userLevel = parseLevel(params?.lv);
  const currentKey = params?.at ?? "N1_TOWN";
  const { current, worldOptions } = getWorldState(currentKey, userLevel);
  const currentBgSrc = bgUrl(current.bgImageKey);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ fontSize: 26, marginBottom: 8 }}>World</h1>
      <div style={{ opacity: 0.75, marginBottom: 16 }}>User Level: {userLevel}</div>

      <section style={{ padding: 16, border: "1px solid #ddd", borderRadius: 12, marginBottom: 16 }}>
        {currentBgSrc ? (
          <div
            style={{
              width: "100%",
              maxHeight: 280,
              minHeight: 220,
              borderRadius: 10,
              overflow: "hidden",
              backgroundImage: `url(${currentBgSrc})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              display: "flex",
              alignItems: "flex-end",
              marginBottom: 10,
            }}
          >
            <div
              style={{
                width: "100%",
                padding: 14,
                background: "rgba(0, 0, 0, 0.5)",
                color: "#fff",
              }}
            >
              <div style={{ opacity: 0.85, marginBottom: 6 }}>Current World</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>
                {current.name} <span style={{ opacity: 0.8, fontSize: 14 }}>({current.key} / {current.type})</span>
              </div>
              <div style={{ marginTop: 8 }}>{current.description}</div>
            </div>
          </div>
        ) : (
          <>
            <div style={{ opacity: 0.7, marginBottom: 6 }}>Current World</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>
              {current.name} <span style={{ opacity: 0.6, fontSize: 14 }}>({current.key} / {current.type})</span>
            </div>
            <div style={{ marginTop: 8 }}>{current.description}</div>
          </>
        )}

        {current.type === "BATTLE" ? (
          <div style={{ marginTop: 12 }}>
            <Link
              href={`/battle?at=${encodeURIComponent(current.key)}&lv=${userLevel}`}
              style={{
                display: "inline-block",
                padding: "8px 12px",
                border: "1px solid #ccc",
                borderRadius: 8,
                textDecoration: "none",
              }}
            >
              전투 시작
            </Link>
          </div>
        ) : null}
      </section>

      <section style={{ padding: 16, border: "1px solid #ddd", borderRadius: 12 }}>
        <div style={{ opacity: 0.7, marginBottom: 10 }}>Visible Worlds</div>

        {worldOptions.length === 0 ? (
          <div>No visible worlds.</div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {worldOptions.map(({ node, canEnter, requiredLevel }) => (
              <div
                key={node.key}
                style={{
                  display: "inline-block",
                  padding: "10px 12px",
                  border: "1px solid #ccc",
                  borderRadius: 10,
                  minWidth: 190,
                  opacity: canEnter ? 1 : 0.6,
                }}
              >
                <div style={{ fontWeight: 700 }}>{node.name}</div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>{node.type} | {node.key}</div>
                <div style={{ fontSize: 12, marginTop: 6 }}>Required Lv: {requiredLevel}</div>
                {canEnter ? (
                  <Link
                    href={`/world?lv=${userLevel}&at=${encodeURIComponent(node.key)}`}
                    style={{ display: "inline-block", marginTop: 8, textDecoration: "none" }}
                  >
                    Enter
                  </Link>
                ) : (
                  <div style={{ marginTop: 8, fontSize: 12 }}>Locked</div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <div style={{ marginTop: 16, opacity: 0.7 }}>
        Tip: change level with <code>?lv=2</code> in URL.
      </div>
    </main>
  );
}
