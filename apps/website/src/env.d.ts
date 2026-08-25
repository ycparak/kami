declare const __KAMI_VERSION__: string;
declare const __KAMI_DMG_URL__: string;
declare const __KAMI_RELEASES_URL__: string;
declare const __KAMI_REPO_URL__: string;

declare module "*.css";
declare module "*.css?url" {
  const href: string;
  export default href;
}
