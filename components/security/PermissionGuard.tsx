import React from 'react';
import { usePermissions } from '../../hooks/usePermissions';
import type { Permission } from '../../shared/rbac/permissions';
import AccessDenied from './AccessDenied';
import { useDispatchOnly } from '../../hooks/useSelectiveState';

interface PermissionGuardProps {
  /** The permission key that must be held for the child to render. */
  required: Permission;
  /** Optional additional permissions accepted via OR logic. */
  anyOf?: Permission[];
  /** Human-readable module name shown in the Access Denied message. */
  moduleName?: string;
  children: React.ReactNode;
}

/**
 * Route-level permission guard. Renders children when the current user holds
 * the required permission; renders <AccessDenied /> otherwise.
 *
 * While permissions are still loading the guard renders nothing (avoids flicker).
 *
 * Usage:
 *   <PermissionGuard required="payroll.read" moduleName="Payroll">
 *     <PayrollHub />
 *   </PermissionGuard>
 */
const PermissionGuard: React.FC<PermissionGuardProps> = ({
  required,
  anyOf,
  moduleName,
  children,
}) => {
  const { has, permissionsLoading } = usePermissions();
  const dispatch = useDispatchOnly();

  if (permissionsLoading) return null;

  const permitted =
    has(required) || (anyOf ? anyOf.some((p) => has(p)) : false);

  if (!permitted) {
    return (
      <AccessDenied
        moduleName={moduleName}
        requiredPermission={required}
        onGoHome={() => dispatch({ type: 'SET_PAGE', payload: 'dashboard' })}
      />
    );
  }

  return <>{children}</>;
};

export default PermissionGuard;
