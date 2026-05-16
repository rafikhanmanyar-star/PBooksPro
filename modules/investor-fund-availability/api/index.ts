/**
 * Local/Electron: analytics run on hydrated app state.
 * PostgreSQL API can expose `/api/investor-fund-availability/*` mirroring {@link getFundAvailabilitySummary}.
 */

export type {
    FundAvailabilitySummary,
    FundAvailabilityRow,
    FundAvailabilityDetails,
} from '../types/fundAvailability.types';
