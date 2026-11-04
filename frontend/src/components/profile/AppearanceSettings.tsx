import { useLocalStorage } from "../../hooks/useLocalStorage";
import { useTheme, type ThemePreference } from "../../hooks/useTheme";
import { CHARACTER_SHORTCUTS_KEY, SIDEBAR_COLLAPSED_KEY } from "../navigation";
import { Card, CardHeader, SegmentedControl, Shortcut, Switch, type SegmentedOption } from "../ui";

const THEMES: readonly SegmentedOption<ThemePreference>[] = [
  { value: "light", label: "Light", icon: "sun" },
  { value: "dark", label: "Dark", icon: "moon" },
  { value: "system", label: "System", icon: "monitor" },
];

/** Both roles' display preferences. They live in this browser only. */
export function AppearanceSettings() {
  const { preference, resolved, setPreference } = useTheme();
  // The same stored value the shell reads, so "[" and this switch stay in step.
  const [collapsed, setCollapsed] = useLocalStorage(SIDEBAR_COLLAPSED_KEY, false);
  // useHotkeys reads the same value, so turning this off takes effect at once.
  const [characterKeys, setCharacterKeys] = useLocalStorage(CHARACTER_SHORTCUTS_KEY, true);

  return (
    <Card>
      <CardHeader
        title="Appearance"
        icon="sliders"
        description="Saved in this browser, so each device can have its own."
      />
      <div className="form-grid">
        <div className="profile-setting">
          <span className="profile-setting-label" aria-hidden="true">
            Theme
          </span>
          <SegmentedControl<ThemePreference>
            aria-label="Theme"
            value={preference}
            onChange={setPreference}
            options={THEMES}
          />
          {preference === "system" && (
            <span className="profile-setting-hint">Follows your device: {resolved} right now.</span>
          )}
        </div>
        <Switch
          checked={collapsed}
          onCheckedChange={setCollapsed}
          label="Compact sidebar"
          description={
            <>
              Show navigation as icons only on wide screens.
              {characterKeys && (
                <>
                  {" "}
                  Toggle it anywhere with <Shortcut combo="[" />.
                </>
              )}
            </>
          }
        />
        <Switch
          checked={characterKeys}
          onCheckedChange={setCharacterKeys}
          label="Single-key shortcuts"
          description={
            <>
              Keys like <Shortcut combo="?" />, <Shortcut combo="g j" /> and <Shortcut combo="/" />. Turn
              them off if you use speech input or press keys by accident. <Shortcut combo="mod+k" /> always
              works.
            </>
          }
        />
      </div>
    </Card>
  );
}
