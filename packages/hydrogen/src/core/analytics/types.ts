import type { ShopifyScriptsShop } from "../shopify-scripts/types";
import type { AnalyticsEventName } from "./events";

// --- Shop Analytics ---

type ShopAnalyticsBase = Pick<ShopifyScriptsShop, "shopId">;

/** Discriminant for the analytics channel a storefront is running under. */
export type ShopAnalyticsChannel = "hydrogen" | "headless";

/**
 * Identifies the shop and channel for every analytics payload.
 *
 * The `"hydrogen"` variant requires a `storefrontId` from the Hydrogen sales
 * channel; the `"headless"` variant omits it because headless storefronts have
 * no channel-level identifier.
 */
export type ShopAnalytics =
  | (ShopAnalyticsBase & {
      /** The storefront is served by the Hydrogen sales channel. */
      channel: "hydrogen";
      /** Identifier assigned by the Hydrogen sales channel. */
      storefrontId: ShopifyScriptsShop["storefrontId"];
    })
  | (ShopAnalyticsBase & {
      /** The storefront is a custom headless build without a Hydrogen channel. */
      channel: "headless";
      storefrontId?: never;
    });

// --- Consent ---

/**
 * Controls how the analytics bus interacts with the Shopify privacy consent banner.
 *
 * When `mode` is `"default-banner"`, the bus waits for the shopper to interact
 * with Shopify's built-in GDPR banner before replaying buffered events to
 * destinations. `"custom-banner"` treats the first `setTrackingConsent` call as
 * actionable consent. `"no-banner"` skips the banner-interaction wait — destinations still gate on consent API signals.
 */
export type ConsentConfig = {
  /** @defaultValue `undefined` — equivalent to `"no-banner"` and `"custom-banner"` (neither waits for the default banner). */
  mode?: "default-banner" | "custom-banner" | "no-banner";
};

// --- Cart types (lightweight, no dependency on hydrogen's CartReturn) ---

/**
 * Lightweight cart line shape for analytics payloads.
 *
 * Mirrors the Storefront API `CartLine` fields needed for tracking without
 * depending on Hydrogen's full `CartReturn` type, so the analytics bus stays
 * framework-agnostic.
 */
export type AnalyticsCartLine = {
  id: string;
  quantity: number;
  merchandise: {
    id: string;
    /** Variant title, or the product title when no variant title exists. */
    title: string;
    price: { amount: string; currencyCode?: string };
    sku?: string | null;
    product: {
      id: string;
      title: string;
      vendor: string;
      productType?: string;
      handle?: string;
    };
  };
};

/**
 * Lightweight cart snapshot included in cart analytics payloads.
 *
 * Accepts both `nodes` and `edges` connection shapes so the analytics layer
 * works regardless of which Storefront API query pattern the storefront uses.
 */
export type AnalyticsCart = {
  id: string;
  /** ISO 8601 timestamp of the last cart mutation — used to deduplicate events. */
  updatedAt: string;
  cost?: {
    subtotalAmount?: { currencyCode?: string };
    totalAmount?: { currencyCode?: string };
  };
  /** Cart lines in Storefront API connection format. */
  lines: {
    nodes?: AnalyticsCartLine[];
    edges?: Array<{ node: AnalyticsCartLine }>;
  };
  [key: string]: unknown;
};

// --- Base Payloads ---

/** Open-ended bag for additional data merged into analytics payloads. */
export type OtherData = {
  [key: string]: unknown;
};

type BasePayload = {
  shop?: ShopAnalytics | null;
  customData?: Record<string, unknown>;
};

type UrlPayload = {
  url?: string;
};

/** Describes a single product for `product_viewed` payloads. */
export type ProductPayload = {
  id: string;
  title: string;
  /** Decimal amount string for the selected variant (e.g. `"19.99"`). */
  price: string;
  vendor: string;
  variantId: string;
  variantTitle: string;
  quantity: number;
  sku?: string | null;
  productType?: string;
};

type ProductsPayload = {
  products: Array<ProductPayload & OtherData>;
};

type CollectionPayload = {
  collection: { id: string; handle: string };
};

type SearchPayload = {
  searchTerm: string;
  searchResults?: unknown;
};

type CartPayload = {
  cart: AnalyticsCart | null;
};

type CartChangePayload = CartPayload & {
  prevCart: AnalyticsCart | null;
};

type CartLinePayload = {
  prevLine?: AnalyticsCartLine;
  currentLine?: AnalyticsCartLine;
};

// --- Event Payloads ---

/** Payload for `page_viewed` events. */
export type PageViewPayload = UrlPayload & BasePayload;
/** Payload for `product_viewed` events. */
export type ProductViewPayload = ProductsPayload & UrlPayload & BasePayload;
/** Payload for `collection_viewed` events. */
export type CollectionViewPayload = CollectionPayload & UrlPayload & BasePayload;
/** Payload for `cart_viewed` events. */
export type CartViewPayload = CartPayload & UrlPayload & BasePayload;
/** Payload for `search_viewed` events. */
export type SearchViewPayload = SearchPayload & UrlPayload & BasePayload;
/** Payload for `cart_updated` events — includes both previous and current cart snapshots. */
export type CartUpdatePayload = CartChangePayload & BasePayload & OtherData;
/** Payload for `product_added_to_cart` and `product_removed_from_cart` events. */
export type CartLineUpdatePayload = CartLinePayload & CartChangePayload & BasePayload & OtherData;

/** Union of all analytics event payload types. */
export type EventPayloads =
  | PageViewPayload
  | ProductViewPayload
  | CollectionViewPayload
  | CartViewPayload
  | SearchViewPayload
  | CartUpdatePayload
  | CartLineUpdatePayload;

// --- Type-safe event mapping ---

/**
 * Maps each analytics event name to its payload type.
 *
 * TypeScript uses this to infer the correct payload when you call
 * `publish()` or `subscribe()` with a specific event constant.
 */
export interface AnalyticsEventMap {
  page_viewed: PageViewPayload;
  product_viewed: ProductViewPayload;
  collection_viewed: CollectionViewPayload;
  cart_viewed: CartViewPayload;
  search_viewed: SearchViewPayload;
  cart_updated: CartUpdatePayload;
  product_added_to_cart: CartLineUpdatePayload;
  product_removed_from_cart: CartLineUpdatePayload;
}

/** Resolves the payload type for a supported analytics event name. */
export type PayloadFor<E extends AnalyticsEventName> = AnalyticsEventMap[E];

export type PublishPayloadArgs<E extends AnalyticsEventName> =
  {} extends PayloadFor<E> ? [payload?: PayloadFor<E>] : [payload: PayloadFor<E>];

// --- Bus Types ---

/** Configuration passed to `setupStorefrontAnalytics` to initialize the bus. */
export type StorefrontAnalyticsConfig = {
  /** Shop identity and channel for analytics payloads. */
  shop: ShopAnalytics | null;
  /** Consent banner mode that controls when buffered events replay to destinations. */
  consent: ConsentConfig;
  /** Extra key-value pairs accessible to destinations via `getConfig().customData`. */
  customData?: Record<string, unknown>;
};

/**
 * Session tokens provided by Shopify's consent API for analytics correlation.
 *
 * Both values are empty strings when analytics tracking is not currently
 * allowed or the consent API has not loaded yet.
 */
export type AnalyticsTrackingValues = {
  /** Persistent identifier for the shopper across visits. */
  uniqueToken: string;
  /** Identifier scoped to the current browsing session. */
  visitToken: string;
};

/** Context provided to destination callbacks alongside each event payload. */
export type StorefrontAnalyticsDestinationEventContext = {
  /**
   * Reads current tokens from the consent API. Returns empty strings when tokens are
   * unavailable or analytics tracking is not currently allowed.
   */
  getTrackingValues: () => AnalyticsTrackingValues;
};

/** Context passed into a destination's `setup()` function. */
export type StorefrontAnalyticsDestinationSetupContext = {
  /** Subscribe to an analytics event. Returns an unsubscribe function. */
  subscribe: <E extends AnalyticsEventName>(
    event: E,
    callback: (payload: PayloadFor<E>, context: StorefrontAnalyticsDestinationEventContext) => void,
  ) => () => void;
  /** Returns the current analytics bus configuration. */
  getConfig: () => StorefrontAnalyticsConfig;
};

/**
 * A consent-gated analytics integration that receives events after consent is granted.
 *
 * Destinations subscribe to events during `setup()` and receive live delivery
 * plus replayed buffered events once tracking is allowed. Return a cleanup
 * function from `setup()` to tear down side effects when the destination is removed.
 */
export type StorefrontAnalyticsDestination = {
  /** Unique name for this destination — duplicates are rejected with a warning. */
  name: string;
  /**
   * Called once when the destination is added. Subscribe to events via the
   * provided context. May be async — buffered events replay after resolution.
   */
  setup: (
    context: StorefrontAnalyticsDestinationSetupContext,
  ) => void | (() => void) | Promise<void | (() => void)>;
};

/**
 * The framework-agnostic analytics event bus returned by `setupStorefrontAnalytics`.
 *
 * Storefronts publish events (page views, product views, cart changes) via
 * `publish()`. Consent-gated tracking integrations register through
 * `addDestination()` and receive buffered events once consent is granted.
 * Direct listeners via `subscribe()` receive events immediately without
 * consent gating.
 */
export type StorefrontAnalytics = {
  /** Emit an analytics event to all subscribers and buffer it for destinations. */
  publish: <E extends AnalyticsEventName>(event: E, ...payload: PublishPayloadArgs<E>) => void;
  /** Listen for live analytics events. Destination integrations should use `addDestination()`. */
  subscribe: <E extends AnalyticsEventName>(
    event: E,
    callback: (payload: PayloadFor<E>) => void,
  ) => () => void;
  /** Register a consent-gated destination integration. Returns a removal function. */
  addDestination: (destination: StorefrontAnalyticsDestination) => () => void;
  /** Tears down the bus, removes all subscribers, and cleans up global references. */
  destroy: () => void;
  /** Returns the current bus configuration (shop, consent, customData). */
  getConfig: () => StorefrontAnalyticsConfig;
};
