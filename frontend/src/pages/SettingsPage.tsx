import { useState } from "react";
import { DEFAULT_THEME, getAppearance, selectTheme, themes, type Theme } from "../settings/appearance";

const categories = [
  { id: "appearance", label: "外观" },
  { id: "local-data", label: "本地数据" },
  { id: "sound", label: "声音" },
  { id: "difficulty", label: "练习难度" },
] as const;

export default function SettingsPage() {
  const [category, setCategory] = useState<typeof categories[number]["id"]>("appearance");
  const [appearance, setAppearance] = useState(getAppearance);

  function choose(theme: Theme) {
    setAppearance(selectTheme(theme));
  }

  return (
    <section className="design-system settings-page" aria-labelledby="settings-heading">
      <title>设置 · 节奏训练</title>
      <header className="page-heading"><h1 id="settings-heading">设置</h1></header>
      <div className="settings-layout">
        <nav className="settings-navigation" aria-label="设置分类">
          {categories.map(item => (
            <button key={item.id} type="button" aria-pressed={category === item.id}
              aria-controls="settings-content" onClick={() => setCategory(item.id)}>
              {item.label}
            </button>
          ))}
        </nav>
        <div id="settings-content" className="settings-content">
          {category === "appearance" && (
          <section className="settings-section" aria-labelledby="appearance-heading">
            <h2 id="appearance-heading">外观</h2>
            <fieldset className="theme-options">
              <legend>配色主题</legend>
              {themes.map(theme => (
                <label key={theme.id}>
                  <input type="radio" name="theme" value={theme.id}
                    checked={appearance.theme === theme.id} onChange={() => choose(theme.id)} />
                  <span className="theme-swatch" data-theme-preview={theme.id} aria-hidden="true" />
                  <span>{theme.label}</span>
                </label>
              ))}
            </fieldset>
            <div className="settings-actions">
              <button type="button" onClick={() => choose(DEFAULT_THEME)}>恢复默认</button>
            </div>
            <p className="settings-message" role="status">
              {!appearance.storageAvailable && "浏览器存储不可用，本次配色仍会生效，但刷新后可能恢复默认。"}
            </p>
          </section>
          )}
          {category === "local-data" && (
          <section className="settings-section" aria-labelledby="local-data-heading">
            <header className="settings-section-heading">
              <h2 id="local-data-heading">本地数据</h2>
              <span>待实现</span>
            </header>
            <p>管理保存在当前浏览器中的自定义练习。</p>
            {/* TODO: 展示和管理本地练习；与账号题库分开，不作为普通缓存清理。 */}
          </section>
          )}
          {category === "sound" && (
          <section className="settings-section" aria-labelledby="sound-heading">
            <header className="settings-section-heading">
              <h2 id="sound-heading">声音</h2>
              <span>待实现</span>
            </header>
            <p>选择节拍器和练习音色。</p>
            {/* TODO: 接入音色偏好与试听；练习页仍保留节拍器开关。 */}
          </section>
          )}
          {category === "difficulty" && (
          <section className="settings-section" aria-labelledby="difficulty-heading">
            <header className="settings-section-heading">
              <h2 id="difficulty-heading">练习难度</h2>
              <span>待实现</span>
            </header>
            <p>调整击拍判定的精准度要求。</p>
            {/* TODO: 确定判定容差档位后再接入；不改变题目内容或 BPM。 */}
          </section>
          )}
        </div>
      </div>
    </section>
  );
}
