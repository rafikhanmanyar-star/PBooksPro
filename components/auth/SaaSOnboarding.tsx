import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { logger } from '../../services/logger';

const SaaSOnboarding: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
    const [step, setStep] = useState(1);
    const { registerTenant, login } = useAuth();
    const [isLoading, setIsLoading] = useState(false);
    
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        companyName: '',
        password: 'Password123!', // Default for demo
    });

    const handleNext = () => {
        if (step < 2) setStep(step + 1);
        else handleSubmit();
    };

    const handleSubmit = async () => {
        setIsLoading(true);
        try {
            // Step 1: Register Tenant (Multi-tenant initialization)
            const regResult = await registerTenant({
                adminName: formData.name,
                email: formData.email,
                companyName: formData.companyName,
                adminUsername: formData.email, // Use email as username
                adminPassword: formData.password
            });

            // Step 2: Auto-login
            if (regResult.tenantId) {
                await login(formData.email, formData.password, regResult.tenantId);
                onComplete();
            }
        } catch (error) {
            logger.errorCategory('onboarding', 'Onboarding failed', error);
            alert('Initialization failed. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
            <div className="w-full max-w-xl bg-white rounded-[3rem] shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-8 duration-500 border border-slate-100">
                <div className="bg-slate-950 p-12 text-center relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-orange-500/20">
                        <div 
                            className="h-full bg-orange-500 transition-all duration-500" 
                            style={{ width: `${(step / 2) * 100}%` }}
                        ></div>
                    </div>
                    <h2 className="text-3xl font-bold font-heading uppercase tracking-tighter text-white mb-2">
                        {step === 1 ? 'Personal Profile' : 'Organization Setup'}
                    </h2>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Step {step} of 2</p>
                </div>

                <div className="p-12">
                    {step === 1 ? (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Full Name</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={e => setFormData({...formData, name: e.target.value})}
                                    placeholder="Enter your name"
                                    className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-orange-500 outline-none transition-all font-medium text-slate-900"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Work Email</label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={e => setFormData({...formData, email: e.target.value})}
                                    placeholder="name@company.com"
                                    className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-orange-500 outline-none transition-all font-medium text-slate-900"
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Company Name</label>
                                <input
                                    type="text"
                                    value={formData.companyName}
                                    onChange={e => setFormData({...formData, companyName: e.target.value})}
                                    placeholder="Builders Inc."
                                    className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-orange-500 outline-none transition-all font-medium text-slate-900"
                                />
                            </div>
                            <div className="p-4 bg-orange-50 rounded-2xl border border-orange-100">
                                <p className="text-[10px] font-bold text-orange-600 uppercase tracking-widest mb-1">Notice</p>
                                <p className="text-xs text-orange-700 leading-relaxed font-medium">
                                    This will initialize your unique multi-tenant instance. All data will be isolated to this organization.
                                </p>
                            </div>
                        </div>
                    )}

                    <div className="mt-12 flex gap-4">
                        {step === 2 && (
                            <button
                                onClick={() => setStep(1)}
                                className="flex-1 py-5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-3xl transition-all uppercase tracking-widest text-[10px]"
                            >
                                Back
                            </button>
                        )}
                        <button
                            onClick={handleNext}
                            disabled={isLoading}
                            className="flex-[2] py-5 bg-slate-950 hover:bg-slate-900 text-white font-bold rounded-3xl transition-all shadow-2xl shadow-slate-950/20 uppercase tracking-widest text-[10px] flex items-center justify-center gap-2"
                        >
                            {isLoading ? (
                                <>
                                    <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                    Initializing...
                                </>
                            ) : (
                                <>
                                    {step === 1 ? 'Continue' : 'Launch System'}
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SaaSOnboarding;
