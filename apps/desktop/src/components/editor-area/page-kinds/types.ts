import type { ComponentType, ReactNode } from "react";

export interface SerializedLocation {
  kind: string;
  [key: string]: unknown;
}

export interface PageKindInput<K extends string, L extends { kind: K }> {
  kind: K;
  title: (location: L) => string;
  description: string;

  keepAlive?: boolean;
  supportsFileContextMenu?: boolean;
  fromPayload?: (data: SerializedLocation) => L | null;
  paths?: (location: L) => string[];
  primaryPath?: (location: L) => string | null;
  rewritePath?: (location: L, from: string, to: string) => L | null;
  removePath?: (location: L, path: string) => L | null;
  serialize?: (location: L) => object | null;
}

export interface PageKind<K extends string = string, L extends { kind: K } = { kind: K }> {
  kind: K;
  title: (location: L) => string;
  description: string;
  keepAlive: boolean;
  supportsFileContextMenu: boolean;
  fromPayload: (data: SerializedLocation) => L | null;
  paths: (location: L) => string[];
  primaryPath: (location: L) => string | null;
  rewritePath: (location: L, from: string, to: string) => L | null;
  removePath: (location: L, path: string) => L | null;
  serialize: (location: L) => object | null;
}

export type AnyPageKind = PageKind<string, { kind: string }>;

export interface PageKindView<L extends { kind: string } = { kind: string }> {
  Component: ComponentType<{ location: L; isActive: boolean; tabId: string }>;
  renderFooter?: (location: L) => ReactNode;
}

export function definePageKind<K extends string, L extends { kind: K }>(
  input: PageKindInput<K, L>,
): PageKind<K, L> {
  return {
    keepAlive: false,
    supportsFileContextMenu: false,
    fromPayload: () => ({ kind: input.kind }) as L,
    paths: () => [],
    primaryPath: () => null,
    rewritePath: (l) => l,
    removePath: (l) => l,
    serialize: () => ({}),
    ...input,
  };
}
