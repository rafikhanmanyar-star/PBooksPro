import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Quotation, ContactType, TransactionType } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import ComboBox from '../ui/ComboBox';
import { CURRENCY, ICONS } from '../../constants';
import { exportJsonToExcel } from '../../services/exportService';
import ReportHeader from './ReportHeader';
import ReportFooter from './ReportFooter';
import { formatDate } from '../../utils/dateUtils';
import PrintButton from '../ui/PrintButton';
import { usePrintContext } from '../../context/PrintContext';
import { STANDARD_PRINT_STYLES } from '../../utils/printStyles';

interface CategoryVendorComparison {
    categoryId: string;
    categoryName: string;
    vendors: {
        vendorId: string;
        vendorName: string;
        quotations: Quotation[];
        bestPrice: number;
        averagePrice: number;
        quotationCount: number;
    }[];
}

interface VendorComparisonReportProps {
    context?: 'Rental' | 'Project';
}

const VendorComparisonReport: React.FC<VendorComparisonReportProps> = ({ context }) => {
    const { state } = useAppContext();
    const { print: triggerPrint } = usePrintContext();
    const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');

    // Get all expense categories
    const expenseCategories = useMemo(() => {
        return state.categories.filter(c => c.type === TransactionType.EXPENSE);
    }, [state.categories]);

    const categoryItems = useMemo(() => {
        return [{ id: 'all', name: 'All Categories' }, ...expenseCategories];
    }, [expenseCategories]);

    // Get all quotations
    const quotations = useMemo(() => {
        return state.quotations || [];
    }, [state.quotations]);

    // Get all vendors
    const vendors = useMemo(() => {
        return state.contacts.filter(c => c.type === ContactType.VENDOR);
    }, [state.contacts]);

    // Build comparison data by category
    const comparisonData = useMemo<CategoryVendorComparison[]>(() => {
        const categoryMap = new Map<string, Map<string, Quotation[]>>();

        // Group quotations by category and vendor
        quotations.forEach(quotation => {
            quotation.items.forEach(item => {
                if (selectedCategoryId !== 'all' && item.categoryId !== selectedCategoryId) {
                    return;
                }

                if (!categoryMap.has(item.categoryId)) {
                    categoryMap.set(item.categoryId, new Map());
                }

                const vendorMap = categoryMap.get(item.categoryId)!;
                if (!vendorMap.has(quotation.vendorId)) {
                    vendorMap.set(quotation.vendorId, []);
                }

                vendorMap.get(quotation.vendorId)!.push(quotation);
            });
        });

        // Build the comparison structure
        const result: CategoryVendorComparison[] = [];

        categoryMap.forEach((vendorMap, categoryId) => {
            const category = state.categories.find(c => c.id === categoryId);
            if (!category) return;

            const vendorComparisons: CategoryVendorComparison['vendors'] = [];

            vendorMap.forEach((quotationList, vendorId) => {
                const vendor = vendors.find(v => v.id === vendorId);
                if (!vendor) return;

                // Calculate prices for this category from all quotations
                const prices: number[] = [];
                quotationList.forEach(quotation => {
                    quotation.items
                        .filter(item => item.categoryId === categoryId)
                        .forEach(item => {
                            prices.push(item.pricePerQuantity);
                        });
                });

                if (prices.length === 0) return;

                const bestPrice = Math.min(...prices);
                const averagePrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;

                vendorComparisons.push({
                    vendorId,
                    vendorName: vendor.name,
                    quotations: quotationList,
                    bestPrice,
                    averagePrice,
                    quotationCount: quotationList.length
                });
            });

            if (vendorComparisons.length > 0) {
                // Sort vendors by best price (ascending)
                vendorComparisons.sort((a, b) => a.bestPrice - b.bestPrice);

                result.push({
                    categoryId,
                    categoryName: category.name,
                    vendors: vendorComparisons
                });
            }
        });

        // Sort categories by name
        result.sort((a, b) => a.categoryName.localeCompare(b.categoryName));

        return result;
    }, [quotations, vendors, state.categories, selectedCategoryId]);

    const handleExport = () => {
        const data: any[] = [];
        
        comparisonData.forEach(category => {
            category.vendors.forEach((vendor, index) => {
                data.push({
                    Category: category.categoryName,
                    Vendor: vendor.vendorName,
                    'Best Price': vendor.bestPrice,
                    'Average Price': vendor.averagePrice.toFixed(2),
                    'Quotation Count': vendor.quotationCount,
                    Rank: index + 1
                });
            });
        });

        exportJsonToExcel(data, 'vendor-comparison.xlsx', 'Vendor Comparison Report');
    };


    return (
        <div className="flex flex-col h-full space-y-4">
            <style>{STANDARD_PRINT_STYLES}</style>
            
            {/* Toolbar */}
            <div className="flex-shrink-0">
                <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm no-print">
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="w-64 flex-shrink-0">
                            <ComboBox 
                                items={categoryItems} 
                                selectedId={selectedCategoryId} 
                                onSelect={(item) => setSelectedCategoryId(item?.id || 'all')} 
                                allowAddNew={false}
                                placeholder="Filter by Category"
                            />
                        </div>

                        <div className="flex items-center gap-2 ml-auto">
                            <Button variant="secondary" size="sm" onClick={handleExport} className="whitespace-nowrap bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300">
                                <div className="w-4 h-4 mr-1">{ICONS.export}</div> Export
                            </Button>
                            <PrintButton
                                variant="secondary"
                                size="sm"
                                onPrint={() => triggerPrint('REPORT', { elementId: 'printable-area' })}
                                className="whitespace-nowrap"
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-grow overflow-y-auto printable-area min-h-0" id="printable-area">
                <Card className="min-h-full">
                    <ReportHeader />
                    <h3 className="text-2xl font-bold text-center mb-4">
                        Vendor Comparison Report {context ? `(${context})` : ''}
                    </h3>
                    <div className="text-center text-sm text-slate-500 mb-6">
                        <p>Best vendor comparison based on quotations submitted per category</p>
                        {selectedCategoryId !== 'all' && (
                            <p className="font-semibold mt-1">
                                Category: {state.categories.find(c => c.id === selectedCategoryId)?.name}
                            </p>
                        )}
                    </div>
                    
                    <div className="space-y-6">
                        {comparisonData.length > 0 ? comparisonData.map(category => (
                            <div key={category.categoryId} className="border border-slate-200 rounded-lg overflow-hidden">
                                <div className="bg-gradient-to-r from-indigo-50 to-blue-50 px-4 py-3 border-b border-slate-200">
                                    <h4 className="text-lg font-bold text-slate-900">{category.categoryName}</h4>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                                        <thead className="bg-slate-50">
                                            <tr>
                                                <th className="px-4 py-3 text-left font-semibold text-slate-600">Rank</th>
                                                <th className="px-4 py-3 text-left font-semibold text-slate-600">Vendor</th>
                                                <th className="px-4 py-3 text-right font-semibold text-slate-600">Best Price</th>
                                                <th className="px-4 py-3 text-right font-semibold text-slate-600">Average Price</th>
                                                <th className="px-4 py-3 text-center font-semibold text-slate-600">Quotations</th>
                                                <th className="px-4 py-3 text-left font-semibold text-slate-600">Quotation Dates</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-200 bg-white">
                                            {category.vendors.map((vendor, index) => (
                                                <tr 
                                                    key={vendor.vendorId} 
                                                    className={index === 0 ? 'bg-emerald-50' : 'hover:bg-slate-50'}
                                                >
                                                    <td className="px-4 py-3">
                                                        {index === 0 ? (
                                                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold">
                                                                1
                                                            </span>
                                                        ) : (
                                                            <span className="text-slate-600 font-medium">{index + 1}</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 font-medium text-slate-800">
                                                        {vendor.vendorName}
                                                        {index === 0 && (
                                                            <span className="ml-2 text-xs text-emerald-600 font-semibold">(Best Price)</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-bold text-slate-900 tabular-nums">
                                                        {CURRENCY} {vendor.bestPrice.toLocaleString()}
                                                    </td>
                                                    <td className="px-4 py-3 text-right text-slate-700 tabular-nums">
                                                        {CURRENCY} {vendor.averagePrice.toFixed(2)}
                                                    </td>
                                                    <td className="px-4 py-3 text-center text-slate-700">
                                                        {vendor.quotationCount}
                                                    </td>
                                                    <td className="px-4 py-3 text-xs text-slate-500">
                                                        {vendor.quotations
                                                            .map(q => formatDate(q.date))
                                                            .slice(0, 3)
                                                            .join(', ')}
                                                        {vendor.quotations.length > 3 && ` +${vendor.quotations.length - 3} more`}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )) : (
                            <div className="text-center py-16">
                                <p className="text-slate-500">
                                    {selectedCategoryId !== 'all' 
                                        ? 'No quotations found for the selected category.'
                                        : 'No quotations found. Create quotations to see vendor comparisons.'}
                                </p>
                            </div>
                        )}
                    </div>
                    <ReportFooter />
                </Card>
            </div>
        </div>
    );
};

export default VendorComparisonReport;

