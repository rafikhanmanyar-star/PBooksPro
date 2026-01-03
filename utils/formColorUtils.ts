import { AppState } from '../types';

/**
 * Gets the background color style for forms based on project and building color selection.
 * Returns an empty object if no color is defined, allowing default background to be used.
 * 
 * @param projectId - The project ID to get color from
 * @param buildingId - The building ID to get color from (used if project color not available)
 * @param state - The application state containing projects and buildings
 * @returns Style object with backgroundColor property, or empty object for default
 */
export const getFormBackgroundColorStyle = (
    projectId: string | undefined,
    buildingId: string | undefined,
    state: AppState
): React.CSSProperties => {
    if (!state.enableColorCoding) return {};

    let color: string | null = null;
    
    // Try project color first
    if (projectId) {
        const project = state.projects.find((p) => p.id === projectId);
        if (project?.color) color = project.color;
    }
    
    // Fall back to building color if project color not found
    if (!color && buildingId) {
        const building = state.buildings.find((b) => b.id === buildingId);
        if (building?.color) color = building.color;
    }

    // Convert hex to rgba with low opacity for background
    if (color) {
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        return {
            backgroundColor: `rgba(${r}, ${g}, ${b}, 0.1)`,
        };
    }
    
    return {};
};

