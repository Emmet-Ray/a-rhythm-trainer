import { preloadable } from "../navigation/preloadable";
import type { ComponentProps } from "react";
import type { RhythmEditor } from "./RhythmEditor";

export const workspaceModule = preloadable(() => import("./PracticeWorkspace"));
export const editorModule = preloadable<ComponentProps<typeof RhythmEditor>>(() => import("./RhythmEditor").then(module => ({ default: module.RhythmEditor })));
