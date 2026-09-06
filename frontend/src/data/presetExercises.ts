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
    "id": "steady-pulse",
    "title": "基础节拍",
    "description": "从均匀的四分音符开始，保持稳定的节拍。",
    "modes": [
      {
        "mode": "tapping",
        "questions": [
          {
            "id": "quarters",
            "title": "四分音符",
            "description": "四个均匀的四分音符，练习保持稳定速度。",
            "exercise": {
              "timeSignature": {
                "beats": 4,
                "beatType": 4
              },
              "measures": [
                {
                  "events": [
                    {
                      "kind": "note",
                      "noteValue": "quarter"
                    },
                    {
                      "kind": "note",
                      "noteValue": "quarter"
                    },
                    {
                      "kind": "note",
                      "noteValue": "quarter"
                    },
                    {
                      "kind": "note",
                      "noteValue": "quarter"
                    }
                  ]
                }
              ]
            }
          },
          {
            "id": "three-measures",
            "title": "三小节",
            "description": "连续三个小节的四分音符，练习长时间保持稳定速度。",
            "exercise": {
              "timeSignature": {
                "beats": 4,
                "beatType": 4
              },
              "measures": [
                {
                  "events": [
                    {
                      "kind": "note",
                      "noteValue": "quarter"
                    },
                    {
                      "kind": "note",
                      "noteValue": "quarter"
                    },
                    {
                      "kind": "note",
                      "noteValue": "quarter"
                    },
                    {
                      "kind": "note",
                      "noteValue": "quarter"
                    }
                  ]
                },
                {
                  "events": [
                    {
                      "kind": "note",
                      "noteValue": "quarter"
                    },
                    {
                      "kind": "note",
                      "noteValue": "quarter"
                    },
                    {
                      "kind": "note",
                      "noteValue": "quarter"
                    },
                    {
                      "kind": "note",
                      "noteValue": "quarter"
                    }
                  ]
                },
                {
                  "events": [
                    {
                      "kind": "note",
                      "noteValue": "quarter"
                    },
                    {
                      "kind": "note",
                      "noteValue": "quarter"
                    },
                    {
                      "kind": "note",
                      "noteValue": "quarter"
                    },
                    {
                      "kind": "note",
                      "noteValue": "quarter"
                    }
                  ]
                }
              ]
            }
          }
        ]
      },
      {
        "mode": "dictation",
        "questions": []
      },
      {
        "mode": "geometry",
        "questions": []
      }
    ]
  },
  {
    "id": "subdivision",
    "title": "节拍细分",
    "description": "认识四分音符与八分音符之间的关系。",
    "modes": [
      {
        "mode": "tapping",
        "questions": [
          {
            "id": "eighths",
            "title": "加入八分音符",
            "description": "三个四分音符后接两个八分音符，练习细分节拍。",
            "exercise": {
              "timeSignature": {
                "beats": 4,
                "beatType": 4
              },
              "measures": [
                {
                  "events": [
                    {
                      "kind": "note",
                      "noteValue": "quarter"
                    },
                    {
                      "kind": "note",
                      "noteValue": "quarter"
                    },
                    {
                      "kind": "note",
                      "noteValue": "quarter"
                    },
                    {
                      "kind": "note",
                      "noteValue": "eighth"
                    },
                    {
                      "kind": "note",
                      "noteValue": "eighth"
                    }
                  ]
                }
              ]
            }
          }
        ]
      },
      {
        "mode": "dictation",
        "questions": []
      },
      {
        "mode": "geometry",
        "questions": []
      }
    ]
  },
  {
    "id": "rests",
    "title": "音符与休止符",
    "description": "在没有声音的地方，继续保持节奏。",
    "modes": [
      {
        "mode": "tapping",
        "questions": [
          {
            "id": "rests",
            "title": "音符与休止符",
            "description": "加入四分和八分休止符，练习在停顿中保持节奏。",
            "exercise": {
              "timeSignature": {
                "beats": 4,
                "beatType": 4
              },
              "measures": [
                {
                  "events": [
                    {
                      "kind": "note",
                      "noteValue": "quarter"
                    },
                    {
                      "kind": "rest",
                      "noteValue": "quarter"
                    },
                    {
                      "kind": "note",
                      "noteValue": "eighth"
                    },
                    {
                      "kind": "rest",
                      "noteValue": "eighth"
                    },
                    {
                      "kind": "note",
                      "noteValue": "quarter"
                    }
                  ]
                }
              ]
            }
          }
        ]
      },
      {
        "mode": "dictation",
        "questions": []
      },
      {
        "mode": "geometry",
        "questions": []
      }
    ]
  },
  {
    "id": "long-values",
    "title": "长时值与连续练习",
    "description": "拉长敲击间隔，并把节拍保持到下一个小节。",
    "modes": [
      {
        "mode": "tapping",
        "questions": [
          {
            "id": "halves",
            "title": "二分音符",
            "description": "两个二分音符，每隔两拍敲一次。",
            "exercise": {
              "timeSignature": {
                "beats": 4,
                "beatType": 4
              },
              "measures": [
                {
                  "events": [
                    {
                      "kind": "note",
                      "noteValue": "half"
                    },
                    {
                      "kind": "note",
                      "noteValue": "half"
                    }
                  ]
                }
              ]
            }
          },
          {
            "id": "whole",
            "title": "全音符",
            "description": "起点只敲一次，保持四拍，不要重复敲击。",
            "exercise": {
              "timeSignature": {
                "beats": 4,
                "beatType": 4
              },
              "measures": [
                {
                  "events": [
                    {
                      "kind": "note",
                      "noteValue": "whole"
                    }
                  ]
                }
              ]
            }
          },
          {
            "id": "two-measures",
            "title": "两小节连续练习",
            "description": "两个二分音符后接一个全音符，小节之间不停顿。",
            "exercise": {
              "timeSignature": {
                "beats": 4,
                "beatType": 4
              },
              "measures": [
                {
                  "events": [
                    {
                      "kind": "note",
                      "noteValue": "half"
                    },
                    {
                      "kind": "note",
                      "noteValue": "half"
                    }
                  ]
                },
                {
                  "events": [
                    {
                      "kind": "note",
                      "noteValue": "whole"
                    }
                  ]
                }
              ]
            }
          }
        ]
      },
      {
        "mode": "dictation",
        "questions": []
      },
      {
        "mode": "geometry",
        "questions": []
      }
    ]
  }
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
