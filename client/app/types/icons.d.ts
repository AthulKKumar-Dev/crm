/**
 * The SVG icon components under `app/assests/icon/` are plain .jsx files, so
 * every import of them was an implicit `any` (TS7016) reported as an error.
 *
 * They are declared `any` rather than given a real signature on purpose: call
 * sites pass different prop shapes (`fill` in the auth illustration, a
 * `LucideIcon`-compatible slot in EmptyState, width/height in OrdersTable), and
 * a single concrete type would break some of them. This makes the existing
 * looseness explicit instead of erroring on it. Convert the icons to .tsx if
 * real types are wanted.
 */
declare module "~/assests/icon/*" {
  const Icon: any;
  export default Icon;
}
