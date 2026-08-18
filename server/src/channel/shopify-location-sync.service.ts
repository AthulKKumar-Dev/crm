import { Injectable, Logger } from '@nestjs/common';
import { Prisma, StockBucket, SyncStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryLedgerService } from '../inventory/inventory-ledger.service';
import { ShopifyGraphqlClient } from './shopify-graphql.client';
import { ShopifyOAuthService } from './shopify-oauth.service';
import {
  LOCATIONS_QUERY,
  LocationsResponse,
  ShopifyLocationNode,
  VARIANT_INVENTORY_LEVELS_QUERY,
  VariantInventoryLevelsResponse,
} from './shopify-graphql.types';

/** Locations per page. Shops have tens, not thousands. */
const LOCATION_PAGE_SIZE = 50;

/**
 * Variants per page for the inventory pull. Deliberately below the 50 used by
 * the other syncs: each node drags in a nested inventoryLevels connection, so
 * 50 × 50 is a materially heavier query-cost point than 50 flat nodes and is
 * the shape most likely to hit Shopify's calculated-cost throttle.
 */
const VARIANT_PAGE_SIZE = 25;

/** Inventory levels per variant. A variant is stocked at ≤ this many locations. */
const LEVELS_PER_VARIANT = 50;

/**
 * Mirrors Shopify locations as CRM warehouses, and reconciles per-location
 * stock into each mapped warehouse's AVAILABLE bucket.
 *
 * Why this exists: every location-aware path in the app used to collapse the
 * shop's locations to a single cached primary id. Shopify's
 * `variant.inventoryQuantity` is the SUM across locations, so the split never
 * reached us; the `inventory_levels/update` webhook was handed a `location_id`
 * it never read and assigned one location's quantity as the variant's whole
 * stock, making the number flip to whichever location changed last.
 *
 * The mapping is `Warehouse.shopifyLocationId`, re-resolved on every run and
 * protected by a partial unique on (organization_id, shopify_location_id).
 *
 * Direction of truth (a locked product decision): **Shopify wins on pull.**
 * Per-location quantities overwrite the mapped warehouse's AVAILABLE, with a
 * ledger row per delta. CRM-origin adjustments still push back out.
 *
 * Warehousing-only: legacy orgs keep one number per variant and physically
 * cannot hold a per-location split, so nothing here runs for them.
 */
@Injectable()
export class ShopifyLocationSyncService {
  private readonly logger = new Logger(ShopifyLocationSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly graphql: ShopifyGraphqlClient,
    private readonly shopifyOAuth: ShopifyOAuthService,
    private readonly ledger: InventoryLedgerService,
  ) {}

  // ─────────────────────────── entry points ───────────────────────────

  /**
   * Both passes for an org, resolving the channel and token itself. This is
   * what the `sync-locations` queue job calls — the enable flow reaches us
   * through that queue rather than by injection, because InventoryModule must
   * not import ChannelModule (ChannelModule already imports it).
   *
   * A no-op, not an error, when the org has no Shopify channel or has not
   * enabled warehousing: both are ordinary states, and the job fires
   * unconditionally after every enable.
   */
  async runForOrganization(orgId: string): Promise<void> {
    if (!(await this.ledger.isWarehousingEnabled(orgId))) {
      this.logger.debug(`Location sync skipped: warehousing off for org ${orgId}`);
      return;
    }

    const channel = await this.prisma.channel.findFirst({
      where: { organizationId: orgId, platform: 'SHOPIFY' },
      select: { id: true, status: true },
    });
    if (!channel) {
      this.logger.debug(`Location sync skipped: org ${orgId} has no Shopify channel`);
      return;
    }

    const { token, shopDomain } = await this.shopifyOAuth.getAccessToken(channel.id);
    await this.syncLocations(channel.id, orgId, shopDomain, token);
    await this.pullLocationInventory(channel.id, orgId, shopDomain, token);
  }

  // ─────────────────────────── locations → warehouses ───────────────────────────

  /**
   * Create/refresh one warehouse per Shopify location.
   *
   * Deliberately conservative about existing rows: only `isActive` and the
   * default flag are ever written back. Names are authored once, on create —
   * an org that enabled warehousing before multi-location has a hand-named
   * "Main Warehouse" already mapped to the primary location, and silently
   * renaming it out from under them would be a surprise, not a sync.
   */
  async syncLocations(
    channelId: string,
    orgId: string,
    shopDomain: string,
    token: string,
  ): Promise<void> {
    const syncLog = await this.openSyncLog(channelId, orgId, 'locations');
    let processed = 0;

    try {
      const nodes = await this.fetchAllLocations(shopDomain, token);
      if (nodes.length === 0) {
        this.logger.warn(`Shop ${shopDomain} returned no locations`);
        await this.completeSyncLog(syncLog.id, 0, 0);
        return;
      }

      const existing = await this.prisma.warehouse.findMany({
        where: { organizationId: orgId },
        select: { id: true, code: true, shopifyLocationId: true, isDefault: true },
      });
      const byLocation = new Map(
        existing
          .filter((w) => w.shopifyLocationId)
          .map((w) => [w.shopifyLocationId as string, w]),
      );
      const usedCodes = new Set(existing.map((w) => w.code));

      // Resolve the intended default before writing anything: the demote and
      // the promote have to land in one transaction, and `update` refuses to
      // un-default the incumbent, so we drive both flags ourselves.
      const primary =
        nodes.find((n) => n.isPrimary && n.isActive) ??
        nodes.find((n) => n.isActive) ??
        nodes[0];
      const primaryLocationId = this.numericId(primary.id);

      const seenLocationIds = new Set<string>();

      for (const node of nodes) {
        const locationId = this.numericId(node.id);
        seenLocationIds.add(locationId);
        const match = byLocation.get(locationId);

        if (match) {
          await this.prisma.warehouse.update({
            where: { id: match.id },
            data: { isActive: node.isActive },
          });
        } else {
          const code = this.deriveCode(node.name, usedCodes);
          usedCodes.add(code);
          try {
            await this.prisma.warehouse.create({
              data: {
                organizationId: orgId,
                name: node.name,
                code,
                shopifyLocationId: locationId,
                isActive: node.isActive,
                // Default is settled in one pass below — creating with false
                // keeps the one-default partial unique satisfied throughout.
                isDefault: false,
              },
            });
          } catch (e) {
            // Lost a create race against the (org, shopify_location_id)
            // partial unique — a concurrent sync already mapped it. Same
            // recovery shape as InventoryLedgerService.ensureLevel.
            if (
              e instanceof Prisma.PrismaClientKnownRequestError &&
              e.code === 'P2002'
            ) {
              this.logger.debug(
                `Warehouse for location ${locationId} was created concurrently; adopting it.`,
              );
            } else {
              throw e;
            }
          }
        }
        processed++;
      }

      // A location that vanished from Shopify: deactivate, never delete —
      // stock_levels and inventory_events reference warehouses with
      // ON DELETE RESTRICT, and the ledger has to outlive the mapping.
      const stale = existing.filter(
        (w) => w.shopifyLocationId && !seenLocationIds.has(w.shopifyLocationId),
      );

      await this.settleDefaultAndDeactivate(orgId, primaryLocationId, stale.map((w) => w.id));

      // Order fulfillment still resolves a single location from here, and the
      // channel UI wants the count. Refreshing it also un-sticks the previous
      // behaviour, where this id was cached once and never revisited even if
      // the merchant changed their primary location.
      await this.refreshChannelMetadata(channelId, primaryLocationId, nodes.length);

      this.logger.log(
        `Locations synced for org ${orgId}: ${nodes.length} location(s), ${stale.length} deactivated`,
      );
      await this.completeSyncLog(syncLog.id, processed, 0);
    } catch (error) {
      await this.failSyncLog(syncLog.id, processed, 0, error);
      throw error;
    }
  }

  /**
   * Promote the primary location's warehouse to default and deactivate stale
   * ones, in a single transaction.
   *
   * Order matters and is the reason this is not two `WarehouseService.update`
   * calls: the incumbent default must be demoted before the new one is
   * promoted (one-default partial unique), and a stale warehouse that still
   * holds the default flag cannot be deactivated until it has been demoted.
   */
  private async settleDefaultAndDeactivate(
    orgId: string,
    primaryLocationId: string,
    staleWarehouseIds: string[],
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const target = await tx.warehouse.findFirst({
        where: { organizationId: orgId, shopifyLocationId: primaryLocationId },
        select: { id: true, isDefault: true },
      });

      if (target) {
        if (!target.isDefault) {
          await tx.warehouse.updateMany({
            where: { organizationId: orgId, isDefault: true },
            data: { isDefault: false },
          });
        }
        // `isActive: true` is re-asserted even when this warehouse was already
        // the default. The loop above mirrors each location's active state,
        // so a primary location deactivated in Shopify would otherwise leave
        // the org's default warehouse inactive — and WarehouseService.getDefault
        // requires isActive, so every adjustment would start throwing
        // "No default warehouse".
        await tx.warehouse.update({
          where: { id: target.id },
          data: { isDefault: true, isActive: true },
        });
      }

      if (staleWarehouseIds.length > 0) {
        // The `isDefault: false` guard is what stops the org being stranded
        // without a default. By this point the promote above has already
        // demoted the incumbent whenever a replacement exists, so a stale
        // warehouse still holding the flag means nothing replaced it — and
        // deactivating that one would leave WarehouseService.getDefault()
        // throwing on every adjustment.
        await tx.warehouse.updateMany({
          where: { id: { in: staleWarehouseIds }, isDefault: false },
          data: { isActive: false },
        });
      }
    });
  }

  private async refreshChannelMetadata(
    channelId: string,
    primaryLocationId: string,
    locationCount: number,
  ): Promise<void> {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { metadata: true },
    });
    const meta = (channel?.metadata as Prisma.JsonObject) ?? {};
    await this.prisma.channel.update({
      where: { id: channelId },
      data: {
        metadata: {
          ...meta,
          shopifyLocationId: Number(primaryLocationId),
          shopifyLocationCount: locationCount,
        } as Prisma.InputJsonObject,
      },
    });
  }

  private async fetchAllLocations(
    shopDomain: string,
    token: string,
  ): Promise<ShopifyLocationNode[]> {
    const auth = { shopDomain, accessToken: token };
    const all: ShopifyLocationNode[] = [];
    let cursor: string | null = null;

    do {
      const res: LocationsResponse = await this.graphql.request<LocationsResponse>(
        auth,
        LOCATIONS_QUERY,
        { first: LOCATION_PAGE_SIZE, after: cursor },
      );
      all.push(...(res.locations?.nodes ?? []));
      cursor = res.locations?.pageInfo?.hasNextPage
        ? res.locations.pageInfo.endCursor
        : null;
    } while (cursor);

    return all;
  }

  // ─────────────────────────── per-location stock ───────────────────────────

  /**
   * Reconcile every mapped warehouse's AVAILABLE bucket against Shopify's
   * per-location quantities.
   *
   * Idempotency is structural: each level is compared against what we already
   * hold and a zero delta writes nothing. That is also the echo suppression —
   * after a CRM push, Shopify's returning webhook carries the value we just
   * wrote, so the diff is zero and no ledger row appears. For the same reason
   * NO `idempotencyKey` is passed to applyMovement: a stable key would make
   * every run after the first a permanent no-op.
   */
  async pullLocationInventory(
    channelId: string,
    orgId: string,
    shopDomain: string,
    token: string,
  ): Promise<void> {
    // Deliberately NOT the 'inventory' entity type used by the legacy pull.
    // Both resume from a saved cursor, but they page different connections
    // (`products` there, `productVariants` here) — sharing the label would let
    // an org that switched to warehousing resume this query from a cursor
    // minted by the other one, which Shopify rejects outright.
    const syncLog = await this.openSyncLog(channelId, orgId, 'location-inventory');
    let processed = 0;
    let failed = 0;
    let unmappedLevels = 0;
    let truncatedVariants = 0;

    try {
      let warehouses = await this.loadMappedWarehouses(orgId);
      if (warehouses.length === 0) {
        // Nothing mapped yet — a sync triggered for `inventory` alone, or the
        // first run after enabling warehousing. Build the mapping rather than
        // making this a dead end, then re-read. syncLocations never calls
        // back into here, so there is no recursion.
        this.logger.log(
          `No Shopify-mapped warehouses for org ${orgId}; running the locations pass first.`,
        );
        await this.syncLocations(channelId, orgId, shopDomain, token);
        warehouses = await this.loadMappedWarehouses(orgId);
      }
      if (warehouses.length === 0) {
        this.logger.warn(
          `Org ${orgId} still has no Shopify-mapped warehouses; skipping the per-location reconcile.`,
        );
        await this.completeSyncLog(syncLog.id, 0, 0);
        return;
      }
      const warehouseByLocation = new Map(
        warehouses.map((w) => [w.shopifyLocationId as string, w.id]),
      );

      const auth = { shopDomain, accessToken: token };
      let cursor: string | null = syncLog.cursor ?? null;

      do {
        const res: VariantInventoryLevelsResponse =
          await this.graphql.request<VariantInventoryLevelsResponse>(
            auth,
            VARIANT_INVENTORY_LEVELS_QUERY,
            {
              first: VARIANT_PAGE_SIZE,
              after: cursor,
              levelsFirst: LEVELS_PER_VARIANT,
            },
          );

        // One lookup for the page rather than per variant: resolve our
        // variants by inventory item id (indexed), scoped to the org.
        const itemIds = res.productVariants.nodes
          .map((n) => n.inventoryItem?.id)
          .filter((id): id is string => !!id)
          .map((gid) => ShopifyGraphqlClient.extractId(gid));

        const ours = itemIds.length
          ? await this.prisma.productVariant.findMany({
              where: {
                inventoryItemId: { in: itemIds },
                product: { organizationId: orgId, deletedAt: null },
              },
              select: { id: true, inventoryItemId: true },
            })
          : [];
        const variantByItemId = new Map(
          ours.map((v) => [v.inventoryItemId as string, v.id]),
        );

        // Current buckets for the whole page, keyed variant:warehouse. A
        // missing row means zero — applyMovement creates it on demand.
        const currentAvailable = await this.loadAvailable(
          [...variantByItemId.values()],
        );

        for (const node of res.productVariants.nodes) {
          const itemGid = node.inventoryItem?.id;
          if (!itemGid) continue;
          const variantId = variantByItemId.get(
            ShopifyGraphqlClient.extractId(itemGid),
          );
          // Not a product we hold (unsynced, deleted, or another org's) —
          // the product sync owns creating it, not us.
          if (!variantId) continue;

          const levels = node.inventoryItem?.inventoryLevels;
          if (levels?.pageInfo?.hasNextPage) truncatedVariants++;

          for (const level of levels?.nodes ?? []) {
            const locationId = this.numericId(level.location.id);
            const warehouseId = warehouseByLocation.get(locationId);
            if (!warehouseId) {
              unmappedLevels++;
              continue;
            }

            const available = level.quantities.find(
              (q) => q.name === 'available',
            )?.quantity;
            if (typeof available !== 'number') continue;

            const current = currentAvailable.get(`${variantId}:${warehouseId}`) ?? 0;
            const delta = available - current;
            if (delta === 0) continue;

            try {
              await this.ledger.applyMovement({
                orgId,
                variantId,
                warehouseId,
                fromBucket: delta < 0 ? StockBucket.AVAILABLE : null,
                toBucket: delta > 0 ? StockBucket.AVAILABLE : null,
                quantity: Math.abs(delta),
                reason: 'sync',
                referenceType: 'shopify_location_sync',
                referenceId: locationId,
                // Shopify is authoritative here. Refusing a decrease that
                // would cross zero would leave the two systems permanently
                // out of step; oversold is surfaced as an alert instead.
                allowNegativeAvailable: true,
              });
              processed++;
            } catch (error) {
              failed++;
              this.logger.warn(
                `Failed to reconcile variant ${variantId} at location ${locationId}: ${error instanceof Error ? error.message : error}`,
              );
            }
          }
        }

        cursor = res.productVariants.pageInfo.hasNextPage
          ? res.productVariants.pageInfo.endCursor
          : null;
        // Persist the cursor so a crashed run resumes rather than re-walking
        // the catalogue — the same resume contract the other syncs use.
        await this.prisma.syncLog.update({
          where: { id: syncLog.id },
          data: { cursor },
        });
      } while (cursor);

      if (unmappedLevels > 0) {
        this.logger.warn(
          `${unmappedLevels} inventory level(s) sat at locations with no mapped warehouse for org ${orgId} — re-run the locations sync.`,
        );
      }
      if (truncatedVariants > 0) {
        this.logger.warn(
          `${truncatedVariants} variant(s) are stocked at more than ${LEVELS_PER_VARIANT} locations; the remainder was not read.`,
        );
      }
      this.logger.log(
        `Per-location inventory reconciled for org ${orgId}: ${processed} movement(s), ${failed} failed`,
      );
      await this.completeSyncLog(syncLog.id, processed, failed);
    } catch (error) {
      await this.failSyncLog(syncLog.id, processed, failed, error);
      throw error;
    }
  }

  /** Active warehouses carrying a Shopify location mapping. */
  private async loadMappedWarehouses(orgId: string) {
    return this.prisma.warehouse.findMany({
      where: {
        organizationId: orgId,
        shopifyLocationId: { not: null },
        isActive: true,
      },
      select: { id: true, shopifyLocationId: true },
    });
  }

  /** Warehouse-level AVAILABLE per variant, keyed `variantId:warehouseId`. */
  private async loadAvailable(variantIds: string[]): Promise<Map<string, number>> {
    if (variantIds.length === 0) return new Map();
    const rows = await this.prisma.stockLevel.findMany({
      where: { variantId: { in: variantIds }, locationId: null },
      select: { variantId: true, warehouseId: true, available: true },
    });
    return new Map(
      rows.map((r) => [`${r.variantId}:${r.warehouseId}`, r.available]),
    );
  }

  // ─────────────────────────── helpers ───────────────────────────

  /** `gid://shopify/Location/123` → `"123"`. Stored as text on Warehouse. */
  private numericId(gid: string): string {
    return ShopifyGraphqlClient.extractId(gid);
  }

  /**
   * A scanner-safe warehouse code from a location name, unique within the org.
   * "Kochi Store" → "KOCHIS"; on collision "KOCHIS2", "KOCHIS3"…
   *
   * Must satisfy CreateWarehouseDto's ^[A-Z0-9]{1,8}$ so a code minted here is
   * still valid if a merchant later edits that warehouse through the API.
   */
  private deriveCode(name: string, used: Set<string>): string {
    const base = name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'WH';
    if (!used.has(base)) return base;
    for (let n = 2; n < 1000; n++) {
      const suffix = String(n);
      const candidate = base.slice(0, 8 - suffix.length) + suffix;
      if (!used.has(candidate)) return candidate;
    }
    // 999 warehouses sharing a six-character stem is not a real shop, but a
    // silent duplicate would trip the (org, code) unique — fail loudly.
    throw new Error(`Could not derive a unique warehouse code from "${name}"`);
  }

  // Sync-log lifecycle. Intentionally thinner than ShopifySyncService's
  // (whose helpers are private to it): the location pass is a handful of rows,
  // and the inventory pass is a diff-based reconcile, so an abandoned run is
  // safe to restart from its cursor or from scratch.
  private async openSyncLog(channelId: string, orgId: string, entityType: string) {
    const resumable = await this.prisma.syncLog.findFirst({
      where: {
        channelId,
        entityType,
        status: SyncStatus.IN_PROGRESS,
        cursor: { not: null },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (resumable) return resumable;

    return this.prisma.syncLog.create({
      data: {
        organizationId: orgId,
        channelId,
        entityType,
        status: SyncStatus.IN_PROGRESS,
        startedAt: new Date(),
      },
    });
  }

  private async completeSyncLog(logId: string, processed: number, failed: number) {
    await this.prisma.syncLog.update({
      where: { id: logId },
      data: {
        status: SyncStatus.COMPLETED,
        recordsProcessed: processed,
        recordsFailed: failed,
        cursor: null,
        completedAt: new Date(),
      },
    });
  }

  private async failSyncLog(
    logId: string,
    processed: number,
    failed: number,
    error: unknown,
  ) {
    await this.prisma.syncLog.update({
      where: { id: logId },
      data: {
        status: SyncStatus.FAILED,
        recordsProcessed: processed,
        recordsFailed: failed,
        errorMessage: error instanceof Error ? error.message : String(error),
        completedAt: new Date(),
      },
    });
  }
}
