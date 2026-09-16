import { parseRhythmExercise, type RhythmExercise } from "../rhythm/RhythmModel";

// 网站训练模式；与击拍组件内部的 practice/listen（练习/试听）不是同一个概念。
export const practiceModes = [
  { id: "tapping", label: "击拍练习", available: true },
  { id: "dictation", label: "节奏听写", available: true },
  { id: "geometry", label: "几何游戏", available: false },
] as const;

export type PracticeMode = (typeof practiceModes)[number]["id"];

export type PresetQuestion = {
  /** 全站唯一，用于题目地址；修改标题时保持 ID 不变。 */
  id: string;
  title: string;
  description: string;
  exercise: RhythmExercise;
};

export type ModeQuestionGroup = {
  mode: PracticeMode;
  questions: PresetQuestion[];
};

export type PracticeTopic = {
  id: string;
  title: string;
  description: string;
  // 每道题归属于一个模式；模式之间不共享题目列表。
  modes: ModeQuestionGroup[];
};

export type PresetCatalog = { schemaVersion: 1; topics: PracticeTopic[] };

/** 外部题库的唯一校验入口；发布脚本与浏览器共用，不更改题目顺序或 ID。 */
export function parsePresetCatalog(value: unknown): PresetCatalog {
  function record(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("应为对象。");
    return value as Record<string, unknown>;
  }
  function text(value: unknown, field: string, allowEmpty = false): string {
    if (typeof value !== "string" || (!allowEmpty && !value.trim())) throw new Error(`${field}必须为${allowEmpty ? "" : "非空"}字符串。`);
    return value;
  }
  function array(value: unknown, field: string): unknown[] {
    if (!Array.isArray(value)) throw new Error(`${field}必须为数组。`);
    return value;
  }
  function id(value: unknown, used: Set<string>): string {
    const result = text(value, "ID");
    if (!/^[a-z0-9-]+$/.test(result)) throw new Error(`ID ${result} 只能包含小写字母、数字和连字符。`);
    if (used.has(result)) throw new Error(`重复 ID：${result}。`);
    used.add(result);
    return result;
  }
  const root = record(value);
  if (root.schemaVersion !== 1) throw new Error("不支持该题库版本，请使用 schemaVersion: 1。");
  const topicIds = new Set<string>();
  const questionIds = new Set<string>();
  const topics = array(root.topics, "topics").map((item, index): PracticeTopic => {
    try {
      const topic = record(item);
      const topicId = id(topic.id, topicIds);
      const modes = new Set<string>();
      return {
        id: topicId,
        title: text(topic.title, "主题标题"),
        description: text(topic.description, "主题说明", true),
        modes: array(topic.modes, "modes").map((item): ModeQuestionGroup => {
          const group = record(item);
          const mode = practiceModes.find(mode => mode.id === group.mode);
          if (!mode || modes.has(mode.id)) throw new Error(`训练模式无效或重复：${String(group.mode)}。`);
          modes.add(mode.id);
          const questions = array(group.questions, "questions");
          if (!mode.available && questions.length) throw new Error(`${mode.label}尚未支持题目。`);
          return { mode: mode.id, questions: questions.map((item, index): PresetQuestion => {
            try {
              const question = record(item);
              return {
                id: id(question.id, questionIds),
                title: text(question.title, "题目标题"),
                description: text(question.description, "题目说明", true),
                exercise: parseRhythmExercise(question.exercise),
              };
            } catch (error) {
              throw new Error(`${mode.id} 第 ${index + 1} 题：${error instanceof Error ? error.message : String(error)}`, { cause: error });
            }
          }) };
        }),
      };
    } catch (error) {
      throw new Error(`第 ${index + 1} 个主题：${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
  });
  return { schemaVersion: 1, topics };
}

export function findPresetQuestion(questionId: string, presetTopics: PracticeTopic[]) {
  for (const topic of presetTopics) {
    for (const group of topic.modes) {
      const question = group.questions.find((item) => item.id === questionId);
      if (question) return { topic, mode: group.mode, question };
    }
  }
  return undefined;
}
