import { useMemo, useRef, useState } from "react";
import { firstFamily, stackWithFamily } from "@/lib/font-stack";
import type { SettingDef } from "@/lib/settings-schema";
import { SelectControl } from "./select-control";
import { useSystemFonts } from "./use-system-fonts";

interface FontControlProps {
  def: SettingDef;
  value: string;
  onChange: (value: string) => void | Promise<void>;
}

export function FontControl({ def, value, onChange }: FontControlProps) {
  const { fonts, error: loadError } = useSystemFonts();
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveAttemptRef = useRef(0);
  const currentFamily = firstFamily(value);
  const options = useMemo(() => {
    const installed = fonts ?? [];
    if (!currentFamily || installed.includes(currentFamily)) return installed;
    return [currentFamily, ...installed];
  }, [currentFamily, fonts]);

  function selectFamily(family: string) {
    const attempt = ++saveAttemptRef.current;
    setSaveError(null);
    const nextStack = stackWithFamily(family, value);
    void Promise.resolve(onChange(nextStack)).then(
      () => {
        if (saveAttemptRef.current === attempt) setSaveError(null);
      },
      (changeError: unknown) => {
        if (saveAttemptRef.current === attempt) {
          setSaveError(changeError instanceof Error ? changeError.message : String(changeError));
        }
      },
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <SelectControl
        value={currentFamily}
        options={options}
        disabled={fonts === null}
        ariaLabel={def.label}
        onChange={selectFamily}
        className="w-64"
      />
      {loadError && (
        <span role="alert" className="max-w-64 text-right text-[11px] text-[var(--text-error)]">
          Couldn't load installed fonts.
        </span>
      )}
      {saveError && (
        <span role="alert" className="max-w-64 text-right text-[11px] text-[var(--text-error)]">
          Couldn't save the font: {saveError}
        </span>
      )}
    </div>
  );
}
