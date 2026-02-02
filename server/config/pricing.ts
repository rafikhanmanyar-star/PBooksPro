// Pricing configuration for license renewals
// Supports multiple tiers and currencies

export interface LicensePricing {
  monthly: {
    PKR: number;
    USD: number;
  };
  yearly: {
    PKR: number;
    USD: number;
  };
}

export interface PricingTier {
  name: string;
  pricing: LicensePricing;
}

// Pricing tiers based on subscription tier
export const PRICING_TIERS: Record<string, PricingTier> = {
  free: {
    name: 'Starter',
    pricing: {
      monthly: {
        PKR: 85000 / 12, // ~7,083 PKR/month (annual / 12)
        USD: 293 / 12 // ~24 USD/month
      },
      yearly: {
        PKR: 85000,
        USD: 293
      }
    }
  },
  professional: {
    name: 'Professional',
    pricing: {
      monthly: {
        PKR: 165000 / 12, // ~13,750 PKR/month
        USD: 569 / 12 // ~47 USD/month
      },
      yearly: {
        PKR: 165000,
        USD: 569
      }
    }
  },
  enterprise: {
    name: 'Enterprise',
    pricing: {
      monthly: {
        PKR: 275000 / 12, // ~22,917 PKR/month
        USD: 948 / 12 // ~79 USD/month
      },
      yearly: {
        PKR: 275000,
        USD: 948
      }
    }
  }
};

// Module-specific pricing (Add-ons)
export const MODULE_PRICING: Record<string, LicensePricing> = {
  real_estate: {
    monthly: { PKR: 5000, USD: 18 },
    yearly: { PKR: 50000, USD: 180 }
  },
  rental: {
    monthly: { PKR: 3000, USD: 11 },
    yearly: { PKR: 30000, USD: 110 }
  },
  tasks: {
    monthly: { PKR: 2000, USD: 7 },
    yearly: { PKR: 20000, USD: 70 }
  },
  biz_planet: {
    monthly: { PKR: 2000, USD: 7 },
    yearly: { PKR: 20000, USD: 70 }
  },
  shop: {
    monthly: { PKR: 4000, USD: 14 },
    yearly: { PKR: 40000, USD: 140 }
  }
};

// Get pricing for a license type and currency
export function getPricing(
  subscriptionTier: string = 'free',
  licenseType: 'monthly' | 'yearly',
  currency: 'PKR' | 'USD' = 'PKR',
  moduleKey?: string
): number {
  if (moduleKey && MODULE_PRICING[moduleKey]) {
    return MODULE_PRICING[moduleKey][licenseType][currency];
  }
  const tier = PRICING_TIERS[subscriptionTier] || PRICING_TIERS.free;
  return tier.pricing[licenseType][currency];
}

// Get duration in months for license type
export function getLicenseDurationMonths(licenseType: 'monthly' | 'yearly'): number {
  return licenseType === 'monthly' ? 1 : 12;
}

