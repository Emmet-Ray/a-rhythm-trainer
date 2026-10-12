import { preloadable } from "../navigation/preloadable";
import type { ComponentProps } from "react";
import type { RhythmEditor } from "../practice/RhythmEditor";

export const workspaceModule = preloadable(() => import("./PracticeWorkspace"));
export const editorModule = preloadable<ComponentProps<typeof RhythmEditor>>(() => import("../practice/RhythmEditor").then(module => ({ default: module.RhythmEditor })));
