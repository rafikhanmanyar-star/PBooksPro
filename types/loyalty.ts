
export type LoyaltyTier = 'Silver' | 'Gold' | 'Platinum';

export interface LoyaltyProgram {
    id: string;
    name: string;
    type: 'Points' | 'Cashback' | 'Tier-Based';
    earnRate: number; // e.g., 1 point per 100 PKR
    redeemRate: number; // e.g., 1 PKR per 10 points
    minRedeemPoints: number;
    isActive: boolean;
}

export interface LoyaltyMember {
    id: string;
    customerId: string;
    customerName: string;
    cardNumber: string;
    email?: string;
    phone?: string;
    tier: LoyaltyTier;
    pointsBalance: number;
    lifetimePoints: number;
    totalSpend: number;
    visitCount: number;
    joinDate: string;
    expiryDate?: string;
    status: 'Active' | 'Inactive' | 'Lapsed';
}

export interface LoyaltyTransaction {
    id: string;
    memberId: string;
    type: 'Earn' | 'Redeem' | 'Bonus' | 'Adjustment' | 'Reverse';
    points: number;
    value: number; // Cash value
    referenceId: string; // Sale ID
    timestamp: string;
    notes?: string;
}

export interface LoyaltyTierConfig {
    tier: LoyaltyTier;
    threshold: number; // Spend amount to reach tier
    multiplier: number; // Bonus points multiplier
    benefits: string[];
}

export interface LoyaltyCampaign {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    type: 'DoublePoints' | 'FlashSale' | 'WelcomeBonus';
    targetSegment: string;
    status: 'Active' | 'Scheduled' | 'Completed';
}
