
import React from 'react';
import { Contact } from '../../types';
import { ICONS } from '../../constants';
import { useAppContext } from '../../context/AppContext';
import { useNotification } from '../../context/NotificationContext';
import Button from '../ui/Button';

interface VendorInfoProps {
  vendor: Contact;
  onEdit: () => void;
  onCreateBill?: () => void;
  onRecordPayment?: () => void;
  onCreateQuotation?: () => void;
}

const VendorInfo: React.FC<VendorInfoProps> = ({ vendor, onEdit, onCreateBill, onRecordPayment, onCreateQuotation }) => {
  const { state } = useAppContext();
  const { showAlert } = useNotification();
  
  const handleSendWhatsApp = async () => {
    if (!vendor.contactNo) {
        await showAlert("This vendor does not have a phone number saved.");
        return;
    }
    const message = state.whatsAppTemplates.vendorGreeting.replace(/{contactName}/g, vendor.name);
    const phoneNumber = vendor.contactNo.replace(/[^0-9]/g, ''); // Clean the number
    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodedMessage}`;
    window.open(whatsappUrl, '_blank');
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex-shrink-0 overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-50 via-blue-50 to-indigo-50 p-6 border-b border-slate-200">
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="flex-shrink-0 w-16 h-16 rounded-full bg-gradient-to-br from-indigo-600 to-blue-600 flex items-center justify-center text-white text-xl font-bold shadow-lg">
                        {getInitials(vendor.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="text-xl font-bold text-slate-900 truncate mb-1" title={vendor.name}>
                            {vendor.name}
                        </h3>
                        {vendor.companyName && (
                            <p className="text-sm text-slate-600 truncate">{vendor.companyName}</p>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    {vendor.contactNo && (
                        <button 
                            onClick={handleSendWhatsApp} 
                            className="flex items-center justify-center w-10 h-10 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 border border-green-200 transition-colors shadow-sm hover:shadow-md"
                            title="Send WhatsApp Message"
                        >
                            <div className="w-5 h-5">{ICONS.whatsapp}</div>
                        </button>
                    )}
                    <button 
                        onClick={onEdit} 
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 font-medium text-sm transition-colors shadow-sm hover:shadow-md"
                    >
                        <div className="w-4 h-4">{ICONS.edit}</div>
                        <span>Edit</span>
                    </button>
                </div>
            </div>
        </div>
        
        <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {vendor.companyName && (
                    <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
                            <div className="w-5 h-5 text-slate-600">{ICONS.building}</div>
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Company</div>
                            <div className="text-sm font-medium text-slate-900 truncate">{vendor.companyName}</div>
                        </div>
                    </div>
                )}
                {vendor.contactNo && (
                    <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
                            <div className="w-5 h-5 text-slate-600">{ICONS.phone}</div>
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Phone</div>
                            <div className="text-sm font-medium text-slate-900">{vendor.contactNo}</div>
                        </div>
                    </div>
                )}
                {vendor.address && (
                    <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
                            <div className="w-5 h-5 text-slate-600">{ICONS.mapPin}</div>
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Address</div>
                            <div className="text-sm font-medium text-slate-900">{vendor.address}</div>
                        </div>
                    </div>
                )}
                {vendor.description && (
                    <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
                            <div className="w-5 h-5 text-slate-600">{ICONS.fileText}</div>
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Notes</div>
                            <div className="text-sm font-medium text-slate-900">{vendor.description}</div>
                        </div>
                    </div>
                )}
            </div>
            
            {(onCreateBill || onRecordPayment || onCreateQuotation) && (
                <div className="mt-6 pt-6 border-t border-slate-200 flex flex-wrap gap-3">
                    {onCreateBill && (
                        <Button 
                            onClick={onCreateBill} 
                            className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md hover:shadow-lg transition-all"
                        >
                            <div className="w-4 h-4 mr-2">{ICONS.plus}</div>
                            <span>Create New Bill</span>
                        </Button>
                    )}
                    {onRecordPayment && (
                        <Button 
                            onClick={onRecordPayment} 
                            variant="secondary"
                            className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 shadow-sm hover:shadow-md transition-all"
                        >
                            <div className="w-4 h-4 mr-2">{ICONS.dollarSign}</div>
                            <span>Record Payment</span>
                        </Button>
                    )}
                    {onCreateQuotation && (
                        <Button 
                            onClick={onCreateQuotation} 
                            variant="secondary"
                            className="bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 shadow-sm hover:shadow-md transition-all"
                        >
                            <div className="w-4 h-4 mr-2">{ICONS.plus}</div>
                            <span>Create Quotation</span>
                        </Button>
                    )}
                </div>
            )}
        </div>
    </div>
  );
};

export default VendorInfo;
