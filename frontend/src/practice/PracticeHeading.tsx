import { ReturnLink } from "../navigation/PageNavigation";

/** 练习题头只展示返回入口和题名；随机题无独立题名，不补重复标题。 */
export function PracticeHeading({ backTo, backLabel, title }: {
  backTo: string;
  backLabel: string;
  title?: string;
}) {
  return (
    <header className="practice-titlebar">
      <ReturnLink className="practice-return" to={backTo}>{`← ${backLabel}`}</ReturnLink>
      {title && <h1>{title}</h1>}
    </header>
  );
}
