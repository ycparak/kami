import { Menu } from "@tauri-apps/api/menu/menu";
import { CheckMenuItem } from "@tauri-apps/api/menu/checkMenuItem";
import type { DocumentStats } from "@/lib/document-stats";

export const FOOTER_METRICS = [
  {
    settingKey: "statusbar.show-words",
    statKey: "words",
    footerLabel: "words",
    menuLabel: "Words",
  },
  {
    settingKey: "statusbar.show-characters",
    statKey: "characters",
    footerLabel: "characters",
    menuLabel: "Characters",
  },
  {
    settingKey: "statusbar.show-paragraphs",
    statKey: "paragraphs",
    footerLabel: "paragraphs",
    menuLabel: "Paragraphs",
  },
] as const satisfies ReadonlyArray<{
  settingKey: string;
  statKey: keyof DocumentStats;
  footerLabel: string;
  menuLabel: string;
}>;

export type FooterMetricSettingKey = (typeof FOOTER_METRICS)[number]["settingKey"];

export interface FooterContextMenuState {
  visibility: Record<FooterMetricSettingKey, boolean>;
  onToggle: (key: FooterMetricSettingKey, visible: boolean) => void;
}

export function buildFooterMenuItemsSpec(
  state: FooterContextMenuState,
): Array<{ id: FooterMetricSettingKey; text: string; checked: boolean; action: () => void }> {
  return FOOTER_METRICS.map(({ settingKey, menuLabel }) => ({
    id: settingKey,
    text: menuLabel,
    checked: state.visibility[settingKey],
    action: () => state.onToggle(settingKey, !state.visibility[settingKey]),
  }));
}

export async function showFooterContextMenu(state: FooterContextMenuState): Promise<void> {
  const spec = buildFooterMenuItemsSpec(state);

  const items = await Promise.all(
    spec.map((entry) =>
      CheckMenuItem.new({
        id: entry.id,
        text: entry.text,
        checked: entry.checked,
        action: entry.action,
      }),
    ),
  );

  const menu = await Menu.new({ items });
  await menu.popup();
}
