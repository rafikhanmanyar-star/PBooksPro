import React from 'react';

interface LandingPageProps {
    onLaunch: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onLaunch }) => {
    return (
        <div className="min-h-screen bg-white font-sans selection:bg-orange-100 selection:text-orange-900 overflow-x-hidden">
            {/* Navigation */}
            <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-100 px-6 h-20 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-950 rounded-2xl flex items-center justify-center text-white font-bold text-xl shadow-xl shadow-slate-950/20">P</div>
                    <span className="text-xl font-bold font-heading uppercase tracking-tighter text-slate-950">PBooks Pro</span>
                </div>
                <button 
                    onClick={onLaunch}
                    className="px-6 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-2xl transition-all shadow-lg shadow-orange-500/20 uppercase tracking-widest text-[10px]"
                >
                    Launch System
                </button>
            </nav>

            {/* Hero Section */}
            <section className="pt-40 pb-20 px-6 max-w-7xl mx-auto text-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-full text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-8 border border-slate-200">
                    <span className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-pulse"></span>
                    Now with AI-Powered Inventory
                </div>
                <h1 className="text-6xl md:text-8xl font-bold font-heading uppercase tracking-tighter text-slate-950 leading-[0.9] mb-8">
                    Smart Inventory <br /> <span className="text-orange-500">for Modern Builders.</span>
                </h1>
                <p className="text-slate-500 text-xl max-w-2xl mx-auto mb-12 font-medium">
                    The only multi-tenant inventory system built specifically for the construction industry. Track materials, scan receipts with AI, and master your profit margins.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                    <button 
                        onClick={onLaunch}
                        className="w-full sm:w-auto px-10 py-5 bg-slate-950 hover:bg-slate-900 text-white font-bold rounded-3xl transition-all shadow-2xl shadow-slate-950/30 uppercase tracking-widest text-xs flex items-center justify-center gap-3 group"
                    >
                        Start Free Trial
                        <svg className="group-hover:translate-x-1 transition-transform" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                    </button>
                    <button className="w-full sm:w-auto px-10 py-5 bg-white border border-slate-200 text-slate-600 font-bold rounded-3xl hover:bg-slate-50 transition-all uppercase tracking-widest text-xs">
                        View Demo
                    </button>
                </div>
            </section>

            {/* Features Grid */}
            <section className="py-20 px-6 max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
                {[
                    {
                        title: "AI Receipt Scanning",
                        desc: "Stop manual data entry. Our Gemini AI engine extracts supplier details and items from photos in seconds.",
                        icon: "📸",
                        color: "bg-orange-50 text-orange-600"
                    },
                    {
                        title: "Profit Intelligence",
                        desc: "Real-time markup logic and profit calculation for every sale. Know your numbers before you build.",
                        icon: "📈",
                        color: "bg-emerald-50 text-emerald-600"
                    },
                    {
                        title: "Multi-Tenant Cloud",
                        desc: "Keep your organization's data isolated and secure. Enterprise-grade repository patterns for the modern SaaS.",
                        icon: "☁️",
                        color: "bg-indigo-50 text-indigo-600"
                    }
                ].map((feature, idx) => (
                    <div key={idx} className="p-8 rounded-[2rem] border border-slate-100 bg-white hover:border-slate-200 hover:shadow-xl transition-all group">
                        <div className={`w-14 h-14 ${feature.color} rounded-2xl flex items-center justify-center text-2xl mb-6 group-hover:scale-110 transition-transform`}>
                            {feature.icon}
                        </div>
                        <h3 className="text-xl font-bold font-heading uppercase tracking-tight text-slate-950 mb-3">{feature.title}</h3>
                        <p className="text-slate-500 leading-relaxed font-medium">{feature.desc}</p>
                    </div>
                ))}
            </section>

            {/* Footer */}
            <footer className="py-20 px-6 border-t border-slate-100 text-center">
                <div className="flex items-center justify-center gap-3 mb-8">
                    <div className="w-8 h-8 bg-slate-950 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-slate-950/20">P</div>
                    <span className="text-lg font-bold font-heading uppercase tracking-tighter text-slate-950">PBooks Pro</span>
                </div>
                <p className="text-slate-400 text-sm font-bold uppercase tracking-widest">© 2026 Multi-tenant Systems Inc.</p>
            </footer>
        </div>
    );
};

export default LandingPage;
