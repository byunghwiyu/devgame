import BattleClient from "./BattleClient";
import { loadMapNodes } from "@/lib/data/loadMapNodes";
import { bgUrl } from "@/lib/ui/assets";

type Props = {
  searchParams: Promise<{
    at?: string;
    lv?: string;
  }>;
};

export default async function BattlePage({ searchParams }: Props) {
  const params = await searchParams;
  const nodeKey = (params?.at ?? "").replace(/\r/g, "").trim();
  const parsedLevel = Number(params?.lv ?? "1");
  const userLevel = Number.isFinite(parsedLevel) && parsedLevel > 0 ? Math.floor(parsedLevel) : 1;

  const mapNodes = loadMapNodes();
  const currentNode = mapNodes.find((node) => node.key === nodeKey);
  const backgroundSrc = bgUrl(currentNode?.bgImageKey);

  return <BattleClient nodeKey={nodeKey} userLevel={userLevel} backgroundSrc={backgroundSrc} />;
}
