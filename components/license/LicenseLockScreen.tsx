
import React, { useState } from 'react';
import { useLicense } from '../../context/LicenseContext';
import Input from '../ui/Input';
import Button from '../ui/Button';
import { ICONS } from '../../constants';

const LicenseLockScreen: React.FC = () => {
    const { registerApp, deviceId } = useLicense();
    const [keyInput, setKeyInput] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleUnlock = (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        
        setTimeout(() => {
            const success = registerApp(keyInput);
            if (!success) {
                setError('Invalid license key for this device.');
                setIsLoading(false);
            }
        }, 800);
    };

    return (
        <div className="fixed inset-0 z-[9999] bg-slate-900 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
                <div className="bg-rose-600 p-6 text-center">
                    <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 text-white">
                        <div className="w-8 h-8">{ICONS.lock}</div>
                    </div>
                    <h2 className="text-2xl font-bold text-white">Trial Expired</h2>
                    <p className="text-rose-100 mt-2 text-sm">Your 30-day trial period has ended.</p>
                </div>
                
                <div className="p-8 space-y-6">
                    <div className="text-center p-3 bg-slate-50 border border-slate-200 rounded-lg">
                        <p className="text-xs text-slate-500 uppercase font-bold mb-1">Your Device ID</p>
                        <code className="text-lg font-mono font-bold text-slate-800 select-all block cursor-text">{deviceId}</code>
                        <p className="text-xs text-slate-400 mt-1">Send this ID to support to get your key.</p>
                    </div>

                    <form onSubmit={handleUnlock} className="space-y-4">
                        <Input
                            placeholder="MA-XXXXXXXX-XXXX"
                            value={keyInput}
                            onChange={(e) => setKeyInput(e.target.value.toUpperCase())}
                            className="font-mono text-center tracking-widest text-lg border-2 border-slate-300 focus:border-rose-500 focus:ring-rose-200"
                        />
                        {error && <p className="text-center text-rose-600 text-sm font-bold">{error}</p>}
                        
                        <Button type="submit" className="w-full justify-center bg-rose-600 hover:bg-rose-700 py-3 text-lg" disabled={isLoading}>
                            {isLoading ? 'Verifying...' : 'Unlock Software'}
                        </Button>
                    </form>
                    
                    <div className="text-center pt-4 border-t border-slate-100">
                        <p className="text-xs text-slate-400">Contact support: support@myaccountant.com</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LicenseLockScreen;
