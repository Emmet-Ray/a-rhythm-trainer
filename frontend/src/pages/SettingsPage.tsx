import { useAssistantPageContext, useAssistantPageSection } from "../assistant/assistantContext";
import { useContext, useLayoutEffect, useState } from "react";
import { VisitsContext } from "../navigation/usePageNavigation";
import {
  Database,
  Bot,
  Palette,
  Target,
  Volume2,
} from "lucide-react";
import { useSearchParams } from "react-router";
import ModelServiceSettings from "../settings/ModelServiceSettings";
import LocalDataSettings from "../settings/LocalDataSettings";
import {
  colorModes,
  getAppearance,
  resetAppearance,
  selectColorMode,
  selectTheme,
  themes,
  type Theme,
} from "../settings/appearance";

import {
  DEFAULT_TAPPING_PRECISION,
  getTappingPrecision,
  selectTappingPrecision,
  tappingPrecisions,
} from "../settings/tappingPrecision";

const categories = [
  { id: "appearance", label: "外观", icon: Palette },
  { id: "models", label: "模型服务", icon: Bot },
  { id: "local-data", label: "本地数据", icon: Database },
  { id: "sound", label: "声音", icon: Volume2 },
  { id: "tapping-precision", label: "击拍精度", icon: Target },
] as const;

export default function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const category =
    categories.find((item) => item.id === params.get("category"))?.id ??
    "appearance";
  const [appearance, setAppearance] = useState(getAppearance);
  useAssistantPageContext({ page: "settings", description: "设置页，仅提供公开偏好，不包含模型凭证；声音设置尚未开放。",
    state: { category, categories: categories.map(({ id, label }) => ({ id, label, available: id !== "sound" })),
      appearance: { colorMode: appearance.colorMode, theme: appearance.theme } } });
  const visits = useContext(VisitsContext);
  useLayoutEffect(() => {
    visits?.rememberDestination("/settings", `/settings?category=${category}`);
  }, [visits, category]);

  function choose(theme: Theme) {
    setAppearance(selectTheme(theme));
  }

  return (
    <section
      className="design-system settings-page"
      aria-labelledby="settings-heading"
    >
      <title>设置 · 节奏训练</title>
      <header className="page-heading">
        <h1 id="settings-heading">设置</h1>
      </header>
      <div className="settings-layout">
        <nav className="settings-navigation" aria-label="设置分类">
          {categories.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={category === item.id}
              aria-controls="settings-content"
              onClick={() =>
                setParams(
                  (previous) => {
                    const next = new URLSearchParams(previous);
                    next.set("category", item.id);
                    return next;
                  },
                  { replace: true },
                )
              }
            >
              <item.icon
                className="ui-icon ui-icon--action"
                aria-hidden="true"
                focusable="false"
              />
              {item.label}
              {item.id === "sound" && (
                <span className="settings-unavailable">未开放</span>
              )}
            </button>
          ))}
        </nav>
        <div id="settings-content" className="settings-content">
          {category === "appearance" && (
            <section
              className="settings-section"
              aria-labelledby="appearance-heading"
            >
              <h2 id="appearance-heading">外观</h2>
              <fieldset className="settings-options appearance-modes">
                <legend>明暗模式</legend>
                {colorModes.map((mode) => (
                  <label key={mode.id}>
                    <input
                      type="radio"
                      name="color-mode"
                      value={mode.id}
                      checked={appearance.colorMode === mode.id}
                      onChange={() => setAppearance(selectColorMode(mode.id))}
                    />
                    <span>{mode.label}</span>
                  </label>
                ))}
              </fieldset>
              <fieldset className="settings-options">
                <legend>配色主题</legend>
                {themes.map((theme) => (
                  <label key={theme.id}>
                    <input
                      type="radio"
                      name="theme"
                      value={theme.id}
                      checked={appearance.theme === theme.id}
                      onChange={() => choose(theme.id)}
                    />
                    <span
                      className="theme-swatch"
                      data-theme-preview={theme.id}
                      aria-hidden="true"
                    />
                    <span>{theme.label}</span>
                  </label>
                ))}
              </fieldset>
              <div className="settings-actions">
                <button
                  type="button"
                  onClick={() => setAppearance(resetAppearance())}
                >
                  恢复默认
                </button>
              </div>
              <p className="settings-message" role="status">
                {!appearance.storageAvailable &&
                  "浏览器存储不可用，本次外观设置仍会生效，但刷新后可能恢复默认。"}
              </p>
            </section>
          )}
          {category === "models" && <ModelServiceSettings />}
          {category === "local-data" && <LocalDataSettings />}
          {category === "sound" && (
            <section
              className="settings-section"
              aria-labelledby="sound-heading"
            >
              <header className="settings-section-heading">
                <h2 id="sound-heading">声音</h2>
              </header>
              <p>暂未提供音色设置。</p>
              {/* TODO: 接入音色偏好与试听；练习页仍保留节拍器开关。 */}
            </section>
          )}
          {category === "tapping-precision" && <TappingPrecisionSettings />}
        </div>
      </div>
    </section>
  );
}

function TappingPrecisionSettings() {
  const [preference, setPreference] = useState(getTappingPrecision);
  useAssistantPageSection("tappingPrecision", { selected: preference.precision, storageAvailable: preference.storageAvailable,
    options: tappingPrecisions.map(({ id, label, windows }) => ({ id, label, windows: { ...windows } })) });
  return (
    <section
      className="settings-section"
      aria-labelledby="tapping-precision-heading"
    >
      <h2 id="tapping-precision-heading">击拍精度</h2>
      <fieldset
        className="settings-options"
        aria-describedby="tapping-precision-description"
      >
        <legend>精准度要求</legend>
        {tappingPrecisions.map((item) => (
          <label key={item.id}>
            <input
              type="radio"
              name="tapping-precision"
              value={item.id}
              checked={preference.precision === item.id}
              onChange={() => setPreference(selectTappingPrecision(item.id))}
            />
            <span>{item.label}</span>
          </label>
        ))}
      </fieldset>
      <div className="settings-actions">
        <button
          type="button"
          onClick={() =>
            setPreference(selectTappingPrecision(DEFAULT_TAPPING_PRECISION))
          }
        >
          恢复默认
        </button>
      </div>
      <p className="settings-message" role="status">
        {!preference.storageAvailable &&
          "浏览器存储不可用，本次选择仍会生效，但刷新后可能恢复标准。"}
      </p>
    </section>
  );
}
