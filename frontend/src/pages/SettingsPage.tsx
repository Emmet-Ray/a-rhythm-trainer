import { useContext, useLayoutEffect, useState } from "react";
import { VisitsContext } from "../navigation/usePageNavigation";
import {
  Database,
  Palette,
  Target,
  Trash2,
  UserRound,
  Volume2,
} from "lucide-react";
import { SuccessToast } from "../navigation/SuccessToast";
import { useSearchParams } from "react-router";
import type { useAuth } from "../auth/useAuth";
import LoginForm from "../settings/LoginForm";
import LocalRecordSettings from "../settings/LocalRecordSettings";
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
  clearCustomExercises,
  getCustomExerciseSummary,
} from "../exercises/customExercises";
import {
  DEFAULT_TAPPING_PRECISION,
  getTappingPrecision,
  selectTappingPrecision,
  tappingPrecisions,
} from "../settings/tappingPrecision";

const categories = [
  { id: "account", label: "账号", icon: UserRound },
  { id: "appearance", label: "外观", icon: Palette },
  { id: "local-data", label: "本地数据", icon: Database },
  { id: "sound", label: "声音", icon: Volume2 },
  { id: "tapping-precision", label: "击拍精度", icon: Target },
] as const;

export default function SettingsPage({
  auth,
}: {
  auth: ReturnType<typeof useAuth>;
}) {
  const [params, setParams] = useSearchParams();
  const category =
    categories.find((item) => item.id === params.get("category"))?.id ??
    "account";
  const [appearance, setAppearance] = useState(getAppearance);
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
          {category === "account" && <AccountSettings auth={auth} />}
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

function AccountSettings({ auth }: { auth: ReturnType<typeof useAuth> }) {
  return (
    <section className="settings-section" aria-labelledby="account-heading">
      <h2 id="account-heading">账号</h2>
      {auth.error && (
        <p role="alert" className="settings-message">
          {auth.error}
        </p>
      )}
      {auth.state.status === "checking" ? (
        <p role="status" data-navigation-pending>
          正在确认登录…
        </p>
      ) : auth.state.status === "disabled" ? (
        <p role="status">
          此站点未启用账号功能。你仍可使用预设、随机和本地自定义练习；本地题目保存在当前浏览器中。
        </p>
      ) : auth.state.status === "authenticated" ? (
        <>
          <p role="status">已登录</p>
          <div className="settings-actions">
            <button
              type="button"
              disabled={auth.busy}
              onClick={() => void auth.logout()}
            >
              {auth.busy ? "正在退出…" : "退出登录"}
            </button>
          </div>
        </>
      ) : (
        <>
          {auth.state.status === "unavailable" && (
            <div className="account-connection">
              <p role="status">
                暂时无法确认登录状态，可以重试检查或重新登录。
              </p>
              <button type="button" disabled={auth.busy} onClick={auth.refresh}>
                重新检查
              </button>
            </div>
          )}
          <LoginForm auth={auth} />
        </>
      )}
    </section>
  );
}

function TappingPrecisionSettings() {
  const [preference, setPreference] = useState(getTappingPrecision);
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

type LocalDataState =
  | { summary: ReturnType<typeof getCustomExerciseSummary>; error: null }
  | { summary: null; error: string };

function formatStorageSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function readLocalData(): LocalDataState {
  try {
    return { summary: getCustomExerciseSummary(), error: null };
  } catch (error) {
    return {
      summary: null,
      error: error instanceof Error ? error.message : "无法读取本地练习。",
    };
  }
}

// 每次进入此分类重新读取；不根据登录状态切换数据来源。
function LocalDataSettings() {
  const [data, setData] = useState(readLocalData);
  const [notice, setNotice] = useState(0);
  const [clearError, setClearError] = useState("");

  function clear() {
    if (
      !window.confirm(
        "将删除当前浏览器保存的全部自定义题目，无法恢复，确定清空吗？",
      )
    )
      return;
    setClearError("");
    try {
      clearCustomExercises();
      setData(readLocalData());
      setNotice((value) => value + 1);
    } catch (error) {
      setClearError(
        error instanceof Error ? error.message : "清空本地练习失败。",
      );
    }
  }

  return (
    <section className="settings-section" aria-labelledby="local-data-heading">
      <h2 id="local-data-heading">本地数据</h2>
      <section
        className="local-data-group"
        aria-labelledby="local-library-heading"
      >
        <div className="local-data-copy">
          <h3 id="local-library-heading">自定义题库</h3>
          {data.summary ? (
            <>
              <p className="local-data-totals">
                {data.summary.total} 道题目 <span aria-hidden="true">·</span>{" "}
                <span title="仅估算自定义题库存储文本的大小">
                  {data.summary.estimatedBytes > 0 ? "约 " : ""}
                  {formatStorageSize(data.summary.estimatedBytes)}
                </span>
              </p>
              <p className="local-data-breakdown">
                <span>击拍 {data.summary.tapping} 道</span>
                <span>听写 {data.summary.dictation} 道</span>
              </p>
            </>
          ) : (
            <div className="settings-actions">
              <p role="alert" className="settings-message">
                {data.error}
              </p>
              <button
                type="button"
                onClick={() => {
                  setData(readLocalData());
                }}
              >
                重新读取
              </button>
            </div>
          )}
        </div>
        <div className="local-data-actions text-actions">
          <button
            type="button"
            className="local-data-clear"
            disabled={data.summary?.total === 0}
            onClick={clear}
          >
            <Trash2 className="ui-icon" aria-hidden="true" />
            清空题库
          </button>
        </div>
        {clearError && (
          <p role="alert" className="settings-message">
            {clearError}
          </p>
        )}
        {notice > 0 && (
          <SuccessToast
            key={notice}
            message="自定义题库已清空，练习记录未修改"
          />
        )}
      </section>
      <LocalRecordSettings />
    </section>
  );
}
