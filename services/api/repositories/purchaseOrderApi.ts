import { StorageService } from './storageService';
import { InventoryPurchaseOrder } from '../../../types';

export class PurchaseOrderRepository extends StorageService<InventoryPurchaseOrder> {
    protected endpoint = '/inventory/purchase-orders';
}

export const purchaseOrderApi = new PurchaseOrderRepository();
