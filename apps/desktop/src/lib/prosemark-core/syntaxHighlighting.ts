import { EditorView } from "@codemirror/view";
import { styleTags, Tag, tags } from "@lezer/highlight";
import { markdownTags } from "./markdown/tags";
import { mathDelimiterTag, mathFormulaTag } from "./markdown/mathMarkdown";
import { HighlightStyle, syntaxHighlighting, type TagStyle } from "@codemirror/language";
import type { MarkdownConfig } from "@lezer/markdown";

const fallbackMonospaceCodeFont =
  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";
const codeFontFamily = `var(--pm-code-font, ${fallbackMonospaceCodeFont})`;
const editorFontSize = "var(--kami-editor-font-size, 16px)";

export const additionalMarkdownSyntaxTags: MarkdownConfig = {
  defineNodes: [],
  props: [
    styleTags({
      HeaderMark: markdownTags.headerMark,
      FencedCode: markdownTags.fencedCode,
      URL: markdownTags.linkURL,
      ListMark: markdownTags.listMark,
    }),
  ],
};

const headingTagStyles = (fontSizes: (string | null)[]): TagStyle[] =>
  fontSizes.map((fontSize, i) => ({
    tag: tags[`heading${(i + 1).toString()}` as keyof typeof tags] as Tag,
    fontSize,
    fontWeight: "bold",
  }));

export const baseSyntaxHighlights = syntaxHighlighting(
  HighlightStyle.define([
    ...headingTagStyles(["1.6em", "1.4em", "1.2em", null, null, null]),
    {
      tag: markdownTags.headerMark,
      color: "var(--pm-header-mark-color)",
      opacity: "0.4",
    },
    {
      tag: tags.strong,
      fontWeight: "bold",
    },
    {
      tag: tags.emphasis,
      fontStyle: "italic",
    },
    {
      tag: tags.strikethrough,
      textDecoration: "line-through",
    },
    {
      tag: tags.meta,
      color: "var(--pm-muted-color)",
    },
    {
      tag: tags.comment,
      color: "var(--pm-muted-color)",
    },
    {
      tag: markdownTags.listMark,
      color: "var(--pm-muted-color)",
      paddingLeft: "1ch",
    },
    {
      tag: markdownTags.escapeMark,
      color: "var(--pm-muted-color)",
    },
    {
      tag: markdownTags.linkURL,
      color: "var(--pm-link-color)",
      textDecoration: "underline",
      cursor: "pointer",
    },
    {
      tag: mathDelimiterTag,
      color: "var(--pm-muted-color)",
    },
    {
      tag: mathFormulaTag,
      fontFamily: codeFontFamily,
      fontSize: editorFontSize,
    },
  ]),
);

const baseThemeSpec = {
  ".cm-content": {
    fontFamily: "var(--font)",
    fontSize: "0.9rem",
    caretColor: "var(--pm-cursor-color)",
  },
  ".cm-editor .cm-cursor, .cm-editor .cm-dropCursor": {
    borderLeftColor: "var(--pm-cursor-color)",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    border: "none",
  },
  ".cm-rendered-link": {
    textDecoration: "underline",
    cursor: "pointer",
    color: "var(--pm-link-color)",
  },
  ".cm-list-prefix": {
    display: "inline-block",
    position: "relative",
    boxSizing: "border-box",
    whiteSpace: "pre",
    textAlign: "right",
    color: "transparent",
    textIndent: "0",
  },
  ".cm-list-prefix::before": {
    position: "absolute",
    insetInlineStart: "var(--cm-list-marker-offset)",
    top: "0",
    width: "var(--cm-list-marker-width)",
    lineHeight: "inherit",
    color: "var(--pm-muted-color)",
    textAlign: "center",
  },
  ".cm-list-prefix-bullet::before": {
    content: '"•"',
    textAlign: "center",
  },
  ".cm-list-prefix-bullet span, .cm-list-prefix-task span": {
    color: "transparent",
  },
  ".cm-list-prefix span:not(.cm-list-indent-visual)": {
    display: "inline-block",
    width: "var(--cm-list-marker-width)",
    position: "absolute",
    right: "0",
    paddingLeft: "0",
    textAlign: "left",
  },
  ".cm-list-indent-visual": {
    display: "inline-block",
    boxSizing: "border-box",
    whiteSpace: "pre",
    color: "transparent",
    textAlign: "left",
    textIndent: "0",
  },
  ".cm-list-ordered-marker": {
    display: "inline-block",
    textAlign: "center",
    textIndent: "0",
  },
  ".cm-blockquote-line": {
    position: "relative",
    "&:before": {
      content: '""',
      display: "block",
      borderLeft: "solid 0.3em var(--pm-blockquote-vertical-line-background-color)",
      position: "absolute",
      top: "0px",
      bottom: "0px",
      insetInlineStart: "6px",
      zIndex: -10,
    },
  },
  ".cm-nested-blockquote-border": {
    display: "block",
    borderLeft: "solid 0.3em var(--pm-blockquote-vertical-line-background-color)",
    position: "absolute",
    top: "0px",
    bottom: "0px",
    insetInlineStart: "calc(6px + var(--blockquote-border-offset))",
    zIndex: -10,
  },
  ".cm-image-block": {
    paddingLeft: "6px",
  },
  ".cm-image img": {
    maxWidth: "100%",
  },
  ".cm-inline-code": {
    fontFamily: codeFontFamily,
    fontVariantLigatures: "none",
    fontFeatureSettings: '"calt" 0',
    fontKerning: "none",
    padding: "0.2rem",
    borderRadius: "0.4rem",
    fontSize: editorFontSize,
    backgroundColor: "var(--pm-code-background-color)",
  },
};

export const baseTheme = EditorView.theme(baseThemeSpec);

export const __testSyntaxHighlighting = {
  baseThemeSpec,
};

export const generalSyntaxHighlights = syntaxHighlighting(
  HighlightStyle.define([
    {
      tag: tags.link,
      color: "var(--pm-syntax-link)",
    },
    {
      tag: tags.keyword,
      color: "var(--pm-syntax-keyword)",
    },
    {
      tag: [tags.atom, tags.bool, tags.url, tags.contentSeparator, tags.labelName],
      color: "var(--pm-syntax-atom)",
    },
    {
      tag: [tags.literal, tags.inserted],
      color: "var(--pm-syntax-literal)",
    },
    {
      tag: [tags.string, tags.deleted],
      color: "var(--pm-syntax-string)",
    },
    {
      tag: [tags.regexp, tags.escape, tags.special(tags.string)],
      color: "var(--pm-syntax-regexp)",
    },
    {
      tag: tags.definition(tags.variableName),
      color: "var(--pm-syntax-definition-variable)",
    },
    {
      tag: tags.local(tags.variableName),
      color: "var(--pm-syntax-local-variable)",
    },
    {
      tag: [tags.typeName, tags.namespace],
      color: "var(--pm-syntax-type-namespace)",
    },
    {
      tag: tags.className,
      color: "var(--pm-syntax-class-name)",
    },
    {
      tag: [tags.special(tags.variableName), tags.macroName],
      color: "var(--pm-syntax-special-variable-macro)",
    },
    {
      tag: tags.definition(tags.propertyName),
      color: "var(--pm-syntax-definition-property)",
    },
    {
      tag: tags.comment,
      color: "var(--pm-syntax-comment)",
    },
    {
      tag: tags.invalid,
      color: "var(--pm-syntax-invalid)",
    },
  ]),
);
