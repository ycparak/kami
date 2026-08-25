import { describe, expect, test } from "vite-plus/test";
import {
  canMoveInto,
  computeMovePath,
  resolveDropDir,
  resolveDropRange,
} from "../src/components/sidebar/tree-move";
import type { DirEntry } from "../src/types/fs";

const ROOT = "/vault";

function entry(path: string, is_dir: boolean): DirEntry {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return { name, path, is_dir, is_markdown: !is_dir, modified_at: 0, title: null };
}

describe("resolveDropDir", () => {
  test("a folder target resolves to itself", () => {
    expect(resolveDropDir(entry("/vault/notes", true), ROOT)).toBe("/vault/notes");
  });

  test("a file target resolves to its parent folder", () => {
    expect(resolveDropDir(entry("/vault/notes/todo.md", false), ROOT)).toBe("/vault/notes");
  });

  test("no target resolves to the workspace root", () => {
    expect(resolveDropDir(null, ROOT)).toBe(ROOT);
  });
});

describe("canMoveInto", () => {
  test("rejects moving an item into the folder it already lives in", () => {
    expect(canMoveInto("/vault/a.md", false, "/vault")).toBe(false);
    expect(canMoveInto("/vault/notes/a.md", false, "/vault/notes")).toBe(false);
  });

  test("allows moving a file into a different folder", () => {
    expect(canMoveInto("/vault/a.md", false, "/vault/notes")).toBe(true);
  });

  test("rejects dropping a folder onto itself", () => {
    expect(canMoveInto("/vault/notes", true, "/vault/notes")).toBe(false);
  });

  test("rejects dropping a folder into one of its descendants", () => {
    expect(canMoveInto("/vault/notes", true, "/vault/notes/sub")).toBe(false);
    expect(canMoveInto("/vault/notes", true, "/vault/notes/sub/deep")).toBe(false);
  });

  test("allows moving a folder into an unrelated folder", () => {
    expect(canMoveInto("/vault/notes", true, "/vault/archive")).toBe(true);
  });

  test("does not treat a sibling with a shared name prefix as a descendant", () => {
    expect(canMoveInto("/vault/notes", true, "/vault/notes-2")).toBe(true);
  });
});

describe("computeMovePath", () => {
  test("joins the destination dir with the entry name", () => {
    expect(computeMovePath(entry("/vault/a.md", false), "/vault/notes")).toBe("/vault/notes/a.md");
    expect(computeMovePath(entry("/vault/notes", true), "/vault/archive")).toBe(
      "/vault/archive/notes",
    );
  });
});

describe("resolveDropRange", () => {
  const rows = [
    { path: "/vault/notes", depth: 0 },
    { path: "/vault/notes/todo.md", depth: 1 },
    { path: "/vault/notes/sub", depth: 1 },
    { path: "/vault/notes/sub/deep.md", depth: 2 },
    { path: "/vault/archive", depth: 0 },
    { path: "/vault/readme.md", depth: 0 },
  ];

  test("spans an expanded folder and all of its nested descendants", () => {
    expect(resolveDropRange(rows, "/vault/notes", ROOT)).toEqual({
      startPath: "/vault/notes",
      endPath: "/vault/notes/sub/deep.md",
    });
  });

  test("stops at the folder's own subtree (a nested folder)", () => {
    expect(resolveDropRange(rows, "/vault/notes/sub", ROOT)).toEqual({
      startPath: "/vault/notes/sub",
      endPath: "/vault/notes/sub/deep.md",
    });
  });

  test("a collapsed folder spans only itself", () => {
    expect(resolveDropRange(rows, "/vault/archive", ROOT)).toEqual({
      startPath: "/vault/archive",
      endPath: "/vault/archive",
    });
  });

  test("the root spans the whole tree", () => {
    expect(resolveDropRange(rows, ROOT, ROOT)).toEqual({
      startPath: "/vault/notes",
      endPath: "/vault/readme.md",
    });
  });

  test("returns null when the destination isn't visible or the tree is empty", () => {
    expect(resolveDropRange(rows, "/vault/missing", ROOT)).toBeNull();
    expect(resolveDropRange([], ROOT, ROOT)).toBeNull();
  });
});
