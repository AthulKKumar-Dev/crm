import { SetMetadata } from '@nestjs/common';
import type { SectionKey } from '../permissions';

export const REQUIRE_SECTION_KEY = 'requireSection';

type SectionName = SectionKey extends `section.${infer S}` ? S : never;

/**
 * Tie a controller (or one handler) to an app section. `SectionAccessGuard`
 * lets the request through when the member may open ANY of the listed
 * sections — list several on a read that another section's screen depends on
 * (the order form's product picker, a customer's order history).
 *
 * A handler-level decorator replaces the class-level one. Call it with no
 * arguments to lift the requirement for shared reference data.
 */
export const RequireSection = (...sections: SectionName[]) =>
  SetMetadata(
    REQUIRE_SECTION_KEY,
    sections.map((s) => `section.${s}` as SectionKey),
  );
