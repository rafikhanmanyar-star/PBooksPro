/**

 * Referral types (backend mirror of shared/referrals/referralTypes.ts).

 */



export type ReferralRewardType = 'free_months' | 'discount_credit' | 'plan_upgrade';



export type ReferralAttributionStatus =

  | 'signed_up'

  | 'trialing'

  | 'converted'

  | 'rewarded'

  | 'rejected'

  | 'fraud_flagged';



export type ReferralRewardStatus = 'pending' | 'approved' | 'applied' | 'rejected' | 'expired';



export type ReferralRewardValue =

  | { months: number }

  | { creditCents: number; currency?: string }

  | { planCode: string; billingCycle?: 'monthly' | 'annual' };



export type ReferralProgramConfig = {

  isEnabled: boolean;

  referrerRewardType: ReferralRewardType;

  referrerRewardValue: ReferralRewardValue;

  refereeRewardType: ReferralRewardType | null;

  refereeRewardValue: ReferralRewardValue;

  minDaysToConvert: number;

  maxReferralsPerMonth: number;

  blockSameEmailDomain: boolean;

  requirePaidConversion: boolean;

  invitationExpiryDays: number;

  signupBaseUrl: string;

};



export type ReferralAttributionSummary = {

  id: string;

  refereeTenantName: string;

  refereeEmail: string;

  status: ReferralAttributionStatus;

  signedUpAt: string;

  convertedAt: string | null;

  fraudScore: number;

};



export type ReferralInvitationSummary = {

  id: string;

  inviteeEmail: string;

  inviteeName: string | null;

  status: string;

  sentAt: string | null;

  expiresAt: string;

};



export type ReferralDashboardStats = {

  code: string | null;

  shareUrl: string | null;

  totalClicks: number;

  totalSignups: number;

  totalConversions: number;

  pendingRewards: number;

  appliedRewards: number;

  discountCreditCents: number;

  freeMonthsPending: number;

  conversionRate: number;

  recentReferrals: ReferralAttributionSummary[];

  recentInvitations: ReferralInvitationSummary[];

};



export type AdminReferralStats = {

  programEnabled: boolean;

  totalCodes: number;

  totalSignups: number;

  totalConversions: number;

  pendingRewards: number;

  openFraudReviews: number;

  conversionRate: number;

  topReferrers: Array<{

    tenantId: string;

    tenantName: string;

    signups: number;

    conversions: number;

  }>;

};


