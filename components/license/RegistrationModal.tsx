
import React, { useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { useLicense } from '../../context/LicenseContext';
import { ICONS } from '../../constants';

interface RegistrationModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const RegistrationModal: React.FC<RegistrationModalProps> = ({ isOpen, onClose }) => {
    const { registerApp, deviceId } = useLicense();
    const [keyInput, setKeyInput] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        
        const success = registerApp(keyInput);
        if (success) {
            setSuccess(true);
            setTimeout(() => {
                onClose();
                setSuccess(false);
                setKeyInput('');
            }, 1500);
        } else {
            setError('Invalid license key. This key does not match this device.');
        }
    };

    const copyDeviceId = () => {
        navigator.clipboard.writeText(deviceId);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Register Software">
            <div className="space-y-6">
                {success ? (
                    <div className="flex flex-col items-center justify-center py-8 text-emerald-600 animate-fade-in">
                        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4 text-3xl">
                            ✓
                        </div>
                        <h3 className="text-xl font-bold">Registration Successful!</h3>
                        <p className="text-slate-600 mt-2">Thank you for purchasing PBooksPro.</p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                                Your Device ID
                            </label>
                            <div className="flex gap-2">
                                <code className="flex-1 bg-white border border-slate-300 rounded px-3 py-2 font-mono text-lg text-slate-800 text-center tracking-widest">
                                    {deviceId}
                                </code>
                                <Button type="button" variant="secondary" onClick={copyDeviceId} title="Copy ID">
                                    {ICONS.clipboard}
                                </Button>
                            </div>
                            <p className="text-xs text-slate-500 mt-2">
                                Please send this <strong>Device ID</strong> to the administrator to receive your unique license key.
                            </p>
                        </div>
                        
                        <div>
                            <Input
                                label="Enter License Key"
                                placeholder="MA-XXXXXXXX-XXXX"
                                value={keyInput}
                                onChange={(e) => setKeyInput(e.target.value.toUpperCase())}
                                className="font-mono text-center tracking-widest text-lg"
                                required
                            />
                            {error && <p className="text-xs text-rose-600 mt-2 font-medium">{error}</p>}
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
                            <Button type="submit">Activate</Button>
                        </div>
                    </form>
                )}
            </div>
        </Modal>
    );
};

export default RegistrationModal;
