
import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import {
    LoyaltyMember,
    LoyaltyProgram,
    LoyaltyTransaction,
    LoyaltyTier,
    LoyaltyTierConfig,
    LoyaltyCampaign
} from '../types/loyalty';
import { shopApi } from '../services/api/shopApi';

interface LoyaltyContextType {
    members: LoyaltyMember[];
    programs: LoyaltyProgram[];
    transactions: LoyaltyTransaction[];
    tiers: LoyaltyTierConfig[];
    campaigns: LoyaltyCampaign[];

    addMember: (member: Omit<LoyaltyMember, 'id' | 'joinDate' | 'pointsBalance' | 'lifetimePoints'>) => void;
    processLoyalty: (customerId: string, saleAmount: number, saleId: string, isRedemption?: boolean, redeemPoints?: number) => void;
    updateMemberTier: (memberId: string) => void;

    // Stats
    totalMembers: number;
    activeMembers: number;
    pointsIssued: number;
    pointsRedeemed: number;
}

const LoyaltyContext = createContext<LoyaltyContextType | undefined>(undefined);

export const LoyaltyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [programs] = useState<LoyaltyProgram[]>([
        { id: 'prog-1', name: 'Elite Rewards 2026', type: 'Points', earnRate: 0.05, redeemRate: 1, minRedeemPoints: 500, isActive: true }
    ]);

    const [tiers] = useState<LoyaltyTierConfig[]>([
        { tier: 'Silver', threshold: 0, multiplier: 1, benefits: ['Standard support'] },
        { tier: 'Gold', threshold: 50000, multiplier: 1.5, benefits: ['Priority checkout', 'Free delivery'] },
        { tier: 'Platinum', threshold: 150000, multiplier: 2, benefits: ['Personal concierge', 'Exclusive previews', 'Zero fees'] }
    ]);

    const [transactions, setTransactions] = useState<LoyaltyTransaction[]>([]);
    const [campaigns] = useState<LoyaltyCampaign[]>([
        { id: 'camp-1', name: 'New Year Double Points', startDate: '2026-01-01', endDate: '2026-01-15', type: 'DoublePoints', targetSegment: 'All', status: 'Completed' },
        { id: 'camp-2', name: 'Platinum Exclusive Flash', startDate: '2026-02-05', endDate: '2026-02-10', type: 'FlashSale', targetSegment: 'Platinum', status: 'Scheduled' }
    ]);
    const [members, setMembers] = useState<LoyaltyMember[]>([]);

    React.useEffect(() => {
        const fetchMembers = async () => {
            try {
                const data = await shopApi.getLoyaltyMembers();
                // Map DB snake_case to CamelCase if necessary, or ensure types match
                setMembers(data);
            } catch (error) {
                console.error('Failed to fetch loyalty members:', error);
            }
        };
        fetchMembers();
    }, []);

    const addMember = useCallback(async (memberData: any) => {
        try {
            const apiPayload = {
                name: memberData.customerName,
                phone: memberData.phone,
                email: memberData.email,
                cardNumber: memberData.cardNumber
            };

            const response = await shopApi.createLoyaltyMember(apiPayload) as any;

            const newMember: LoyaltyMember = {
                ...memberData,
                id: response && response.id ? response.id : crypto.randomUUID(),
                joinDate: new Date().toISOString(),
                pointsBalance: 0,
                lifetimePoints: 0,
                status: 'Active',
                tier: 'Silver',
                visitCount: 0,
                totalSpend: 0
            };
            setMembers(prev => [...prev, newMember]);
        } catch (error) {
            console.error('Failed to create member:', error);
            // Fallback
            const newMember: LoyaltyMember = {
                ...memberData,
                id: crypto.randomUUID(),
                joinDate: new Date().toISOString(),
                pointsBalance: 0,
                lifetimePoints: 0,
                status: 'Active',
                tier: 'Silver',
                visitCount: 0,
                totalSpend: 0
            };
            setMembers(prev => [...prev, newMember]);
        }
    }, []);

    const updateMemberTier = useCallback((memberId: string) => {
        setMembers(prev => prev.map(m => {
            if (m.id === memberId) {
                const newTier = tiers.reduce((acc, t) => m.totalSpend >= t.threshold ? t.tier : acc, 'Silver' as LoyaltyTier);
                return { ...m, tier: newTier };
            }
            return m;
        }));
    }, [tiers]);

    const processLoyalty = useCallback((customerId: string, saleAmount: number, saleId: string, isRedemption = false, redeemPoints = 0) => {
        setMembers(prev => prev.map(member => {
            if (member.customerId === customerId) {
                const program = programs[0];
                let pointsChange = 0;
                let txType: any = 'Earn';

                if (isRedemption) {
                    pointsChange = -redeemPoints;
                    txType = 'Redeem';
                } else {
                    const tierMultiplier = tiers.find(t => t.tier === member.tier)?.multiplier || 1;
                    pointsChange = Math.floor(saleAmount * program.earnRate * tierMultiplier);
                }

                const transaction: LoyaltyTransaction = {
                    id: crypto.randomUUID(),
                    memberId: member.id,
                    type: txType,
                    points: Math.abs(pointsChange),
                    value: isRedemption ? redeemPoints * 0.1 : 0, // Mock conversion
                    referenceId: saleId,
                    timestamp: new Date().toISOString()
                };

                setTransactions(txs => [transaction, ...txs]);

                const newTotalSpend = isRedemption ? member.totalSpend : member.totalSpend + saleAmount;
                const newPoints = member.pointsBalance + pointsChange;

                return {
                    ...member,
                    pointsBalance: newPoints,
                    lifetimePoints: pointsChange > 0 ? member.lifetimePoints + pointsChange : member.lifetimePoints,
                    totalSpend: newTotalSpend,
                    visitCount: isRedemption ? member.visitCount : member.visitCount + 1
                };
            }
            return member;
        }));
    }, [programs, tiers]);

    const stats = useMemo(() => ({
        totalMembers: members.length,
        activeMembers: members.filter(m => m.status === 'Active').length,
        pointsIssued: transactions.filter(t => t.type === 'Earn' || t.type === 'Bonus').reduce((sum, t) => sum + t.points, 0),
        pointsRedeemed: transactions.filter(t => t.type === 'Redeem').reduce((sum, t) => sum + t.points, 0)
    }), [members, transactions]);

    return (
        <LoyaltyContext.Provider value={{
            members, programs, transactions, tiers, campaigns,
            addMember, processLoyalty, updateMemberTier, ...stats
        }}>
            {children}
        </LoyaltyContext.Provider>
    );
};

export const useLoyalty = () => {
    const context = useContext(LoyaltyContext);
    if (!context) throw new Error('useLoyalty must be used within a LoyaltyProvider');
    return context;
};
