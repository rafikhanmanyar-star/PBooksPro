
import React, { useState } from 'react';
import Button from '../ui/Button';
import PaymentModal from './PaymentModal';
import { ICONS } from '../../constants';

const LicenseLockScreen: React.FC = () => {
    const [showPaymentModal, setShowPaymentModal] = useState(false);

    return (
        <>
            <div className="fixed inset-0 z-[9999] bg-slate-900 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
                    <div className="bg-rose-600 p-6 text-center">
                        <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 text-white">
                            <div className="w-8 h-8">{ICONS.lock}</div>
                        </div>
                        <h2 className="text-2xl font-bold text-white">License Expired</h2>
                        <p className="text-rose-100 mt-2 text-sm">Your license has expired. Please renew to continue using the application.</p>
                    </div>
                    
                    <div className="p-8 space-y-6">
                        <div className="text-center p-4 bg-blue-50 border border-blue-200 rounded-lg">
                            <p className="text-sm text-blue-800">
                                <strong>Renew Your License</strong>
                            </p>
                            <p className="text-xs text-blue-600 mt-1">
                                Choose a monthly or yearly subscription plan to continue using all features.
                            </p>
                        </div>

                        <Button 
                            onClick={() => setShowPaymentModal(true)}
                            className="w-full justify-center bg-blue-600 hover:bg-blue-700 py-3 text-lg"
                        >
                            <span className="mr-2">💳</span>
                            Renew License Online
                        </Button>
                        
                        <div className="text-center pt-4 border-t border-slate-100">
                            <p className="text-xs text-slate-400">Need help? Contact support: support@myaccountant.com</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Payment Modal */}
            <PaymentModal
                isOpen={showPaymentModal}
                onClose={() => setShowPaymentModal(false)}
                onSuccess={() => {
                    setShowPaymentModal(false);
                    // Reload page or refresh license status
                    window.location.reload();
                }}
            />
        </>
    );
};

export default LicenseLockScreen;
