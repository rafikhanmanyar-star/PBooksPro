import { StorageService } from './storageService';
import { CustomerBill } from '../../../types';

export class CustomerBillRepository extends StorageService<CustomerBill> {
    protected endpoint = '/inventory/customer-bills';
}

export const customerBillApi = new CustomerBillRepository();
