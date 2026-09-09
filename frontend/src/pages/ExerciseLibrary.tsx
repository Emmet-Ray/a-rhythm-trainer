import { useState } from "react";
import { Link } from "react-router";
import {
  practiceModes,
  presetTopics,
  type PracticeMode,
  type PracticeTopic,
} from "../exercises/presetExercises";

export default function ExerciseLibrary() {
  return (
    <>
      <title>练习库 · 节奏训练</title>
      <header className="page-heading">
        <h1>练习库</h1>
      </header>
      <div className="option-strip" role="group" aria-label="内容来源">
        <span className="option-current">预设练习</span>
        <Link to="/random">随机练习</Link>
        <button type="button" disabled>
          自定义练习 <small>未开放</small>
        </button>
      </div>
      <div className="topic-list">
        {presetTopics.map((topic, index) => (
          <TopicQuestions key={topic.id} topic={topic} index={index} />
        ))}
      </div>
    </>
  );
}

// 模式选择属于主题的选题区域，不属于一道题的训练过程。
function TopicQuestions({
  topic,
  index,
}: {
  topic: PracticeTopic;
  index: number;
}) {
  const [selectedMode, setSelectedMode] = useState<PracticeMode>("tapping");
  const questions =
    topic.modes.find((group) => group.mode === selectedMode)?.questions ?? [];

  return (
    <section className="topic-section" aria-labelledby={`topic-${topic.id}`}>
      <header className="topic-heading">
        <span className="topic-number" aria-hidden="true">
          {String(index + 1).padStart(2, "0")}
        </span>
        <h2 id={`topic-${topic.id}`}>{topic.title}</h2>
      </header>
      <div className="topic-content">
        <div
          className="option-strip topic-modes"
          role="group"
          aria-label={`${topic.title}的训练方式`}
        >
          {practiceModes.map((mode) => (
            <button
              key={mode.id}
              type="button"
              className={
                selectedMode === mode.id ? "option-current" : undefined
              }
              aria-pressed={selectedMode === mode.id}
              aria-controls={`questions-${topic.id}`}
              disabled={!mode.available}
              onClick={() => setSelectedMode(mode.id)}
            >
              {mode.label}
              {!mode.available && <small> 未开放</small>}
            </button>
          ))}
        </div>
        <ul id={`questions-${topic.id}`} className="question-list">
          {questions.map((question) => (
            <li key={question.id}>
              <Link className="question-link" to={`/practice/${question.id}`}>
                <div className="question-copy">
                  <h3>{question.title}</h3>
                </div>
                <span className="question-action">
                  开始练习 <span aria-hidden="true">→</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {questions.length === 0 && <p className="empty-questions">暂无题目</p>}
      </div>
    </section>
  );
}
