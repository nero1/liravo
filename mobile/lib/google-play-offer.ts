interface OfferProduct {
  productId: string;
  subscriptionOfferDetails?: {
    offerId: string | null;
    offerToken: string;
    pricingPhases: { pricingPhaseList: {billingPeriod:string;formattedPrice:string}[] };
  }[];
}

export function monthlyGooglePlayOffer(product: OfferProduct | undefined, sku: string) {
  if (product?.productId !== sku) return null;
  for (const offer of product.subscriptionOfferDetails ?? []) {
    const phases=offer.pricingPhases.pricingPhaseList;
    const recurring=phases[phases.length-1];
    if (!offer.offerId && offer.offerToken && recurring?.billingPeriod==='P1M' && recurring.formattedPrice) return {sku,offerToken:offer.offerToken,formattedPrice:recurring.formattedPrice};
  }
  return null;
}
