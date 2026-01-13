import React, { useState, useEffect } from 'react';

interface InitializationScreenProps {
    initMessage: string;
    initProgress: number;
    useFallback?: boolean;
}

/**
 * Feature highlights to showcase during app initialization
 * Each feature includes a title and brief description
 */
const APP_FEATURES = [
    {
        title: 'Smart Financial Management',
        description: 'Track transactions, invoices, and expenses with ease'
    },
    {
        title: 'Property & Rental Management',
        description: 'Manage buildings, properties, units, and rental agreements'
    },
    {
        title: 'Project Management',
        description: 'Track projects, budgets, and payroll efficiently'
    },
    {
        title: 'Contact & Vendor Management',
        description: 'Organize contacts, vendors, and stakeholders'
    },
    {
        title: 'Advanced Invoicing',
        description: 'Create professional invoices with custom templates'
    },
    {
        title: 'Budget & Analytics',
        description: 'Monitor budgets and get insights with detailed reports'
    },
    {
        title: 'Recurring Transactions',
        description: 'Automate recurring invoices and scheduled transactions'
    },
    {
        title: 'Investment Tracking',
        description: 'Track investments, returns, and shareholder distributions'
    },
    {
        title: 'Cloud Sync',
        description: 'Access your data anywhere with cloud synchronization'
    },
    {
        title: 'Secure & Multi-tenant',
        description: 'Enterprise-grade security with multi-tenant support'
    }
];

/**
 * InitializationScreen Component
 * 
 * A premium, full-screen loading screen that appears while the application initializes.
 * Features gradient background, rotating feature highlights, and smooth progress bar.
 * 
 * @param initMessage - Loading status message (not displayed but kept for compatibility)
 * @param initProgress - Loading progress (0-100)
 * @param useFallback - Whether using fallback storage (for debugging)
 */
const InitializationScreen: React.FC<InitializationScreenProps> = ({ 
    initMessage, 
    initProgress, 
    useFallback = false 
}) => {
    const [currentFeatureIndex, setCurrentFeatureIndex] = useState(0);
    const [isVisible, setIsVisible] = useState(true);

    // Rotate through features every 1.8 seconds with smooth transitions
    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentFeatureIndex((prev) => (prev + 1) % APP_FEATURES.length);
        }, 1800);

        return () => clearInterval(interval);
    }, []);

    const currentFeature = APP_FEATURES[currentFeatureIndex];

    // Fade out when progress reaches 100%
    useEffect(() => {
        if (initProgress >= 100) {
            const timer = setTimeout(() => {
                setIsVisible(false);
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [initProgress]);

    return (
        <div 
            className={`fixed inset-0 z-50 flex flex-col bg-gradient-to-br from-indigo-600 via-blue-600 to-cyan-500 overflow-hidden transition-opacity duration-500 ${
                isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
        >
            {/* Main Content Container */}
            <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 text-center">
                {/* Branding Section */}
                <div className="mb-8 sm:mb-12 animate-fade-in">
                    <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-2 drop-shadow-md">
                        PBooksPro
                    </h1>
                    <p className="text-base sm:text-lg lg:text-xl text-blue-100 font-medium">
                        Smart Accounting for Growing Businesses
                    </p>
                </div>

                {/* Feature Highlight Section */}
                <div 
                    key={currentFeatureIndex}
                    className="max-w-3xl mx-auto px-4 animate-feature-fade-in"
                >
                    <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-3 sm:mb-4 drop-shadow-md">
                        {currentFeature.title}
                    </h2>
                    <p className="text-base sm:text-lg lg:text-xl text-blue-50 leading-relaxed">
                        {currentFeature.description}
                    </p>
                </div>
            </div>

            {/* Progress Bar Section at Bottom */}
            <div className="fixed bottom-0 left-0 right-0 bg-white/10 backdrop-blur-md border-t border-white/20 py-6 px-4 sm:px-6">
                <div className="max-w-2xl mx-auto w-full">
                    {/* Progress Bar Container */}
                    <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden shadow-inner">
                        <div 
                            className="h-full bg-gradient-to-r from-white via-blue-100 to-white rounded-full transition-all duration-500 ease-out shadow-lg"
                            style={{ 
                                width: `${Math.min(100, Math.max(0, initProgress))}%`,
                                animation: 'progressShimmer 2s ease-in-out infinite'
                            }}
                        />
                    </div>
                    {/* Progress Percentage (Optional) */}
                    <div className="mt-3 text-center">
                        <span className="text-sm sm:text-base font-semibold text-white/90">
                            {Math.round(initProgress)}%
                        </span>
                    </div>
                </div>
            </div>

            {/* Custom Animations */}
            <style>{`
                @keyframes fade-in {
                    from {
                        opacity: 0;
                        transform: translateY(-10px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                @keyframes feature-fade-in {
                    from {
                        opacity: 0;
                        transform: translateY(20px) scale(0.95);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0) scale(1);
                    }
                }

                @keyframes progressShimmer {
                    0%, 100% {
                        opacity: 1;
                    }
                    50% {
                        opacity: 0.8;
                    }
                }

                .animate-fade-in {
                    animation: fade-in 0.6s ease-out;
                }

                .animate-feature-fade-in {
                    animation: feature-fade-in 0.5s ease-out;
                }
            `}</style>
        </div>
    );
};

export default InitializationScreen;
