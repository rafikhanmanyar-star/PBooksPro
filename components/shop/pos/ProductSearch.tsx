
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { usePOS } from '../../../context/POSContext';
import { ICONS, CURRENCY } from '../../../constants';
import { POSProduct } from '../../../types/pos';
import Card from '../../ui/Card';

import { shopApi } from '../../../services/api/shopApi';

// Mock Products for blueprint (Fallback)
const MOCK_PRODUCTS: POSProduct[] = [
    { id: '1', sku: '1001', barcode: '8901', name: 'Premium Cotton T-Shirt', price: 1200, cost: 600, categoryId: 'cat1', taxRate: 17, isTaxInclusive: true, unit: 'pcs', stockLevel: 45 },
    { id: '2', sku: '1002', barcode: '8902', name: 'Denim Jeans Slim Fit', price: 2500, cost: 1200, categoryId: 'cat1', taxRate: 17, isTaxInclusive: true, unit: 'pcs', stockLevel: 20 },
    { id: '3', sku: '2001', barcode: '8903', name: 'Wireless Bluetooth Earbuds', price: 4500, cost: 2000, categoryId: 'cat2', taxRate: 17, isTaxInclusive: true, unit: 'pcs', stockLevel: 15 },
    { id: '4', sku: '2002', barcode: '8904', name: 'Smart Watch Series 7', price: 15000, cost: 8000, categoryId: 'cat2', taxRate: 17, isTaxInclusive: true, unit: 'pcs', stockLevel: 8 },
    { id: '5', sku: '3001', barcode: '8905', name: 'Organic Honey 500g', price: 850, cost: 400, categoryId: 'cat3', taxRate: 0, isTaxInclusive: true, unit: 'jar', stockLevel: 60 },
    { id: '6', sku: '3002', barcode: '8906', name: 'Fresh Milk 1L', price: 180, cost: 150, categoryId: 'cat3', taxRate: 0, isTaxInclusive: true, unit: 'pack', stockLevel: 100 },
];

const CATEGORIES = [
    { id: 'all', name: 'All Items' },
    { id: 'cat1', name: 'Apparel' },
    { id: 'cat2', name: 'Electronics' },
    { id: 'cat3', name: 'Grocery' },
];

const ProductSearch: React.FC = () => {
    const { addToCart, searchQuery, setSearchQuery } = usePOS();
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [products, setProducts] = useState<POSProduct[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Load products from API
    useEffect(() => {
        const loadProducts = async () => {
            try {
                // In a real scenario, we might check if products allow public access or generic access
                // For now, assuming auth header is handled by client or unnecessary for read if generic
                const response = await shopApi.getProducts();
                if (response && Array.isArray(response)) {
                    const mapped: POSProduct[] = response.map((p: any) => ({
                        id: p.id,
                        sku: p.sku || 'N/A',
                        barcode: p.barcode || '',
                        name: p.name,
                        price: Number(p.retail_price) || Number(p.price) || 0,
                        cost: Number(p.cost_price) || 0, // Fallback if not available
                        categoryId: p.category_id || 'others',
                        taxRate: Number(p.tax_rate) || 0,
                        isTaxInclusive: true, // Default assumption
                        unit: p.unit || 'pcs',
                        stockLevel: Number(p.stock_quantity) || 0,
                        imageUrl: p.image_url
                    }));
                    setProducts(mapped);
                } else {
                    // Fallback or empty if response is valid but not array (shouldn't happen with correct types)
                    console.warn("API returned non-array:", response);
                    setProducts([]);
                }
            } catch (error) {
                console.warn("Failed to fetch products from API, using mock data:", error);
                setProducts(MOCK_PRODUCTS);
            } finally {
                setIsLoading(false);
            }
        };

        loadProducts();
    }, []);

    // Keep focus on search input for barcode scanner
    useEffect(() => {
        const interval = setInterval(() => {
            if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
                searchInputRef.current?.focus();
            }
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    const filteredProducts = useMemo(() => {
        const query = searchQuery.toLowerCase().trim();
        if (!query) return products.filter(p => selectedCategory === 'all' || p.categoryId === selectedCategory);

        return products.filter(p => {
            const barcode = (p.barcode || '').toLowerCase();
            const sku = (p.sku || '').toLowerCase();
            const name = (p.name || '').toLowerCase();

            // Priority 1: Exact barcode match
            if (barcode === query) return true;

            // Priority 2: Partial barcode match
            if (barcode.includes(query)) return true;

            // Priority 3: Search in other fields (respected by category)
            const matchesOther = name.includes(query) ||
                sku.includes(query) ||
                p.categoryId.toLowerCase().includes(query) ||
                p.price.toString().includes(query) ||
                p.unit.toLowerCase().includes(query);

            const matchesCat = selectedCategory === 'all' || p.categoryId === selectedCategory;

            return matchesOther && matchesCat;
        }).sort((a, b) => {
            const aBarcode = (a.barcode || '').toLowerCase();
            const bBarcode = (b.barcode || '').toLowerCase();

            // Exact barcode matches first
            if (aBarcode === query && bBarcode !== query) return -1;
            if (bBarcode === query && aBarcode !== query) return 1;

            // Partial barcode matches second
            const aPartial = aBarcode.includes(query);
            const bPartial = bBarcode.includes(query);
            if (aPartial && !bPartial) return -1;
            if (bPartial && !aPartial) return 1;

            return a.name.localeCompare(b.name);
        });
    }, [searchQuery, selectedCategory, products]);

    // Handle barcode "instant add"
    useEffect(() => {
        const query = searchQuery.trim();
        if (!query || query.length < 3) return; // Prevent too short matches

        const exactMatch = products.find(p => p.barcode && p.barcode.toLowerCase() === query.toLowerCase());
        if (exactMatch) {
            addToCart(exactMatch);
            // Search will be cleared by addToCart via context
        }
    }, [searchQuery, addToCart, products]);

    return (
        <div className="flex flex-col h-full bg-slate-50">
            {/* Search Bar */}
            <div className="p-4 bg-white border-b border-slate-200 sticky top-0 z-10">
                <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 group-focus-within:text-indigo-500 transition-colors">
                        {ICONS.search}
                    </div>
                    <input
                        ref={searchInputRef}
                        id="pos-product-search"
                        type="text"
                        className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl leading-5 bg-slate-100 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-all shadow-inner"
                        placeholder="Scan Barcode / Search Name, SKU, Price... (F4)"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            {/* Category Tabs */}
            <div className="flex gap-2 overflow-x-auto p-4 scrollbar-none bg-white border-b border-slate-100 shadow-sm">
                {CATEGORIES.map(cat => (
                    <button
                        key={cat.id}
                        onClick={() => setSelectedCategory(cat.id)}
                        className={`whitespace-nowrap px-4 py-2 rounded-lg text-xs font-bold transition-all ${selectedCategory === cat.id
                            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 ring-2 ring-indigo-300 ring-offset-1'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                    >
                        {cat.name}
                    </button>
                ))}
            </div>

            {/* Product Grid */}
            <div className="flex-1 overflow-y-auto p-4 content-start">
                <div className="grid grid-cols-2 gap-3">
                    {filteredProducts.map(product => (
                        <button
                            key={product.id}
                            onClick={() => addToCart(product)}
                            className="group relative flex flex-col p-3 bg-white border border-slate-200 rounded-xl text-left hover:border-indigo-400 hover:shadow-md active:scale-95 transition-all outline-none"
                        >
                            <div className="mb-2 w-full aspect-square bg-slate-50 rounded-lg flex items-center justify-center border border-slate-100 text-slate-300 group-hover:text-indigo-300 transition-colors overflow-hidden relative">
                                {product.imageUrl ? (
                                    <img src={product.imageUrl} alt={product.name} className="object-cover w-full h-full" />
                                ) : (
                                    React.cloneElement(ICONS.package as React.ReactElement, { size: 32 } as any)
                                )}
                                <div className="absolute bottom-1 right-1 flex flex-col items-end gap-0.5">
                                    {product.barcode && (
                                        <div className="px-1.5 py-0.5 bg-indigo-600 text-white rounded text-[10px] font-mono font-bold shadow-sm">
                                            {product.barcode}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="text-xs font-bold text-slate-800 line-clamp-2 leading-tight mb-1">{product.name}</div>
                            {product.barcode && (
                                <div className="text-[9px] font-mono text-indigo-400 mb-2 truncate">Barcode: {product.barcode}</div>
                            )}
                            <div className="mt-auto flex items-center justify-between">
                                <span className="text-sm font-black text-indigo-600 font-mono">{CURRENCY} {product.price}</span>
                                <span className={`text-[10px] font-bold px-1.5 rounded ${product.stockLevel < 10 ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-500'}`}>
                                    {product.stockLevel}
                                </span>
                            </div>

                            {/* Hover Overlay */}
                            <div className="absolute inset-0 bg-indigo-600/5 opacity-0 group-hover:opacity-100 rounded-xl transition-opacity pointer-events-none ring-2 ring-indigo-500/0 group-hover:ring-indigo-500/50"></div>
                        </button>
                    ))}

                    {filteredProducts.length === 0 && (
                        <div className="col-span-2 flex flex-col items-center justify-center p-12 text-slate-400 opacity-50">
                            {ICONS.search}
                            <span className="mt-2 text-sm font-medium">No items found</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ProductSearch;
