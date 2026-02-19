import Link from "next/link";
import { getUiText } from "@/lib/data/loadUiTexts";

export default function HomePage() {
  const title = getUiText("home.title", "Murim Text RPG");
  const subtitle = getUiText("home.subtitle", "시작 메뉴");
  const worldLabel = getUiText("home.to_world", "월드");
  const battleLabel = getUiText("home.to_battle", "전투");
  const rpgLabel = getUiText("home.to_rpg", "RPG 인벤/성장");

  return (
    <main style={{ maxWidth: 840, margin: "0 auto", padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 28, marginBottom: 12 }}>{title}</h1>
      <p style={{ opacity: 0.8, marginBottom: 16 }}>{subtitle}</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Link href="/world?at=N1_TOWN" style={{ border: "1px solid #ccc", borderRadius: 8, padding: "8px 12px", textDecoration: "none" }}>
          {worldLabel}
        </Link>
        <Link href="/battle?at=N2_BAMBOO" style={{ border: "1px solid #ccc", borderRadius: 8, padding: "8px 12px", textDecoration: "none" }}>
          {battleLabel}
        </Link>
        <Link href="/rpg" style={{ border: "1px solid #ccc", borderRadius: 8, padding: "8px 12px", textDecoration: "none" }}>
          {rpgLabel}
        </Link>
      </div>
    </main>
  );
}
