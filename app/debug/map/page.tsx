import { loadMapNodes } from "@/lib/data/loadMapNodes";

export default function Page() {
  const nodes = loadMapNodes();

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 24, marginBottom: 12 }}>맵 노드 목록 (CSV)</h1>
      <pre style={{ background: "#f6f6f6", padding: 12, borderRadius: 8 }}>
        {JSON.stringify(nodes, null, 2)}
      </pre>
    </main>
  );
}
