import { describe, expect, test } from "vite-plus/test";
import {
  getPrimaryDefs,
  SETTINGS_SCHEMA,
  suffixOf,
  type ThemeMode,
} from "../src/lib/settings-schema";

const presetFiles = import.meta.glob<Record<string, unknown>>("../shared/themes/*/*.json", {
  eager: true,
  import: "default",
});

describe("typography settings", () => {
  test("keep their persisted keys and CSS bindings under the Typography category", () => {
    const fonts = SETTINGS_SCHEMA.filter((def) => def.key.startsWith("fonts.")).map((def) => ({
      key: def.key,
      label: def.label,
      category: def.category,
      type: def.type,
      cssVar: def.cssVar,
    }));

    expect(fonts).toEqual([
      {
        key: "fonts.ui",
        label: "UI font",
        category: "Typography",
        type: "font",
        cssVar: "--ui-font",
      },
      {
        key: "fonts.editor",
        label: "Editor font",
        category: "Typography",
        type: "font",
        cssVar: "--editor-font",
      },
      {
        key: "fonts.mono",
        label: "Code font",
        category: "Typography",
        type: "font",
        cssVar: "--mono-font",
      },
    ]);
  });

  test("default to SF Pro for prose and SF Mono for code", () => {
    const defaults = Object.fromEntries(
      SETTINGS_SCHEMA.filter((def) => def.key.startsWith("fonts.")).map((def) => [
        def.key,
        String(def.default),
      ]),
    );

    const proseFallback =
      '-apple-system-body, ui-sans-serif, -apple-system, system-ui, "Segoe UI", Helvetica, "Apple Color Emoji", Arial, sans-serif, "Segoe UI Emoji", "Segoe UI Symbol"';
    const monoFallback =
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

    expect(defaults["fonts.ui"]).toBe(`"SF Pro", ${proseFallback}`);
    expect(defaults["fonts.editor"]).toBe(`"SF Pro", ${proseFallback}`);
    expect(defaults["fonts.mono"]).toBe(`"SF Mono", ${monoFallback}`);
  });
});

describe("pane layout settings", () => {
  test("declare the layout mode contract the pane row switches on", () => {
    const def = SETTINGS_SCHEMA.find((d) => d.key === "appearance.column-layout");

    expect(def).toMatchObject({
      category: "Appearance",
      type: "boolean",
      default: true,
    });
  });

  test("declare a numeric minimum pane width", () => {
    const def = SETTINGS_SCHEMA.find((d) => d.key === "appearance.pane-width");

    expect(def).toMatchObject({
      category: "Appearance",
      type: "number",
      default: 720,
    });
  });
});

describe("theme presets", () => {
  test("at least one preset file is discovered", () => {
    expect(Object.keys(presetFiles).length).toBeGreaterThan(0);
  });

  test("define every editable primary from the settings schema", () => {
    for (const [path, preset] of Object.entries(presetFiles)) {
      const mode: ThemeMode = path.endsWith("/dark.json") ? "dark" : "light";
      const schemaKeys = getPrimaryDefs(mode)
        .map((def) => suffixOf(mode, def.key))
        .sort();
      expect(Object.keys(preset).sort(), path).toEqual(schemaKeys);
    }
  });
});
