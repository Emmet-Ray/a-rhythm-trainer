import { Link, useParams } from "react-router";
import { ArrowLeft } from "lucide-react";
import { gameLevels } from "../game/catalog";
import { GameWorkspace } from "../game/ui/GameWorkspace";

export default function RhythmGamePage() {
  const { levelId } = useParams();
  const level = gameLevels.find(item => item.id === levelId);
  if (!level) return <section className="design-system orbit-page">
    <title>未找到该关卡 · 节奏训练</title>
    <h1>未找到该关卡</h1><Link className="orbit-return" to="/game"><ArrowLeft size={18} aria-hidden="true" />关卡列表</Link>
  </section>;
  return <GameWorkspace key={level.id} level={level} />;
}
