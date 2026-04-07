/**
 * CompanyGate
 *
 * In local-only mode: gates the app until a company is chosen and (if required) logged into.
 * - On load: if no company open, shows company select/create screen; if company open, login if required, else app.
 * - After logout: DB is saved and closed; same company select/create screen is shown.
 */

import React, { Suspense } from 'react';
import { useCompany } from '../../context/CompanyContext';
import { isLocalOnlyMode } from '../../config/apiUrl';
import Loading from '../ui/Loading';

const CompanyLoginScreen = React.lazy(() => import('./CompanyLoginScreen'));
const CompanySelectScreen = React.lazy(() => import('./CompanySelectScreen'));

interface Props {
  children: React.ReactNode;
}

export const CompanyGate: React.FC<Props> = ({ children }) => {
  const companyCtx = useCompany();

  if (!isLocalOnlyMode()) {
    return <>{children}</>;
  }

  if (companyCtx.isLoading || companyCtx.screen === 'loading') {
    return <Loading message="Loading..." />;
  }

  if (companyCtx.screen === 'select' || companyCtx.screen === 'create') {
    return (
      <Suspense fallback={<Loading message="Loading..." />}>
        <CompanySelectScreen />
      </Suspense>
    );
  }

  if (companyCtx.screen === 'login') {
    return (
      <Suspense fallback={<Loading message="Loading..." />}>
        <CompanyLoginScreen />
      </Suspense>
    );
  }

  return <>{children}</>;
};

export default CompanyGate;
