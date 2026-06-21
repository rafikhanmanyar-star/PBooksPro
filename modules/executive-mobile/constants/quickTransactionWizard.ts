export const WIZARD_STEPS = [
  { id: 1, key: 'type', title: 'What happened?', subtitle: 'Choose Suppliers, Staff, Site, or Misc' },
  { id: 2, key: 'amount', title: 'How much?', subtitle: 'Enter the amount in PKR' },
  { id: 3, key: 'details', title: 'Details', subtitle: 'Party, project, and description' },
  { id: 4, key: 'receipt', title: 'Receipt photo', subtitle: 'Optional — snap or upload' },
  { id: 5, key: 'review', title: 'Review & submit', subtitle: 'Confirm before sending to finance' },
] as const;

export const QUICK_AMOUNT_PRESETS = [5_000, 10_000, 25_000, 50_000, 100_000] as const;

export { isCustomerPickerKind, isEntityPickerKind, isNameInputKind, isVendorPickerKind } from './quickCaptureTypes';
export {
  CORE_CAPTURE_TYPES,
  INFLOW_CAPTURE_TYPES,
  OUTFLOW_CAPTURE_TYPES,
  captureTypesForFlow,
  captureTypeIcon,
  defaultCaptureType,
  type CaptureType,
} from './quickCaptureTypes';

