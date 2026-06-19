import { useQuery } from '@tanstack/react-query';
import { fetchMobileCommandCenter } from '../../../services/api/mobileCommandCenterApi';
import { useAuth } from '../../../context/AuthContext';

export const MOBILE_COMMAND_CENTER_KEY = ['mobile-command-center'] as const;

export function useMobileCommandCenter() {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: MOBILE_COMMAND_CENTER_KEY,
    queryFn: fetchMobileCommandCenter,
    staleTime: 45_000,
    refetchInterval: 90_000,
    enabled: isAuthenticated,
  });
}
