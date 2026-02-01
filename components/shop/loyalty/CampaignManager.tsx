
import React from 'react';
import { useLoyalty } from '../../../context/LoyaltyContext';
import { ICONS } from '../../../constants';
import Card from '../../ui/Card';

const CampaignManager: React.FC = () => {
    const { campaigns } = useLoyalty();

    return (
        <div className="space-y-6 animate-fade-in shadow-inner">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-black text-slate-800 tracking-tight">Promotional Campaign Lifecycle</h3>
                <button className="px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-rose-100 hover:bg-rose-700 transition-all flex items-center gap-2">
                    {ICONS.target} Launch Campaign
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {campaigns.map(camp => (
                    <Card key={camp.id} className="relative overflow-hidden group border-none shadow-sm hover:shadow-xl transition-all h-[320px] flex flex-col p-8 bg-white border-b-4 border-slate-100">
                        {/* Status Overlay */}
                        <div className="flex justify-between items-start mb-6">
                            <div className={`p-4 rounded-2xl ${camp.type === 'DoublePoints' ? 'bg-indigo-50 text-indigo-600' :
                                    camp.type === 'FlashSale' ? 'bg-rose-50 text-rose-600' :
                                        'bg-amber-50 text-amber-600'
                                }`}>
                                {React.cloneElement(ICONS.target as React.ReactElement<any>, { width: 24, height: 24 })}
                            </div>
                            <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest ${camp.status === 'Active' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-100' :
                                    camp.status === 'Scheduled' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' :
                                        'bg-slate-200 text-slate-500'
                                }`}>
                                {camp.status}
                            </span>
                        </div>

                        <div className="flex-1 space-y-2">
                            <h4 className="text-xl font-black text-slate-800 tracking-tight group-hover:text-rose-600 transition-colors">{camp.name}</h4>
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{camp.type}</p>

                            <div className="pt-6 space-y-4">
                                <div className="flex items-center justify-between text-[10px] font-bold">
                                    <span className="text-slate-400 uppercase">Targeting Segment</span>
                                    <span className="text-slate-800 bg-slate-100 px-2 py-0.5 rounded italic">{camp.targetSegment}</span>
                                </div>
                                <div className="flex items-center justify-between text-[10px] font-bold">
                                    <span className="text-slate-400 uppercase">Duration</span>
                                    <span className="text-slate-600">{new Date(camp.startDate).toLocaleDateString()} - {new Date(camp.endDate).toLocaleDateString()}</span>
                                </div>
                            </div>
                        </div>

                        <div className="pt-6 border-t border-slate-50 flex gap-2">
                            <button className="flex-1 py-3 bg-slate-50 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-100 transition-all">
                                Edit Campaign
                            </button>
                            <button className="px-3 bg-slate-100 text-slate-400 rounded-xl hover:bg-rose-50 hover:text-rose-600 transition-all">
                                {ICONS.trash}
                            </button>
                        </div>
                    </Card>
                ))}

                {/* Create New Placeholder */}
                <button className="h-[320px] border-4 border-dashed border-slate-200 rounded-3xl flex flex-col items-center justify-center gap-4 text-slate-300 hover:border-rose-300 hover:text-rose-400 transition-all group p-12">
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center group-hover:bg-rose-50 transition-colors">
                        {React.cloneElement(ICONS.plus as React.ReactElement<any>, { width: 32, height: 32 })}
                    </div>
                    <div className="text-center">
                        <p className="text-xs font-black uppercase tracking-[0.2em]">New Campaign</p>
                        <p className="text-[10px] font-medium italic mt-1 bg-slate-50 px-2 py-0.5 rounded">Deploy high-ROI retention rules</p>
                    </div>
                </button>
            </div>
        </div>
    );
};

export default CampaignManager;
