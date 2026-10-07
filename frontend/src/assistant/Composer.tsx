import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, useSyncExternalStore, type Ref, type RefObject, type ReactNode } from "react";
import type { FileUIPart } from "ai";
import * as Popover from "@radix-ui/react-popover";
import { Command } from "cmdk";
import { Plus, ImagePlus, Hand, Ear, X, ArrowUp, Square } from "lucide-react";
import { ModelSelector } from "./ModelSelector";
import type { ModelSelection } from "../api/modelConnections";
import type { AssistantConversation } from "./conversation";

const MAX_IMAGES = 3;
type Draft = { text: string; images: FileUIPart[] };
export type ComposerHandle = { clear: () => void; focus: () => void; hasDraft: () => boolean };
type Props = {
  ref: Ref<ComposerHandle>;
  conversation: AssistantConversation;
  ready: boolean;
  visible: boolean;
  welcome: boolean;
  streaming: boolean;
  historyHasImages: boolean;
  onPreview: (url: string) => void;
  /** rejected 表示服务端确认未保存；unknown 不自动恢复，以免重复发送。 */
  onSend: (draft: Draft, selection: ModelSelection) => Promise<"accepted" | "rejected" | "unknown">;
  children?: ReactNode;
};

/** 输入草稿、附件读取与失败恢复归输入框所有；父级只接收一次发送的完整内容。 */
export function Composer({ ref, conversation, ready, visible, welcome, streaming, historyHasImages, onPreview: setExpandedImage, onSend, children }: Props) {
  const state = useSyncExternalStore(conversation.subscribe, conversation.getSnapshot);
  const initializing = !state.initialized;
  const [draft, setDraft] = useState("");
  const [images, setImages] = useState<FileUIPart[]>([]);
  const [imageError, setImageError] = useState("");
  const [readingImages, setReadingImages] = useState(false);
  const imageReading = useRef(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const inputBox = useRef<HTMLDivElement>(null);
  const generation = useRef(0);
  const sending = useRef(false);
  const [modelAvailable, setModelAvailable] = useState(false);
  const [modelSupportsImages, setModelSupportsImages] = useState(false);
  const [modelChoice, setModelChoice] = useState<ModelSelection | null>(null);
  const modelAvailabilityChanged = useCallback((available: boolean, selection: ModelSelection | null, supportsImages: boolean) => {
    setModelAvailable(available); setModelChoice(selection); setModelSupportsImages(supportsImages);
  }, []);
  const requiresImages = images.length > 0 || historyHasImages;
  const limitError = images.length > MAX_IMAGES ? "恢复的草稿超过 3 张图片，请移除部分图片后发送" : draft.length > 4000 ? "恢复的草稿超过 4000 字，请缩短后发送" : "";
  const blocked = readingImages || !!limitError || (requiresImages && !modelSupportsImages) || state.selectingModel ||
    !ready || !modelAvailable || initializing || state.busy || state.restoring || state.needsSync || state.expired;
  useImperativeHandle(ref, () => ({
    clear() { generation.current++; setDraft(""); setImages([]); setImageError(""); },
    focus() { input.current?.focus(); },
    hasDraft() { return !!(draft || images.length || readingImages); },
  }));
  useEffect(() => () => { generation.current++; }, []);
  useLayoutEffect(() => {
    const field = input.current;
    const box = field?.parentElement;
    if (!visible || !field || !box) return;
    const resize = () => {
      field.style.height = "0px";
      field.style.height = `${Math.min(field.scrollHeight, 144)}px`;
    };
    resize();
    let width = box.clientWidth;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      if (width !== box.clientWidth) {
        width = box.clientWidth;
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(resize);
      }
    });
    observer.observe(box);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [draft, visible]);


  function suggest(text: string) { setDraft(text); input.current?.focus(); }
  async function addImages(files: File[]) {
    if (!files.length || imageReading.current) return;
    if (images.length + files.length > MAX_IMAGES) { setImageError("每条消息最多添加 3 张图片"); return; }
    const version = generation.current;
    imageReading.current = true; setReadingImages(true); setImageError("");
    try {
      const added = await readImages(files);
      if (version === generation.current) setImages(current => [...current, ...added]);
    } catch (error) {
      if (version === generation.current) setImageError(error instanceof Error ? error.message : "图片读取失败");
    } finally { imageReading.current = false; setReadingImages(false); }
  }
  async function send() {
    if (blocked || sending.current || imageReading.current || !modelChoice || (!draft.trim() && !images.length)) return;
    const version = generation.current, original = { text: draft, images };
    sending.current = true;
    setDraft(""); setImages([]); setImageError("");
    try {
      const result = await onSend({ text: draft.trim(), images }, modelChoice);
      if (version === generation.current && result === "rejected") {
        // 失败前新编辑的内容与原草稿全部保留；超限时交给用户删减，不静默丢弃。
        setDraft(current => [original.text, current].filter(Boolean).join("\n\n"));
        setImages(current => [...original.images, ...current]);
      }
    } finally { sending.current = false; }
  }
  return <form hidden={!visible} className="assistant-composer" onSubmit={event => { event.preventDefault(); void send(); }}>
    {children}
    {limitError && <p className="assistant-error" role="alert">{limitError}</p>}
    {imageError && <p className="assistant-error" role="alert">{imageError}</p>}
    {requiresImages && modelAvailable && !modelSupportsImages && !initializing && <p className="assistant-error" role="status">请选择支持图片的模型</p>}
    <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden aria-label="选择图片文件" onChange={event => { void addImages(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
    <div ref={inputBox} className="assistant-input-box">
      {images.length > 0 && <div className="assistant-image-drafts" aria-label="待发送图片">{images.map((image, index) => <div className="assistant-image-draft" key={index}>
        <button type="button" aria-label={`预览图片 ${index + 1}`} onClick={() => setExpandedImage(image.url)}><img src={image.url} alt={`图片 ${index + 1}`} /></button>
        <button type="button" className="assistant-image-remove" aria-label={`移除图片 ${index + 1}`} onClick={() => { setImages(current => current.filter((_, i) => i !== index)); setImageError(""); }}><X size={12} /></button>
      </div>)}</div>}
      <textarea
        ref={input}
        id="assistant-input"
        aria-label="向助手提问"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onPaste={event => {
          const files = Array.from(event.clipboardData.files);
          if (files.length) { event.preventDefault(); void addImages(files); }
        }}
        maxLength={4000}
        rows={1}
        disabled={!ready}
        placeholder={
          state.busy ? "可以继续输入，回答结束后发送…" : welcome
            ? "描述你想练的内容，或问一个问题…"
            : "继续提问或调整练习…"
        }
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            !state.busy &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing &&
            event.keyCode !== 229
          ) {
            event.preventDefault();
            void send();
          }
        }}
      />
      <div className="assistant-input-toolbar">
        <ComposerMenu anchor={inputBox} onSelect={suggest} disabled={!ready}
          onAddImages={() => imageInput.current?.click()}
          imagesDisabled={readingImages || images.length >= MAX_IMAGES} />
        <ModelSelector requiresImages={requiresImages} selection={state.session ? state.session.model_selection ?? null : undefined}
          disabled={initializing || state.selectingModel || state.restoring || (state.busy && !state.session) || state.needsSync || state.expired}
          onSelect={selection => conversation.selectModel(selection)} onAvailable={modelAvailabilityChanged} />
        <div className="assistant-input-actions">
          {streaming ? (
            <button
              type="button"
              aria-label="停止生成"
              title="停止生成"
              onClick={() => conversation.stop()}
            >
              <Square size={15} aria-hidden="true" />
            </button>
          ) : (
            <button
              type="submit"
              aria-label="发送"
              title="发送"
              disabled={blocked || (!draft.trim() && !images.length)}
            >
              <ArrowUp size={19} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  </form>;
}

/** Drafts remain in the browser until the message is sent */
async function readImages(files: File[]): Promise<FileUIPart[]> {
  if (files.length > MAX_IMAGES) throw new Error("每条消息最多添加 3 张图片");
  return Promise.all(files.map(async file => {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || !file.size || file.size > 2 * 1024 * 1024)
      throw new Error("请选择不超过 2 MB 的 PNG、JPEG 或 WebP 图片");
    const url = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("图片读取失败，请重试"));
      reader.readAsDataURL(file);
    });
    return { type: "file", mediaType: file.type, filename: file.name, url };
  }));
}

const templates = [
  { title: "生成击拍练习", icon: Hand, text: "给我一道两小节的入门击拍练习，以八分音符为主。" },
  { title: "生成节奏听写", icon: Ear, text: "给我一道两小节的入门节奏听写题，以四分音符和八分音符为主。" },
];

/** 图片交给草稿处理；练习模板只填入文字，不自动发送。 */
function ComposerMenu({ anchor, onSelect, onAddImages, disabled, imagesDisabled }: {
  anchor: RefObject<HTMLDivElement | null>;
  onSelect: (text: string) => void;
  onAddImages: () => void;
  disabled: boolean;
  imagesDisabled: boolean;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLElement>();
  const [open, setOpen] = useState(false);
  const command = useRef<HTMLDivElement>(null);
  const chosen = useRef(false);
  const [keyboardNavigation, setKeyboardNavigation] = useState(false);
  return <Popover.Root open={open} onOpenChange={value => { setOpen(value); setKeyboardNavigation(false); chosen.current = false; if (value) setPortalContainer(trigger.current?.closest("dialog") ?? undefined); }}>
    {open && <Popover.Anchor virtualRef={anchor} />}
    <Popover.Trigger asChild>
      <button ref={trigger} type="button" className="assistant-add-trigger" aria-label="添加内容" title="添加内容" disabled={disabled}><Plus size={22} /></button>
    </Popover.Trigger>
    <Popover.Portal container={portalContainer}>
      <Popover.Content className="design-system assistant-composer-menu" aria-label="添加内容" side="top" align="start" sideOffset={8} collisionPadding={12}
        data-keyboard-navigation={keyboardNavigation}
        onPointerMove={() => setKeyboardNavigation(false)}
        onKeyDownCapture={event => { if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) setKeyboardNavigation(true); }}
        onOpenAutoFocus={event => { event.preventDefault(); command.current?.focus(); }}
        onCloseAutoFocus={event => { if (chosen.current) event.preventDefault(); }}>
        <Command ref={command} label="添加内容" tabIndex={0} loop>
          <Command.List aria-label="可添加内容">
            <Command.Group heading="添加">
              <Command.Item value="image" disabled={imagesDisabled} onSelect={() => { setOpen(false); onAddImages(); }}><ImagePlus size={18} />添加图片</Command.Item>
            </Command.Group>
            <Command.Group heading="练习">
              {templates.map(({ title, icon: Icon, text }) => <Command.Item key={title} value={title} onSelect={() => { chosen.current = true; setOpen(false); onSelect(text); }}><Icon size={18} />{title}</Command.Item>)}
            </Command.Group>
          </Command.List>
        </Command>
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>;
}
