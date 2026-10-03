/**
 * The one stylesheet the slip print path owns. Geometry lives in inline
 * millimetre styles; this block carries only what a stylesheet must.
 *
 * Note for editors: the CSS below sits inside a template literal, so its
 * comments must not contain backticks.
 */
import { buildPageCss, type ResolvedProfile } from "~/lib/label-stock";

export function SlipPrintStyles({ profile }: { profile: ResolvedProfile }) {
  return (
    <style>{`
      /* The printable sheet is not part of the screen layout - the rail renders
         its own scaled copy of one page.

         It is parked off-screen, NOT display:none, and that is the difference
         from the label sheet. AutoFitText shrinks a long address by measuring
         its box in a layout effect; under display:none the box measures zero,
         nothing shrinks, and the effect does not run again at print time - so
         the address would print clipped. Off-screen it is still laid out at
         real millimetres, and the fitted size is the one that prints.

         Scoped to @media screen so none of it reaches the printer, where the
         whitelist below takes over. */
      @media screen {
        .slip-sheet {
          position: fixed;
          top: 0;
          left: -200vw;
          visibility: hidden;
          pointer-events: none;
        }
      }

      @media print {
        ${buildPageCss(profile)}
        body { background: white !important; }

        /* Whitelist, not blacklist - hiding only .no-print assumes every stray
           node carries the tag, so portals and browser-extension-injected nodes
           would still print. visibility (not display) because it is
           overridable on descendants, so the sheet re-shows while its
           ancestors stay hidden, and because it leaves the page-break boxes
           intact. */
        body * { visibility: hidden !important; }
        .slip-sheet, .slip-sheet * { visibility: visible !important; }

        /* The editor must occupy NO space; visibility alone would leave its
           box in the flow and emit a blank leading page. */
        .no-print { display: none !important; }

        .label-page { box-shadow: none !important; margin: 0 !important; }
      }

      /* The header band and care tiles are solid dark fills; without this
         browsers drop backgrounds when printing and they come out blank. */
      .slip-cell { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    `}</style>
  );
}
