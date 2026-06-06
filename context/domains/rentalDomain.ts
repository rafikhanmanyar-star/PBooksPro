/**
 * Rental domain — properties, units, buildings, rental agreements.
 */
import { useMemo } from 'react';
import {
  useBuildings,
  useProperties,
  useUnits,
  useRentalAgreements,
  useDispatchOnly,
  useStateSelector,
} from '../../hooks/useSelectiveState';

export function useRentalDomain() {
  const buildings = useBuildings();
  const properties = useProperties();
  const units = useUnits();
  const rentalAgreements = useRentalAgreements();
  const rentalInvoiceSettings = useStateSelector((s) => s.rentalInvoiceSettings);
  const dispatch = useDispatchOnly();

  return useMemo(
    () => ({
      buildings,
      properties,
      units,
      rentalAgreements,
      rentalInvoiceSettings,
      dispatch,
    }),
    [buildings, properties, units, rentalAgreements, rentalInvoiceSettings, dispatch]
  );
}
