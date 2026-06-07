/**

 * Referral program defaults (mirrors shared/referrals/referralTypes.ts).

 */



import type { ReferralProgramConfig, ReferralRewardType } from './referralTypes.js';



export const REFERRAL_REWARD_TYPES: ReferralRewardType[] = [

  'free_months',

  'discount_credit',

  'plan_upgrade',

];



export const DEFAULT_REFERRAL_CONFIG: ReferralProgramConfig = {

  isEnabled: true,

  referrerRewardType: 'free_months',

  referrerRewardValue: { months: 1 },

  refereeRewardType: null,

  refereeRewardValue: { months: 0 },

  minDaysToConvert: 14,

  maxReferralsPerMonth: 20,

  blockSameEmailDomain: true,

  requirePaidConversion: true,

  invitationExpiryDays: 30,

  signupBaseUrl: process.env.REFERRAL_SIGNUP_BASE_URL || 'https://app.pbookspro.com',

};



export const REFERRAL_EMAIL_TEMPLATES = {

  invitation: {

    subject: '{{inviterName}} invited you to try PBooks Pro',

    templateKey: 'referral_invitation',

  },

  reminder: {

    subject: 'Reminder: Your PBooks Pro invitation',

    templateKey: 'referral_invitation_reminder',

  },

  reward_earned: {

    subject: 'You earned a referral reward!',

    templateKey: 'referral_reward_earned',

  },

} as const;


