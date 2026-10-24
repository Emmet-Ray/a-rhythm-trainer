import { Link } from "react-router";
import { gameLevels, getOrbitTheme, DEFAULT_ORBIT_THEME } from "../catalog";
import { createLevelTrack, type GameLevel } from "../core/GameLevel";
import { useBrowsingState } from "../../navigation/usePageNavigation";
import { RhythmCardPoster } from "./RhythmCardPoster";
import "./OrbitGame.css";

const musicLevels = gameLevels.filter(level => level.category !== "rhythm");
const rhythmLevels = gameLevels.filter(level => level.category === "rhythm");
// Static catalog metadata: selecting a category must not rebuild every route.
const durations = new Map(musicLevels.map(level => {
  const seconds = Math.round(createLevelTrack(level).durationBeats * 60 / level.music!.recommendedBpm);
  return [level.id, `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`];
}));

function LevelLink({ level, index }: { level: GameLevel; index: number }) {
  const theme = level.visualTheme ?? getOrbitTheme(DEFAULT_ORBIT_THEME);
  const image = theme?.material === "pixel" ? theme.pixelEnvironment : undefined;
  return <li>
    <Link className="orbit-level-link" to={`/game/${level.id}`} aria-label={`开始${level.title}`}>
      {level.category === "rhythm" && level.exercise
        ? <RhythmCardPoster exercise={level.exercise} number={index + 1} />
        : image && <div className="orbit-level-art">
          <img src={image.image} alt="" loading="lazy" style={{ objectPosition: `${(image.cropX ?? .5) * 100}% ${(image.cropY ?? .5) * 100}%` }} />
        </div>}
      <div className="orbit-level-description">
        <h3>{level.title}</h3>
        {level.category !== "rhythm" ? <p className="orbit-level-meta"><span>{durations.get(level.id)}</span><span aria-hidden="true">·</span><span>{`${level.music!.recommendedBpm} BPM`}</span></p> : <p>{level.description}</p>}
      </div>
    </Link>
  </li>;
}

export default function GameLevelsPage() {
  const [category, setCategory] = useBrowsingState<"music" | "rhythm">("game:category", "music");
  return <section className="design-system orbit-page orbit-levels" aria-labelledby="game-levels-heading">
    <title>游戏 · 节奏训练</title>
    <header className="orbit-heading"><h1 id="game-levels-heading">游戏</h1></header>
    <div className="orbit-categories" role="group" aria-label="关卡分类">
      <button type="button" aria-pressed={category === "music"} onClick={() => setCategory("music")}>曲目</button>
      <button type="button" aria-pressed={category === "rhythm"} onClick={() => setCategory("rhythm")}>基础节奏</button>
    </div>
    <section hidden={category !== "music"} className="orbit-level-group orbit-level-group--music" aria-labelledby="music-levels-heading">
      <h2 id="music-levels-heading" className="sr-only">曲目</h2>
      <ul className="orbit-level-list">{musicLevels.map((level, index) => <LevelLink key={level.id} level={level} index={index} />)}</ul>
    </section>
    <section hidden={category !== "rhythm"} className="orbit-level-group orbit-level-group--rhythm" aria-labelledby="rhythm-levels-heading">
      <h2 id="rhythm-levels-heading" className="sr-only">基础节奏</h2>
      <ol className="orbit-level-list">{rhythmLevels.map((level, index) => <LevelLink key={level.id} level={level} index={index} />)}</ol>
    </section>
  </section>;
}
