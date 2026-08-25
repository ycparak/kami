import { blockQuoteExtension } from "../blockQuote";
import { dashExtension } from "./dashes";
import { emojiExtension } from "./emoji";
import { horizonalRuleExtension } from "./horizontalRule";
import { imageExtension } from "./image";

export { foldExtension, foldableSyntaxFacet, selectAllDecorationsOnSelectExtension } from "./core";
export { emojiExtension, emojiMarkdownSyntaxExtension } from "./emoji";
export { dashMarkdownSyntaxExtension, dashExtension } from "./dashes";
export { horizonalRuleExtension } from "./horizontalRule";
export { imageExtension } from "./image";
export { blockQuoteExtension } from "../blockQuote";

export const defaultFoldableSyntaxExtensions = [
  blockQuoteExtension,
  imageExtension,
  emojiExtension,
  horizonalRuleExtension,
  dashExtension,
];
