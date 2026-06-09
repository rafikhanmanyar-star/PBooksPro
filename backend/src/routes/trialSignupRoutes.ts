import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { sendFailure, sendSuccess, handleRouteError } from '../utils/apiResponse.js';
import { createTrialSignup, trialSignupEnabled } from '../services/trial/trialSignupService.js';
import { consumeTrialExchangeCode, issueTrialExchangeCode } from '../services/trial/trialExchangeStore.js';

export const trialSignupRouter = Router();

const signupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    data: null,
    error: { code: 'RATE_LIMIT', message: 'Too many trial signups. Please try again later.' },
  },
});

const signupSchema = z.object({
  name: z.string().min(1).max(200),
  company: z.string().min(1).max(200),
  email: z.string().email().max(320),
  mobile: z.string().min(10).max(40),
  password: z.string().min(8).max(256),
  acceptTerms: z.boolean().optional(),
  legalAcceptances: z
    .array(
      z.object({
        documentType: z.string().min(1),
        documentVersion: z.string().min(1),
      })
    )
    .optional(),
  utmSource: z.string().max(120).optional(),
  utmMedium: z.string().max(120).optional(),
  utmCampaign: z.string().max(120).optional(),
  pageUrl: z.string().max(2000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

function clientIp(req: { ip?: string; headers: Record<string, unknown> }): string | undefined {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0]?.trim();
  return req.ip;
}

trialSignupRouter.get('/trial/config', (_req, res) => {
  sendSuccess(res, {
    enabled: trialSignupEnabled(),
    trialDays: 14,
    appUrl: (process.env.TRIAL_SIGNUP_APP_URL || process.env.EMAIL_AUTOMATION_APP_URL || 'https://app.pbookspro.com').replace(
      /\/$/,
      ''
    ),
  });
});

const exchangeSchema = z.object({
  code: z.string().min(16).max(64),
});

trialSignupRouter.post('/trial/exchange', signupLimiter, async (req, res) => {
  try {
    const { code } = exchangeSchema.parse(req.body ?? {});
    const session = consumeTrialExchangeCode(code);
    if (!session) {
      sendFailure(res, 410, 'TRIAL_CODE_INVALID', 'Trial login link expired or already used. Please sign in with your password.');
      return;
    }
    sendSuccess(res, { token: session.token, tenantId: session.tenantId });
  } catch (e) {
    handleRouteError(res, e, { route: 'POST /trial/exchange' });
  }
});

trialSignupRouter.post('/trial/signup', signupLimiter, async (req, res) => {
  if (!trialSignupEnabled()) {
    sendFailure(
      res,
      503,
      'TRIAL_SIGNUP_DISABLED',
      'Free trial signup is not enabled. Set ALLOW_TRIAL_SIGNUP=true on the API server.'
    );
    return;
  }

  try {
    const body = signupSchema.parse(req.body ?? {});
    const result = await createTrialSignup(
      {
        ...body,
        userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
        ipAddress: clientIp(req),
      },
      req
    );

    sendSuccess(
      res,
      {
        tenantId: result.tenantId,
        username: result.username,
        token: result.token,
        trialDaysRemaining: result.trialDaysRemaining,
        trialEndDate: result.trialEndDate,
        appUrl: result.appUrl,
        leadId: result.leadId,
        redirectUrl: `${result.appUrl}?trial_code=${encodeURIComponent(issueTrialExchangeCode(result.token, result.tenantId))}&onboarding=1`,
      },
      201
    );
  } catch (e) {
    handleRouteError(res, e, { route: 'POST /trial/signup' });
  }
});
