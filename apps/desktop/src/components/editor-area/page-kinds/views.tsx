import { EditorPane } from "../editor-pane";
import { DocumentFooter } from "../document-footer";
import { NewTabPage } from "../new-tab-page";
import { SettingsPanel } from "@/components/settings-panel";
import type { Location } from "./index";
import type { FileLocation } from "./file";
import type { LauncherLocation } from "./launcher";
import type { SettingsLocation } from "./settings";
import type { PageKindView } from "./types";

// eslint-disable-next-line react-doctor/only-export-components
const FileTabBody = ({
  location,
  isActive,
  tabId,
}: {
  location: FileLocation;
  isActive: boolean;
  tabId: string;
}) => <EditorPane path={location.path} isActive={isActive} tabId={tabId} />;

const views = {
  file: {
    Component: FileTabBody,
    renderFooter: (l) => <DocumentFooter filePath={l.path} />,
  } satisfies PageKindView<FileLocation>,
  launcher: {
    Component: NewTabPage,
  } satisfies PageKindView<LauncherLocation>,
  settings: {
    Component: SettingsPanel,
  } satisfies PageKindView<SettingsLocation>,
} as const;

export function pageKindView(location: Location): PageKindView {
  const view = views[location.kind as keyof typeof views];
  if (!view) throw new Error(`No view registered for page kind: ${location.kind}`);
  return view as PageKindView;
}
