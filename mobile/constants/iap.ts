// Google Play subscription product IDs — must match exactly what you create
// in the Play Console under Monetize → Subscriptions.
export const PREMIUM_MONTHLY_SKU = 'liravo_premium_monthly';

export const SUBSCRIPTION_SKUS = [PREMIUM_MONTHLY_SKU] as const;
export type SubscriptionSku = typeof SUBSCRIPTION_SKUS[number];
