import type { RhythmExercise } from "../RhythmModel";

// 网站训练模式；与击拍组件内部的 practice/listen（练习/试听）不是同一个概念。
export const practiceModes = [
  { id: "tapping", label: "击拍练习", available: true },
  { id: "dictation", label: "节奏听写", available: false },
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

// 内容与页面分离；静态对象在切换配置草稿时保持引用稳定。
export const presetTopics: PracticeTopic[] = [
  {
    id: "basic-values",
    title: "全音符、二分音符、四分音符",
    description: "",
    modes: [
      {
        mode: "tapping",
        questions: [
          // QQQQ | QQQQ
          {
            id: "basic-values-01",
            title: "四分音符",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  events: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
              ],
            },
          },
          // QQH | W
          {
            id: "basic-values-02",
            title: "二分音符与全音符",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  events: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "half" },
                  ],
                },
                {
                  events: [{ kind: "note", noteValue: "whole" }],
                },
              ],
            },
          },
          // QQQQ | HQQ | W | QQH
          {
            id: "basic-values-03",
            title: "三种音符",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  events: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "half" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  events: [{ kind: "note", noteValue: "whole" }],
                },
                {
                  events: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "half" },
                  ],
                },
              ],
            },
          },
        ],
      },
      { mode: "dictation", questions: [] },
      { mode: "geometry", questions: [] },
    ],
  },
  {
    id: "eighth-notes",
    title: "八分音符、二平均节奏",
    description: "",
    modes: [
      {
        mode: "tapping",
        questions: [
          // Q Q EE EE | EE Q EE Q
          {
            id: "eighth-notes-01",
            title: "练习 1",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  events: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
              ],
            },
          },
          // EE Q Q Q | Q EE Q Q | Q Q EE Q | Q Q Q EE
          {
            id: "eighth-notes-03",
            title: "练习 3",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  events: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
              ],
            },
          },
          // EE EE Q Q | Q EE EE Q | Q Q EE EE | Q Q Q Q
          {
            id: "eighth-notes-04",
            title: "练习 4",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  events: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
              ],
            },
          },
          // EE Q EE Q | Q EE Q EE | EE Q Q EE | Q Q Q Q
          {
            id: "eighth-notes-05",
            title: "练习 5",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  events: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
              ],
            },
          },
          // Q EE EE EE | EE Q EE EE | EE EE Q EE | EE EE EE Q
          {
            id: "eighth-notes-06",
            title: "练习 6",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  events: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
              ],
            },
          },
          // Q EE Q Q | EE EE Q Q | Q EE Q EE | EE EE EE EE
          {
            id: "eighth-notes-07",
            title: "练习 7",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  events: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
              ],
            },
          },
        ],
      },
      { mode: "dictation", questions: [] },
      { mode: "geometry", questions: [] },
    ],
  },
  {
    id: "mixed-values-1",
    title: "综合练习1（全音符、二分、四分、八分、二平均）",
    description: "",
    modes: [
      {
        mode: "tapping",
        questions: [
          // H EE EE | H Q EE | H EE Q | H Q Q
          {
            id: "mixed-values-1-01",
            title: "练习 1",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  events: [
                    { kind: "note", noteValue: "half" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "half" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "half" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "half" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
              ],
            },
          },
          // EE EE H | Q EE H | EE Q H | Q Q H
          {
            id: "mixed-values-1-02",
            title: "练习 2",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  events: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "half" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "half" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "half" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "half" },
                  ],
                },
              ],
            },
          },
          // W | EE EE EE EE | W | Q EE Q EE
          {
            id: "mixed-values-1-03",
            title: "练习 3",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  events: [{ kind: "note", noteValue: "whole" }],
                },
                {
                  events: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  events: [{ kind: "note", noteValue: "whole" }],
                },
                {
                  events: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
              ],
            },
          },
          // Q Q Q Q | EE EE EE EE | H H | Q EE Q EE
          {
            id: "mixed-values-1-04",
            title: "练习 4",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  events: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "half" },
                    { kind: "note", noteValue: "half" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
              ],
            },
          },
          // Q Q Q Q | Q EE Q EE | H EE Q | EE Q H | W | EE EE Q Q | Q Q EE EE | H Q Q
          {
            id: "mixed-values-1-05",
            title: "练习 5",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  events: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "half" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "half" },
                  ],
                },
                {
                  events: [{ kind: "note", noteValue: "whole" }],
                },
                {
                  events: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "half" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
              ],
            },
          },
        ],
      },
      { mode: "dictation", questions: [] },
      { mode: "geometry", questions: [] },
    ],
  },
  {
    id: "rests",
    title: "四种休止符",
    description: "",
    modes: [
      {
        mode: "tapping",
        questions: [
          // Q RQ Q RQ | Q Q Q Q
          {
            id: "rests-01",
            title: "练习 1",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  events: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "rest", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "rest", noteValue: "quarter" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
              ],
            },
          },
          // H RH | RH H | Q Q Q Q
          {
            id: "rests-02",
            title: "练习 2",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  events: [
                    { kind: "note", noteValue: "half" },
                    { kind: "rest", noteValue: "half" },
                  ],
                },
                {
                  events: [
                    { kind: "rest", noteValue: "half" },
                    { kind: "note", noteValue: "half" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
              ],
            },
          },
          // W | RW | H H | Q Q Q Q
          {
            id: "rests-03",
            title: "练习 3",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  events: [
                    { kind: "note", noteValue: "whole" },
                  ],
                },
                {
                  events: [
                    { kind: "rest", noteValue: "whole" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "half" },
                    { kind: "note", noteValue: "half" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
              ],
            },
          },
          // Q Q E RE Q | Q Q RE E Q | E RE Q RE E Q | Q Q Q Q
          {
            id: "rests-04",
            title: "练习 4",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  events: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "rest", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "rest", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "rest", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "rest", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
              ],
            },
          },
          // H RH | RQ Q EE Q | W | RW | RE E Q E RE Q | Q Q Q Q
          {
            id: "rests-05",
            title: "练习 5",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  events: [
                    { kind: "note", noteValue: "half" },
                    { kind: "rest", noteValue: "half" },
                  ],
                },
                {
                  events: [
                    { kind: "rest", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "whole" },
                  ],
                },
                {
                  events: [
                    { kind: "rest", noteValue: "whole" },
                  ],
                },
                {
                  events: [
                    { kind: "rest", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "rest", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
              ],
            },
          },
        ],
      },
      { mode: "dictation", questions: [] },
      { mode: "geometry", questions: [] },
    ],
  },
  {
    id: "dotted-quarters",
    title: "附点四分音符、大附点节奏",
    description: "",
    modes: [
      {
        mode: "tapping",
        questions: [
          // Q. E Q Q | Q Q Q Q
          {
            id: "dotted-quarters-01",
            title: "练习 1",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  events: [
                    { kind: "note", noteValue: "quarter", dots: 1 },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
              ],
            },
          },
          // Q. E Q Q | Q Q Q. E | Q Q. E Q | Q Q Q Q
          {
            id: "dotted-quarters-02",
            title: "练习 2",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  events: [
                    { kind: "note", noteValue: "quarter", dots: 1 },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter", dots: 1 },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter", dots: 1 },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
              ],
            },
          },
          // Q. E Q. E | Q. E EE Q | EE Q Q. E | Q Q Q Q
          {
            id: "dotted-quarters-03",
            title: "练习 3",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  events: [
                    { kind: "note", noteValue: "quarter", dots: 1 },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter", dots: 1 },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "quarter", dots: 1 },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter", dots: 1 },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
              ],
            },
          },
          // H Q. E | Q. E H | W | Q Q. E Q | Q. E Q. E | Q Q Q Q
          {
            id: "dotted-quarters-04",
            title: "练习 4",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  events: [
                    { kind: "note", noteValue: "half" },
                    { kind: "note", noteValue: "quarter", dots: 1 },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "quarter", dots: 1 },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "half" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "whole" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter", dots: 1 },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "quarter", dots: 1 },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter", dots: 1 },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
              ],
            },
          },
        ],
      },
      { mode: "dictation", questions: [] },
      { mode: "geometry", questions: [] },
    ],
  },
  {
    id: "syncopation",
    title: "大切分节奏",
    description: "",
    modes: [
      {
        mode: "tapping",
        questions: [
          // Q Q Q Q | E Q E Q Q
          {
            id: "syncopation-01",
            title: "练习 1",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  events: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
              ],
            },
          },
          // E Q E Q Q | Q Q E Q E | E Q E E Q E
          {
            id: "syncopation-02",
            title: "练习 2",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  events: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
              ],
            },
          },
          // EE EE Q Q | E Q E Q Q | Q Q EE EE | Q Q E Q E
          {
            id: "syncopation-03",
            title: "练习 3",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  events: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
              ],
            },
          },
          // H E Q E | E Q E H | W | Q E Q E Q | E Q E E Q E | Q Q Q Q
          {
            id: "syncopation-04",
            title: "练习 4",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  events: [
                    { kind: "note", noteValue: "half" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "half" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "whole" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
              ],
            },
          },
        ],
      },
      { mode: "dictation", questions: [] },
      { mode: "geometry", questions: [] },
    ],
  },
  {
    id: "mixed-values-2",
    title: "综合练习2（基础+大附点节奏+大切分节奏）",
    description: "",
    modes: [
      {
        mode: "tapping",
        questions: [
          // Q. E Q Q | E Q E Q Q
          {
            id: "mixed-values-2-01",
            title: "附点遇见切分",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  events: [
                    { kind: "note", noteValue: "quarter", dots: 1 },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
              ],
            },
          },
          // Q. E E Q E | E Q E Q Q | H E Q E | Q. E H
          {
            id: "mixed-values-2-02",
            title: "两种节奏接力",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  events: [
                    { kind: "note", noteValue: "quarter", dots: 1 },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "half" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "quarter", dots: 1 },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "half" },
                  ],
                },
              ],
            },
          },
          // RQ E Q E Q | Q. E RQ Q | RH E Q E | E Q E Q RQ
          {
            id: "mixed-values-2-03",
            title: "留白再出发",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  events: [
                    { kind: "rest", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "quarter", dots: 1 },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "rest", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  events: [
                    { kind: "rest", noteValue: "half" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "rest", noteValue: "quarter" },
                  ],
                },
              ],
            },
          },
          // H E Q E | Q. E EE Q | E Q E Q Q | W | RE E E Q E Q | Q Q Q Q
          {
            id: "mixed-values-2-04",
            title: "六小节挑战",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  events: [
                    { kind: "note", noteValue: "half" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "quarter", dots: 1 },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "whole" },
                  ],
                },
                {
                  events: [
                    { kind: "rest", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  events: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
              ],
            },
          },
        ],
      },
      { mode: "dictation", questions: [] },
      { mode: "geometry", questions: [] },
    ],
  },
];

/** 返回题目、所属主题与模式；未知 ID 不回退到其他题目。 */
export function findPresetQuestion(questionId: string) {
  for (const topic of presetTopics) {
    for (const group of topic.modes) {
      const question = group.questions.find((item) => item.id === questionId);
      if (question) return { topic, mode: group.mode, question };
    }
  }
  return undefined;
}
