import React from 'react';
import { ICONS } from '../../constants';

/** Fixed width for the actions column so edit/delete buttons never overlap. */
export const SETTINGS_TABLE_ACTIONS_COL_CLASS =
    'w-28 min-w-28 whitespace-nowrap text-right';

interface SettingsTableActionsProps {
    onEdit: (e: React.MouseEvent<HTMLButtonElement>) => void;
    onDelete: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

const SettingsTableActions: React.FC<SettingsTableActionsProps> = ({ onEdit, onDelete }) => (
    <div className="inline-flex items-center justify-end gap-2">
        <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center justify-center shrink-0 size-8 rounded-md text-ds-primary hover:text-app-text bg-app-highlight/70 hover:bg-app-highlight transition-colors"
            title="Edit"
            aria-label="Edit"
        >
            <span className="size-4 flex items-center justify-center [&_svg]:size-full">{ICONS.edit}</span>
        </button>
        <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center justify-center shrink-0 size-8 rounded-md text-ds-danger bg-rose-500/10 hover:bg-rose-500/20 transition-colors"
            title="Delete"
            aria-label="Delete"
        >
            <span className="size-4 flex items-center justify-center [&_svg]:size-full">{ICONS.trash}</span>
        </button>
    </div>
);

export default SettingsTableActions;
