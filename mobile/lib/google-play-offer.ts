interface OfferProduct {
  id: string;
  subscriptionOffers?: {
    id: string;
    basePlanIdAndroid?: string | null;
    offerTokenAndroid?: string | null;
    installmentPlanDetailsAndroid?: unknown;
    pricingPhasesAndroid?: {pricingPhaseList: {billingPeriod:string;formattedPrice:string;recurrenceMode:number}[]} | null;
  }[] | null;
}

export function monthlyGooglePlayOffer(product: OfferProduct | undefined, sku: string) {
  if (product?.id !== sku) return null;
  for (const offer of product.subscriptionOffers ?? []) {
    const phases=offer.pricingPhasesAndroid?.pricingPhaseList ?? [],recurring=phases[0];
    if (offer.id===offer.basePlanIdAndroid && !offer.installmentPlanDetailsAndroid && phases.length===1 && offer.offerTokenAndroid && recurring?.recurrenceMode===1 && recurring.billingPeriod==='P1M' && recurring.formattedPrice) return {sku,offerToken:offer.offerTokenAndroid,formattedPrice:recurring.formattedPrice};
  }
  return null;
}
