import { definePageKind } from "./types";

export type LauncherLocation = { kind: "launcher" };

export const launcherKind = definePageKind<"launcher", LauncherLocation>({
  kind: "launcher",
  title: () => "New tab",
  description: "Open a new tab",
  serialize: () => null,
});
