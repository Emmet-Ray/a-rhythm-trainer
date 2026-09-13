import { useState } from "react";
import { DEFAULT_THEME, getAppearance, selectTheme, themes, type Theme } from "../settings/appearance";

export default function SettingsPage() {
  const [appearance, setAppearance] = useState(getAppearance);

  function choose(theme: Theme) {
    setAppearance(selectTheme(theme));
  }

  return (
    <section className="design-system settings-page" aria-labelledby="settings-heading">
      <title>设置 · 节奏训练</title>
      <header className="page-heading"><h1 id="settings-heading">设置</h1></header>
      <section aria-labelledby="appearance-heading">
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
    </section>
  );
}
