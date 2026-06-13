import React, { useMemo } from 'react';
import ComboBox from '../ui/ComboBox';
import { useBuildings, useProjects } from '../../hooks/useSelectiveState';
import {
  buildFinancialEntityFilterItems,
  FINANCIAL_ENTITY_FILTER_ALL,
} from './financialEntityScope';

type Props = {
  selectedId: string;
  onSelect: (filterId: string) => void;
  placeholder?: string;
  className?: string;
};

const FinancialEntityFilterCombo: React.FC<Props> = ({
  selectedId,
  onSelect,
  placeholder = 'Project or building',
  className,
}) => {
  const projects = useProjects();
  const buildings = useBuildings();
  const items = useMemo(
    () => buildFinancialEntityFilterItems(projects, buildings),
    [projects, buildings]
  );

  return (
    <div className={className}>
      <ComboBox
        items={items}
        selectedId={selectedId}
        onSelect={(item) => onSelect(item?.id || FINANCIAL_ENTITY_FILTER_ALL)}
        allowAddNew={false}
        placeholder={placeholder}
      />
    </div>
  );
};

export default FinancialEntityFilterCombo;
