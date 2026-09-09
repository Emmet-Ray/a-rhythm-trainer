import type { RhythmExercise } from "../rhythm/RhythmModel";

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
                  elements: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
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
                  elements: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "half" },
                  ],
                },
                {
                  elements: [{ kind: "note", noteValue: "whole" }],
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
                  elements: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "half" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [{ kind: "note", noteValue: "whole" }],
                },
                {
                  elements: [
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
      {
        mode: "dictation",
        questions: [
          // HQQ | W（听写独立题目）
          {
            id: "dictation-basic-values-01",
            title: "练习 1",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  elements: [
                    { kind: "note", noteValue: "half" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                { elements: [{ kind: "note", noteValue: "whole" }] },
              ],
            },
          },
        ],
      },
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
                  elements: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  elements: [
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
                  elements: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
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
                  elements: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  elements: [
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
                  elements: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  elements: [
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
                  elements: [
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
                  elements: [
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
                  elements: [
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
                  elements: [
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
                  elements: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  elements: [
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
      {
        mode: "dictation",
        questions: [
          {
            id: "dictation-eighths-01",
            title: "练习 1",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  elements: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
              ],
            },
          },
        ],
      },
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
                  elements: [
                    { kind: "note", noteValue: "half" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "half" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "half" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
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
                  elements: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "half" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "half" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "half" },
                  ],
                },
                {
                  elements: [
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
                  elements: [{ kind: "note", noteValue: "whole" }],
                },
                {
                  elements: [
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
                  elements: [{ kind: "note", noteValue: "whole" }],
                },
                {
                  elements: [
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
                  elements: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
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
                  elements: [
                    { kind: "note", noteValue: "half" },
                    { kind: "note", noteValue: "half" },
                  ],
                },
                {
                  elements: [
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
                  elements: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "half" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "half" },
                  ],
                },
                {
                  elements: [{ kind: "note", noteValue: "whole" }],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  elements: [
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
                  elements: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "rest", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "rest", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
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
                  elements: [
                    { kind: "note", noteValue: "half" },
                    { kind: "rest", noteValue: "half" },
                  ],
                },
                {
                  elements: [
                    { kind: "rest", noteValue: "half" },
                    { kind: "note", noteValue: "half" },
                  ],
                },
                {
                  elements: [
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
                  elements: [{ kind: "note", noteValue: "whole" }],
                },
                {
                  elements: [{ kind: "rest", noteValue: "whole" }],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "half" },
                    { kind: "note", noteValue: "half" },
                  ],
                },
                {
                  elements: [
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
                  elements: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "rest", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "rest", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "rest", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "rest", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
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
                  elements: [
                    { kind: "note", noteValue: "half" },
                    { kind: "rest", noteValue: "half" },
                  ],
                },
                {
                  elements: [
                    { kind: "rest", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [{ kind: "note", noteValue: "whole" }],
                },
                {
                  elements: [{ kind: "rest", noteValue: "whole" }],
                },
                {
                  elements: [
                    { kind: "rest", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "rest", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
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
                  elements: [
                    { kind: "note", noteValue: "quarter", dots: 1 },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
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
                  elements: [
                    { kind: "note", noteValue: "quarter", dots: 1 },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter", dots: 1 },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter", dots: 1 },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
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
                  elements: [
                    { kind: "note", noteValue: "quarter", dots: 1 },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter", dots: 1 },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "quarter", dots: 1 },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter", dots: 1 },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  elements: [
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
                  elements: [
                    { kind: "note", noteValue: "half" },
                    { kind: "note", noteValue: "quarter", dots: 1 },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "quarter", dots: 1 },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "half" },
                  ],
                },
                {
                  elements: [{ kind: "note", noteValue: "whole" }],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter", dots: 1 },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "quarter", dots: 1 },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter", dots: 1 },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  elements: [
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
                  elements: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
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
                  elements: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  elements: [
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
                  elements: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  elements: [
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
                  elements: [
                    { kind: "note", noteValue: "half" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "half" },
                  ],
                },
                {
                  elements: [{ kind: "note", noteValue: "whole" }],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  elements: [
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
                  elements: [
                    { kind: "note", noteValue: "quarter", dots: 1 },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
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
                  elements: [
                    { kind: "note", noteValue: "quarter", dots: 1 },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "half" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  elements: [
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
                  elements: [
                    { kind: "rest", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "quarter", dots: 1 },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "rest", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "rest", noteValue: "half" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  elements: [
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
                  elements: [
                    { kind: "note", noteValue: "half" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "quarter", dots: 1 },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [{ kind: "note", noteValue: "whole" }],
                },
                {
                  elements: [
                    { kind: "rest", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
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
    id: "sixteenth-notes",
    title: "十六分音符、四平均节奏、前八后十六节奏、前十六后八节奏",
    description: "",
    modes: [
      {
        mode: "tapping",
        questions: [
          // EE EE Q Q | SSSS SSSS Q Q
          {
            id: "sixteenth-notes-01",
            title: "一拍四下",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  elements: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
              ],
            },
          },
          // ESS Q ESS Q | ESS ESS ESS ESS
          {
            id: "sixteenth-notes-02",
            title: "前长后短",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  elements: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                  ],
                },
              ],
            },
          },
          // SSE Q SSE Q | Q SSE Q SSE | SSE SSE Q Q
          {
            id: "sixteenth-notes-03",
            title: "前短后长",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  elements: [
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
              ],
            },
          },
          // ESS SSE Q Q | SSE ESS Q Q | SSSS ESS SSE Q | ESS SSE SSSS Q
          {
            id: "sixteenth-notes-04",
            title: "前后换一换",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  elements: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
              ],
            },
          },
          // Q Q EE EE | SSSS SSSS SSSS SSSS | ESS Q SSE Q | SSE ESS SSSS EE | H ESS SSE | ESS SSE EE Q
          {
            id: "sixteenth-notes-05",
            title: "十六分小旅程",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  elements: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "half" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
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
    id: "dotted-eighths",
    title: "附点八分音符、小附点节奏",
    description: "",
    modes: [
      {
        mode: "tapping",
        questions: [
          // EE Q EE Q | E.S Q E.S Q
          {
            id: "dotted-eighths-01",
            title: "认识小附点",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  elements: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "eighth", dots: 1 },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth", dots: 1 },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
              ],
            },
          },
          // E.S Q Q Q | Q E.S Q Q | Q Q E.S E.S
          {
            id: "dotted-eighths-02",
            title: "小附点搬家",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  elements: [
                    { kind: "note", noteValue: "eighth", dots: 1 },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth", dots: 1 },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth", dots: 1 },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth", dots: 1 },
                    { kind: "note", noteValue: "sixteenth" },
                  ],
                },
              ],
            },
          },
          // E.S ESS Q Q | ESS E.S Q Q | E.S E.S SSE Q | SSSS E.S EE Q
          {
            id: "dotted-eighths-03",
            title: "长短辨一辨",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  elements: [
                    { kind: "note", noteValue: "eighth", dots: 1 },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth", dots: 1 },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "eighth", dots: 1 },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth", dots: 1 },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth", dots: 1 },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
              ],
            },
          },
          // H E.S Q | E.S ESS SSE Q | W | Q E.S Q E.S | E.S E.S E.S E.S | EE EE Q Q
          {
            id: "dotted-eighths-04",
            title: "小附点旅程",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  elements: [
                    { kind: "note", noteValue: "half" },
                    { kind: "note", noteValue: "eighth", dots: 1 },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "eighth", dots: 1 },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [{ kind: "note", noteValue: "whole" }],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth", dots: 1 },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth", dots: 1 },
                    { kind: "note", noteValue: "sixteenth" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "eighth", dots: 1 },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth", dots: 1 },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth", dots: 1 },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth", dots: 1 },
                    { kind: "note", noteValue: "sixteenth" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
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
    id: "small-syncopation",
    title: "小切分节奏",
    description: "",
    modes: [
      {
        mode: "tapping",
        questions: [
          // EE Q EE Q | SES Q SES Q
          {
            id: "small-syncopation-01",
            title: "认识小切分",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  elements: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
              ],
            },
          },
          // SES Q Q Q | Q SES Q Q | Q Q SES SES
          {
            id: "small-syncopation-02",
            title: "小切分搬家",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  elements: [
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                  ],
                },
              ],
            },
          },
          // SSSS SES Q Q | SES SSSS Q Q | ESS SES SSE Q | SES SES EE Q
          {
            id: "small-syncopation-03",
            title: "中间留住",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  elements: [
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
              ],
            },
          },
          // H H | SES Q SES Q | W | Q SES SSE ESS | SES SES SES SES | EE EE Q Q
          {
            id: "small-syncopation-04",
            title: "小切分旅程",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  elements: [
                    { kind: "note", noteValue: "half" },
                    { kind: "note", noteValue: "half" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [{ kind: "note", noteValue: "whole" }],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
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
    id: "mixed-values-3",
    title: "综合练习3（基础+十六分+小附点节奏+小切分节奏）",
    description: "",
    modes: [
      {
        mode: "tapping",
        questions: [
          // E.S Q SES Q | SES Q E.S Q
          {
            id: "mixed-values-3-01",
            title: "小附点遇见小切分",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  elements: [
                    { kind: "note", noteValue: "eighth", dots: 1 },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth", dots: 1 },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
              ],
            },
          },
          // ESS SSE E.S SES | SES E.S SSE ESS | H SSSS EE | E.S SES Q Q
          {
            id: "mixed-values-3-02",
            title: "一拍多种走法",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  elements: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth", dots: 1 },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth", dots: 1 },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "half" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "eighth", dots: 1 },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
              ],
            },
          },
          // RQ SES E.S Q | E.S RE E SES Q | RH ESS SSE | SES Q RQ Q
          {
            id: "mixed-values-3-03",
            title: "留白再接上",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  elements: [
                    { kind: "rest", noteValue: "quarter" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth", dots: 1 },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "eighth", dots: 1 },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "rest", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "rest", noteValue: "half" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "rest", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
              ],
            },
          },
          // Q. E ESS SSE | E Q E E.S SES | SSSS ESS SSE Q | W | RE E SES E.S Q | E.S SES EE Q
          {
            id: "mixed-values-3-04",
            title: "六小节挑战",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  elements: [
                    { kind: "note", noteValue: "quarter", dots: 1 },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth", dots: 1 },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [{ kind: "note", noteValue: "whole" }],
                },
                {
                  elements: [
                    { kind: "rest", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth", dots: 1 },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "eighth", dots: 1 },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
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
    id: "eighth-triplets",
    title: "小三连节奏",
    description: "",
    modes: [
      {
        mode: "tapping",
        questions: [
          // Q Q Q Q | T Q T Q
          {
            id: "eighth-triplets-01",
            title: "一拍三下",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  elements: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    {
                      kind: "triplet",
                      notes: [
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                      ],
                    },
                    { kind: "note", noteValue: "quarter" },
                    {
                      kind: "triplet",
                      notes: [
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                      ],
                    },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
              ],
            },
          },
          // T Q Q Q | Q T Q Q | Q Q T T
          {
            id: "eighth-triplets-02",
            title: "三连音搬家",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  elements: [
                    {
                      kind: "triplet",
                      notes: [
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                      ],
                    },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "quarter" },
                    {
                      kind: "triplet",
                      notes: [
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                      ],
                    },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    {
                      kind: "triplet",
                      notes: [
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                      ],
                    },
                    {
                      kind: "triplet",
                      notes: [
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                      ],
                    },
                  ],
                },
              ],
            },
          },
          // EE T EE T | T EE T EE | T T T T | Q Q Q Q
          {
            id: "eighth-triplets-03",
            title: "两下换三下",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  elements: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    {
                      kind: "triplet",
                      notes: [
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                      ],
                    },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    {
                      kind: "triplet",
                      notes: [
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                      ],
                    },
                  ],
                },
                {
                  elements: [
                    {
                      kind: "triplet",
                      notes: [
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                      ],
                    },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    {
                      kind: "triplet",
                      notes: [
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                      ],
                    },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  elements: [
                    {
                      kind: "triplet",
                      notes: [
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                      ],
                    },
                    {
                      kind: "triplet",
                      notes: [
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                      ],
                    },
                    {
                      kind: "triplet",
                      notes: [
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                      ],
                    },
                    {
                      kind: "triplet",
                      notes: [
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                      ],
                    },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
              ],
            },
          },
          // SSSS T Q Q | T SSSS Q Q | ESS T SSE T | T ESS T SSE
          {
            id: "eighth-triplets-04",
            title: "三下换四下",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  elements: [
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    {
                      kind: "triplet",
                      notes: [
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                      ],
                    },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    {
                      kind: "triplet",
                      notes: [
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                      ],
                    },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    {
                      kind: "triplet",
                      notes: [
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                      ],
                    },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    {
                      kind: "triplet",
                      notes: [
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                      ],
                    },
                  ],
                },
                {
                  elements: [
                    {
                      kind: "triplet",
                      notes: [
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                      ],
                    },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    {
                      kind: "triplet",
                      notes: [
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                      ],
                    },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
              ],
            },
          },
          // H H | T T Q Q | W | Q T Q T | T T T T | EE T SSSS Q
          {
            id: "eighth-triplets-05",
            title: "三连音小旅程",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  elements: [
                    { kind: "note", noteValue: "half" },
                    { kind: "note", noteValue: "half" },
                  ],
                },
                {
                  elements: [
                    {
                      kind: "triplet",
                      notes: [
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                      ],
                    },
                    {
                      kind: "triplet",
                      notes: [
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                      ],
                    },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [{ kind: "note", noteValue: "whole" }],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "quarter" },
                    {
                      kind: "triplet",
                      notes: [
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                      ],
                    },
                    { kind: "note", noteValue: "quarter" },
                    {
                      kind: "triplet",
                      notes: [
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                      ],
                    },
                  ],
                },
                {
                  elements: [
                    {
                      kind: "triplet",
                      notes: [
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                      ],
                    },
                    {
                      kind: "triplet",
                      notes: [
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                      ],
                    },
                    {
                      kind: "triplet",
                      notes: [
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                      ],
                    },
                    {
                      kind: "triplet",
                      notes: [
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                      ],
                    },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    {
                      kind: "triplet",
                      notes: [
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                      ],
                    },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
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
    id: "mixed-values-4",
    title: "综合练习4（所有的）",
    description: "",
    modes: [
      {
        mode: "tapping",
        questions: [
          // EE T Q Q | SSSS T EE Q
          {
            id: "mixed-values-4-01",
            title: "两下三下四下",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  elements: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    {
                      kind: "triplet",
                      notes: [
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                      ],
                    },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    {
                      kind: "triplet",
                      notes: [
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                      ],
                    },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
              ],
            },
          },
          // Q. E T Q | E Q E T Q | T Q. E Q | T E Q E Q
          {
            id: "mixed-values-4-02",
            title: "三连音遇见大附点与大切分",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  elements: [
                    { kind: "note", noteValue: "quarter", dots: 1 },
                    { kind: "note", noteValue: "eighth" },
                    {
                      kind: "triplet",
                      notes: [
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                      ],
                    },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    {
                      kind: "triplet",
                      notes: [
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                      ],
                    },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    {
                      kind: "triplet",
                      notes: [
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                      ],
                    },
                    { kind: "note", noteValue: "quarter", dots: 1 },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    {
                      kind: "triplet",
                      notes: [
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                      ],
                    },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
              ],
            },
          },
          // E.S SES T Q | T ESS SSE Q | SES T E.S EE | SSSS T ESS SSE
          {
            id: "mixed-values-4-03",
            title: "一拍节奏轮换",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  elements: [
                    { kind: "note", noteValue: "eighth", dots: 1 },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    {
                      kind: "triplet",
                      notes: [
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                      ],
                    },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    {
                      kind: "triplet",
                      notes: [
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                      ],
                    },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    {
                      kind: "triplet",
                      notes: [
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                      ],
                    },
                    { kind: "note", noteValue: "eighth", dots: 1 },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    {
                      kind: "triplet",
                      notes: [
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                      ],
                    },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
              ],
            },
          },
          // RQ T EE Q | RH T Q | RW | T E.S SES Q | RE E T ESS Q
          {
            id: "mixed-values-4-04",
            title: "停顿中的衔接",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  elements: [
                    { kind: "rest", noteValue: "quarter" },
                    {
                      kind: "triplet",
                      notes: [
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                      ],
                    },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "rest", noteValue: "half" },
                    {
                      kind: "triplet",
                      notes: [
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                      ],
                    },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [{ kind: "rest", noteValue: "whole" }],
                },
                {
                  elements: [
                    {
                      kind: "triplet",
                      notes: [
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                      ],
                    },
                    { kind: "note", noteValue: "eighth", dots: 1 },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "rest", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    {
                      kind: "triplet",
                      notes: [
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                      ],
                    },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
              ],
            },
          },
          // W | H T EE | Q. E E Q E | SSSS ESS SSE T | E.S SES T Q | RE E T RQ Q
          {
            id: "mixed-values-4-05",
            title: "六小节总挑战",
            description: "",
            exercise: {
              timeSignature: { beats: 4, beatType: 4 },
              measures: [
                {
                  elements: [{ kind: "note", noteValue: "whole" }],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "half" },
                    {
                      kind: "triplet",
                      notes: [
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                      ],
                    },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "quarter", dots: 1 },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "quarter" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    {
                      kind: "triplet",
                      notes: [
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                      ],
                    },
                  ],
                },
                {
                  elements: [
                    { kind: "note", noteValue: "eighth", dots: 1 },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "sixteenth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "sixteenth" },
                    {
                      kind: "triplet",
                      notes: [
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                      ],
                    },
                    { kind: "note", noteValue: "quarter" },
                  ],
                },
                {
                  elements: [
                    { kind: "rest", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    {
                      kind: "triplet",
                      notes: [
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                        { kind: "note", noteValue: "eighth" },
                      ],
                    },
                    { kind: "rest", noteValue: "quarter" },
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
