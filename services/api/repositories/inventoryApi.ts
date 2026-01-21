import { StorageService } from './storageService';
import { InventoryItem } from '../../../types';

export class InventoryRepository extends StorageService<InventoryItem> {
    protected endpoint = '/inventory';
}

export const inventoryApi = new InventoryRepository();
