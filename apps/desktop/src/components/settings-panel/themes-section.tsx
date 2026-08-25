import { useMemo } from "react";
import { useAllSettings, useSetSetting } from "@/hooks/use-settings";
import {
  getPrimaryDefs,
  suffixOf,
  type PrimarySuffix,
  type ThemeMode,
} from "@/lib/settings-schema";
import { SettingControl } from "./setting-control";

export function ThemesSection() {
  return (
    <>
      <ThemeCard mode="light" />
      <ThemeCard mode="dark" />
    </>
  );
}

function ThemeCard({ mode }: { mode: ThemeMode }) {
  const settings = useAllSettings();
  const setSetting = useSetSetting();

  const primaryDefs = useMemo(() => getPrimaryDefs(mode), [mode]);

  return (
    <section className="mb-10">
      <h2 className="mb-3 text-[13px] font-medium text-[var(--text-muted)]">
        {mode === "light" ? "Light Theme" : "Dark Theme"}
      </h2>
      <div className="-mx-4 overflow-hidden rounded-2xl border border-[var(--line-subtler)] bg-[var(--surface-card)]">
        {primaryDefs.map((def, i) => {
          const suffix = suffixOf(mode, def.key) as PrimarySuffix;
          const value = settings[def.key];
          const isModified = JSON.stringify(value) !== JSON.stringify(def.default);
          return (
            <div
              key={def.key}
              className={i === 0 ? undefined : "border-t border-[var(--line-subtler)]"}
            >
              <SettingControl
                def={def}
                value={value}
                onChange={(v) => void setSetting(`theme.${mode}.${suffix}`, v)}
                onReset={() => void setSetting(def.key, def.default)}
                isModified={isModified}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
