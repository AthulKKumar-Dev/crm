import { IsArray, IsIn, IsString } from 'class-validator';

/**
 * The sets to mark ENABLED, per direction.
 *
 * This is the merchant's full intent for the channel, not a delta: anything
 * omitted from a direction is switched off. Sending the whole picture keeps the
 * client honest about what it is turning off — a partial payload would make
 * "orders only" and "add orders" indistinguishable.
 */
export class UpdateSyncSettingsDto {
    /// Must stay in step with PULL_ENTITY_TYPES in shopify-sync.service.ts and
    /// with TriggerSyncDto — `runSync` intersects the job's entity list with
    /// whatever is enabled here.
    @IsArray()
    @IsString({ each: true })
    @IsIn(['locations', 'products', 'orders', 'customers', 'inventory', 'collections'], {
        each: true,
    })
    pull: string[];

    /// Mirrors PUSH_ENTITY_TYPES. `orders` is the consequential one: enabling it
    /// lets the next successful sync create REAL Shopify orders from every
    /// unsynced manual order, and a Shopify order cannot be un-created.
    @IsArray()
    @IsString({ each: true })
    @IsIn(['products', 'orders', 'drafts'], { each: true })
    push: string[];
}
