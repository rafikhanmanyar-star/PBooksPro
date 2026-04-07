/** Smart ERP UI — financial inputs, virtualized tables, inline edit, searchable dropdowns */

export {
  computeFormulas,
  evaluateExpression,
  extractIdentifiers,
  sortFormulasTopological,
  type FormulaMap,
} from './formulaEngine';

export { runValidation, firstError, Rules, type ValidationRule, type FieldErrors } from './validation';

export { useDebounced } from './useDebounced';

export { SmartInput, type SmartInputProps, type SmartInputValues } from './SmartInput';

export { InlineEditableCell, type InlineEditableCellProps, type SaveStatus } from './InlineEditableCell';

export { SmartTable, type SmartColumnDef, type SmartTableProps, type CellSaveState } from './SmartTable';

export { TableSkeleton, type TableSkeletonProps } from './TableSkeleton';

export { SmartDropdown, type SmartDropdownProps, type SmartDropdownItem } from './SmartDropdown';

export { SmartERPDemo } from './SmartERPDemo';
