import React, { useState, useEffect, useMemo, memo, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../services/api/client';
import Button from '../ui/Button';
import Card from '../ui/Card';
import Input from '../ui/Input';
import Modal from '../ui/Modal';
import ComboBox from '../ui/ComboBox';
import { useNotification } from '../../context/NotificationContext';
import {
  Search,
  Plus,
  Filter,
  Trash2,
  ChevronRight,
  Globe,
  ShieldCheck,
  Clock,
  Tag,
  Briefcase,
  Image as ImageIcon,
  MessageSquare,
  Phone,
  Mail,
  MoreVertical,
  Layers,
  LayoutGrid,
  BarChart3,
  X,
  TrendingUp,
  Award,
  Zap,
  CheckCircle2,
  Gift,
  Heart
} from 'lucide-react';

export interface MarketplaceCategory {
  id: string;
  name: string;
  display_order?: number;
}

export interface MarketplaceAdImage {
  id: string;
  content_type: string;
  data_base64: string | null;
}

export interface MarketplaceAd {
  id: string;
  tenant_id: string;
  title: string;
  description?: string;
  category_id: string;
  category_name?: string;
  product_brand?: string;
  product_model?: string;
  min_order_quantity?: number;
  unit?: string;
  specifications?: string;
  contact_email?: string;
  contact_phone?: string;
  status?: string;
  views?: number;
  likes?: number;
  created_at?: string;
  updated_at?: string;
  supplier_name?: string;
  supplier_company_name?: string;
  supplier_email?: string;
  first_image?: MarketplaceAdImage | null;
  images?: MarketplaceAdImage[];
}

interface MarketplacePageProps {
  isSupplier: boolean;
}

const MarketplacePage: React.FC<MarketplacePageProps> = ({ isSupplier }) => {
  const { tenant } = useAuth();
  const { showToast } = useNotification();
  const [categories, setCategories] = useState<MarketplaceCategory[]>([]);
  const [ads, setAds] = useState<MarketplaceAd[]>([]);
  const [myAds, setMyAds] = useState<MarketplaceAd[]>([]);
  const [adsToday, setAdsToday] = useState<{ count: number; limit: number }>({ count: 0, limit: 2 });
  const [loading, setLoading] = useState(true);
  const [loadingMy, setLoadingMy] = useState(false);

  const [filterCategory, setFilterCategory] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const [selectedAd, setSelectedAd] = useState<MarketplaceAd | null>(null);
  const [selectedAdFull, setSelectedAdFull] = useState<MarketplaceAd | null>(null);
  const [showPostForm, setShowPostForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showSupplierConsole, setShowSupplierConsole] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [showBenefits, setShowBenefits] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  const scrollToResults = () => {
    resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const categoryItems = useMemo(() =>
    categories.map(c => ({ id: c.id, name: c.name })),
    [categories]
  );

  const loadCategories = async () => {
    try {
      const list = await apiClient.get<MarketplaceCategory[]>('/marketplace/categories');
      setCategories(list || []);
    } catch (e) {
      console.error('Load marketplace categories:', e);
    }
  };

  const loadAds = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filterCategory) params.set('category', filterCategory);
      if (filterSearch.trim()) params.set('search', filterSearch.trim());
      params.set('sort', sort);
      const list = await apiClient.get<MarketplaceAd[]>(`/marketplace?${params.toString()}`);
      setAds(list || []);
    } catch (e) {
      console.error('Load marketplace ads:', e);
      showToast('Failed to load marketplace listings', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadMyAds = async () => {
    if (!isSupplier) return;
    try {
      setLoadingMy(true);
      const list = await apiClient.get<MarketplaceAd[]>('/marketplace/my-ads');
      setMyAds(list || []);
    } catch (e) {
      console.error('Load my ads:', e);
    } finally {
      setLoadingMy(false);
    }
  };

  const loadAdsToday = async () => {
    if (!isSupplier) return;
    try {
      const res = await apiClient.get<{ count: number; limit: number }>('/marketplace/ads-today');
      setAdsToday(res || { count: 0, limit: 2 });
    } catch (_e) {
      setAdsToday({ count: 0, limit: 2 });
    }
  };

  const totalViews = useMemo(() =>
    myAds.reduce((sum, ad) => sum + (ad.views || 0), 0),
    [myAds]
  );

  const totalLikes = useMemo(() =>
    myAds.reduce((sum, ad) => sum + (ad.likes || 0), 0),
    [myAds]
  );

  const handleLike = async (adId: string) => {
    try {
      const res = await apiClient.post<{ likes: number }>(`/marketplace/${adId}/like`, {});
      if (selectedAdFull && selectedAdFull.id === adId) {
        setSelectedAdFull({ ...selectedAdFull, likes: res.likes });
      }
      setAds(prev => prev.map(a => a.id === adId ? { ...a, likes: res.likes } : a));
    } catch (e) {
      console.error('Like error:', e);
    }
  };

  useEffect(() => { loadCategories(); }, []);
  useEffect(() => { loadAds(); }, [filterCategory, filterSearch, sort]);
  useEffect(() => {
    if (isSupplier) {
      loadMyAds();
      loadAdsToday();
    }
  }, [isSupplier]);

  const canPostMore = isSupplier && adsToday.count < adsToday.limit;

  const openAdDetail = async (ad: MarketplaceAd) => {
    setSelectedAd(ad);
    setSelectedAdFull(null);
    setActiveImageIndex(0);
    try {
      const full = await apiClient.get<MarketplaceAd>(`/marketplace/${ad.id}`);
      setSelectedAdFull(full);
    } catch (_e) {
      setSelectedAdFull(ad);
    }
  };

  const closeAdDetail = () => {
    setSelectedAd(null);
    setSelectedAdFull(null);
    setActiveImageIndex(0);
  };

  const displayAd = selectedAdFull || selectedAd;

  return (
    <div className="h-full flex flex-col bg-slate-50 overflow-hidden font-sans">
      {/* Premium Gradient Header Section */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200 relative overflow-hidden">
        {/* Background Decorations */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50 rounded-full blur-3xl opacity-50 -mr-32 -mt-32" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-green-50 rounded-full blur-3xl opacity-50 -ml-32 -mb-32" />

        <div className="relative px-6 py-6 max-w-[1600px] mx-auto w-full">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Globe className="w-6 h-6 text-indigo-600" />
                <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Global Marketplace</h1>
              </div>
              <p className="text-sm text-slate-500 font-medium">Connect. Trade. Grow. Your B2B success starts here.</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative group min-w-[300px]">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 group-focus-within:text-indigo-500 transition-colors">
                  <Search className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  placeholder="Search products, suppliers, brands..."
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:text-slate-400 font-medium"
                />
              </div>

              <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl p-0.5">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  <BarChart3 className="w-4 h-4 rotate-90" />
                </button>
              </div>

              {isSupplier && (
                <div className="flex items-center gap-2 ml-2">
                  <button
                    onClick={() => setShowSupplierConsole(!showSupplierConsole)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm ${showSupplierConsole
                      ? 'bg-slate-900 text-white hover:bg-black'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                      }`}
                  >
                    <Briefcase className="w-4 h-4" />
                    Supplier Console
                  </button>
                  <Button
                    variant="primary"
                    disabled={!canPostMore}
                    onClick={() => setShowPostForm(true)}
                    className="rounded-xl px-5 py-2.5 font-bold shadow-lg shadow-green-600/20 active:scale-95 transition-transform"
                  >
                    <Plus className="w-4 h-4" />
                    List Product
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Modern Sidebar Filters */}
        <aside className="hidden xl:flex w-72 flex-col bg-white border-r border-slate-200 flex-shrink-0 animate-fade-in">
          <div className="p-6 space-y-8 h-full overflow-y-auto">
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Layers className="w-3.5 h-3.5" />
                Categories
              </h3>
              <div className="space-y-1">
                <button
                  onClick={() => setFilterCategory('')}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm font-semibold transition-all group flex items-center justify-between ${!filterCategory ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                >
                  <span>All Industries</span>
                  <ChevronRight className={`w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity ${!filterCategory ? 'opacity-100' : ''}`} />
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setFilterCategory(cat.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm font-semibold transition-all group flex items-center justify-between ${filterCategory === cat.id ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:bg-slate-50'
                      }`}
                  >
                    <span className="truncate">{cat.name}</span>
                    <ChevronRight className={`w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity ${filterCategory === cat.id ? 'opacity-100' : ''}`} />
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Filter className="w-3.5 h-3.5" />
                Sort By
              </h3>
              <div className="grid grid-cols-1 gap-2">
                <button
                  onClick={() => setSort('newest')}
                  className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all text-left ${sort === 'newest' ? 'bg-slate-100 text-slate-900 shadow-inner' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                >
                  Recently Added
                </button>
                <button
                  onClick={() => setSort('oldest')}
                  className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all text-left ${sort === 'oldest' ? 'bg-slate-100 text-slate-900 shadow-inner' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                >
                  Legacy Listings
                </button>
              </div>
            </div>

            {isSupplier && (
              <div className="p-4 bg-indigo-600 rounded-2xl relative overflow-hidden group">
                <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative z-10 space-y-2">
                  <h4 className="text-white font-bold text-sm">Listing Status</h4>
                  <div className="flex justify-between text-xs text-indigo-100 font-medium">
                    <span>Daily Limit</span>
                    <span>{adsToday.count} / {adsToday.limit}</span>
                  </div>
                  <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-white transition-all duration-500 ease-out"
                      style={{ width: `${(adsToday.count / adsToday.limit) * 100}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-indigo-100/70 leading-relaxed font-medium pt-1">
                    Upgrade to Premium for unlimited global listings.
                  </p>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto bg-slate-50/50 relative">
          {/* Supplier Console Overlay */}
          {isSupplier && showSupplierConsole && (
            <div className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-slate-200 p-6 animate-slide-in-up">
              <div className="max-w-[1200px] mx-auto space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-600/20">
                      <BarChart3 className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">Supplier Performance</h2>
                      <p className="text-xs text-slate-500 font-medium">Manage and optimize your global presence</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowSupplierConsole(false)}
                    className="p-2 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card className="p-4 bg-white border-slate-200 shadow-sm hover:translate-y-[-2px] transition-transform">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Total Ads</p>
                    <h3 className="text-2xl font-black text-indigo-600">{myAds.length}</h3>
                  </Card>
                  <Card className="p-4 bg-white border-slate-200 shadow-sm hover:translate-y-[-2px] transition-transform">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Active Reach</p>
                    <div className="flex items-end gap-2">
                      <h3 className="text-2xl font-black text-slate-900">Verified</h3>
                      <ShieldCheck className="w-5 h-5 text-green-500 mb-1.5" />
                    </div>
                  </Card>
                  {/* Additional Metrics placeholders */}
                  <Card className="p-4 bg-white border-slate-200 shadow-sm hover:translate-y-[-2px] transition-transform">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Total Reach</p>
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col">
                        <span className="text-2xl font-black text-slate-900">{totalViews.toLocaleString()}</span>
                        <span className="text-[10px] text-slate-400 font-bold uppercase">Views</span>
                      </div>
                      <div className="w-px h-8 bg-slate-100" />
                      <div className="flex flex-col">
                        <span className="text-2xl font-black text-indigo-600">{totalLikes.toLocaleString()}</span>
                        <span className="text-[10px] text-slate-400 font-bold uppercase">Likes</span>
                      </div>
                    </div>
                  </Card>
                  <Card className="p-4 bg-white border-slate-200 shadow-sm hover:translate-y-[-2px] transition-transform">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Performance</p>
                    <div className="flex items-end gap-1">
                      <h3 className="text-2xl font-black text-slate-900">
                        {myAds.length > 0 ? (totalViews / myAds.length).toFixed(1) : '0'}
                      </h3>
                      <span className="text-[10px] text-slate-400 font-bold pb-1.5">avg/ad</span>
                    </div>
                  </Card>
                </div>

                {myAds.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold text-slate-800">Your Listings Management</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {myAds.map((ad) => (
                        <div
                          key={ad.id}
                          className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white transition-colors group cursor-default"
                        >
                          <div className="w-12 h-12 bg-slate-200 rounded-lg overflow-hidden flex-shrink-0">
                            {ad.first_image?.data_base64 ? (
                              <img
                                src={`data:${ad.first_image.content_type};base64,${ad.first_image.data_base64}`}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-slate-400">
                                <ImageIcon className="w-5 h-5" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-xs font-bold text-slate-900 truncate">{ad.title}</h4>
                            <div className="flex items-center gap-2">
                              <p className="text-[10px] text-slate-400 font-medium">Added {ad.created_at ? new Date(ad.created_at).toLocaleDateString() : 'N/A'}</p>
                              <div className="flex items-center gap-1 text-[10px] text-indigo-500 font-bold">
                                <TrendingUp className="w-3 h-3 text-indigo-400" />
                                {ad.views || 0}
                              </div>
                              <div className="flex items-center gap-1 text-[10px] text-rose-500 font-bold">
                                <Heart className="w-3 h-3 text-rose-400 fill-rose-400/10" />
                                {ad.likes || 0}
                              </div>
                              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${ad.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-600' :
                                ad.status === 'PENDING' ? 'bg-amber-100 text-amber-600' :
                                  'bg-rose-100 text-rose-600'
                                }`}>
                                {ad.status}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => openAdDetail(ad)}
                              className="p-1.5 text-slate-500 hover:text-indigo-600 transition-colors bg-white rounded-lg shadow-sm border border-slate-200"
                            >
                              <ShieldCheck className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (!window.confirm('Delete this listing permanently?')) return;
                                try {
                                  await apiClient.delete(`/marketplace/${ad.id}`);
                                  showToast('Listing removed', 'success');
                                  loadMyAds();
                                  loadAds();
                                  loadAdsToday();
                                } catch (e: any) {
                                  showToast(e?.message || 'Delete failed', 'error');
                                }
                              }}
                              className="p-1.5 text-slate-500 hover:text-red-600 transition-colors bg-white rounded-lg shadow-sm border border-slate-200"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="p-6 lg:p-10 max-w-[1400px] mx-auto w-full space-y-8 animate-fade-in">
            {/* Market Browse Section */}
            {!filterCategory && !filterSearch && (
              <div className="relative rounded-[2.5rem] bg-slate-900 overflow-hidden p-8 lg:p-14 mb-4 group shadow-2xl">
                {/* Visual Decorations */}
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-600/20 rounded-full blur-[100px] -mr-64 -mt-64 animate-pulse" />
                <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-emerald-600/10 rounded-full blur-[100px] -ml-64 -mb-64" />

                <div className="relative z-10 max-w-3xl space-y-8">
                  <div className="inline-flex items-center gap-2.5 px-4 py-1.5 bg-white/10 backdrop-blur-xl rounded-full border border-white/20 text-indigo-300 text-[10px] font-black uppercase tracking-[0.2em]">
                    <Clock className="w-3.5 h-3.5" />
                    Global Trading Active
                  </div>
                  <h2 className="text-4xl lg:text-7xl font-black leading-[1.1] tracking-tighter text-white">
                    Revolutionize Your <br />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-cyan-400 to-emerald-400">Supply Chain</span>
                  </h2>
                  <p className="text-lg lg:text-xl text-slate-400 font-medium leading-relaxed max-w-xl">
                    Connect with verified manufacturers, discover industrial-grade equipment, and scale your business with BizPlanet Global.
                  </p>
                  <div className="flex flex-wrap gap-5 pt-4">
                    <Button
                      variant="primary"
                      onClick={scrollToResults}
                      className="rounded-2xl px-10 py-4 font-black text-base shadow-2xl shadow-green-500/40 hover:scale-105 transition-transform"
                    >
                      Browse Full Market
                    </Button>
                    <button
                      onClick={() => setShowBenefits(true)}
                      className="px-10 py-4 rounded-2xl border border-white/10 text-white hover:bg-white/5 transition-all font-bold text-base backdrop-blur-md"
                    >
                      Supplier Benefits
                    </button>
                  </div>
                </div>

                {/* Decorative Elements */}
                <div className="absolute right-12 bottom-12 hidden lg:block opacity-20 pointer-events-none">
                  <Globe className="w-48 h-48 text-white animate-[spin_20s_linear_infinite]" />
                </div>
              </div>
            )}

            <div className="space-y-6" ref={resultsRef}>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-black text-slate-900">
                    {filterSearch ? `Search Results for "${filterSearch}"` : filterCategory ? categories.find(c => c.id === filterCategory)?.name : 'Featured Products'}
                  </h2>
                  <p className="text-sm text-slate-500 font-medium">{ads.length} verified listings available</p>
                </div>
                {/* Responsive Filter Button for smaller screens */}
                <button className="xl:hidden flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-xl bg-white text-sm font-bold text-slate-700">
                  <Filter className="w-4 h-4" />
                  Filters
                </button>
              </div>

              {loading ? (
                <div className="flex flex-col items-center justify-center py-24 space-y-4">
                  <div className="relative">
                    <div className="w-16 h-16 border-4 border-slate-100 rounded-full border-t-indigo-600 animate-spin" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Globe className="w-6 h-6 text-indigo-500 animate-pulse" />
                    </div>
                  </div>
                  <p className="text-sm text-slate-500 font-bold uppercase tracking-widest animate-pulse">Scanning Global Inventory</p>
                </div>
              ) : ads.length === 0 ? (
                <div className="py-24 text-center space-y-6">
                  <div className="w-24 h-24 bg-slate-100 rounded-3xl flex items-center justify-center mx-auto text-slate-300">
                    <Search className="w-12 h-12" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-lg font-bold text-slate-900">No match found</h3>
                    <p className="text-sm text-slate-500 font-medium max-w-md mx-auto">We couldn't find any listings matching your search criteria. Try broadening your query or choosing a different industry.</p>
                  </div>
                  <Button variant="outline" onClick={() => { setFilterSearch(''); setFilterCategory(''); }} className="rounded-xl font-bold">Clear All Filters</Button>
                </div>
              ) : (
                <div className={`${viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-6 lg:gap-8' : 'flex flex-col gap-4'}`}>
                  {ads.map((ad) => (
                    <Card
                      key={ad.id}
                      className={`group border-none relative flex flex-col overflow-hidden hover:translate-y-[-8px] transition-all duration-500 ${viewMode === 'grid' ? 'h-full bg-white rounded-[2rem] shadow-xl shadow-slate-200/50' : 'flex-row h-48 bg-white rounded-3xl shadow-lg shadow-slate-200/40'} cursor-pointer`}
                      onClick={() => openAdDetail(ad)}
                    >
                      {/* B2B Status Tag */}
                      <div className="absolute top-4 left-4 z-10 flex gap-2">
                        <span className="px-3 py-1 bg-white/90 backdrop-blur-md text-[10px] font-black text-indigo-600 rounded-full shadow-sm flex items-center gap-1 uppercase tracking-tight">
                          <ShieldCheck className="w-3 h-3" />
                          Verified
                        </span>
                      </div>

                      <div className={`${viewMode === 'grid' ? 'aspect-[5/4]' : 'w-64 h-full'} bg-slate-100 flex-shrink-0 relative overflow-hidden`}>
                        {ad.first_image?.data_base64 ? (
                          <img
                            src={`data:${ad.first_image.content_type};base64,${ad.first_image.data_base64}`}
                            alt={ad.title}
                            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-300 border-b border-slate-50">
                            <ImageIcon className="w-12 h-12 stroke-[1.5]" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      </div>

                      <div className={`p-6 flex flex-col flex-1 min-h-0 ${viewMode === 'grid' ? '' : 'justify-center'}`}>
                        <div className="flex items-center gap-2 mb-2">
                          <Tag className="w-3 h-3 text-slate-400" />
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest truncate">
                            {ad.category_name || ad.category_id}
                          </span>
                        </div>

                        <h3 className="font-extrabold text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-2 text-lg leading-tight mb-2 uppercase tracking-tight">
                          {ad.title}
                        </h3>

                        <div className="space-y-3 mt-auto">
                          <div className="flex flex-wrap gap-2 text-xs font-bold text-slate-500">
                            {ad.min_order_quantity != null && (
                              <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-100 rounded-lg">
                                <Plus className="w-3 h-3" />
                                MOQ: {ad.min_order_quantity} {ad.unit || 'Units'}
                              </div>
                            )}
                            {ad.product_brand && (
                              <div className="flex items-center gap-1.5 px-2 py-1 bg-indigo-50 text-indigo-600 rounded-lg border border-indigo-100">
                                <Briefcase className="w-3 h-3" />
                                {ad.product_brand}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center justify-between pt-1">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-black text-slate-500 ring-2 ring-white">
                                {ad.supplier_company_name?.[0] || ad.supplier_name?.[0] || 'S'}
                              </div>
                              <p className="text-[11px] font-bold text-slate-500 truncate max-w-[120px]">
                                {ad.supplier_company_name || ad.supplier_name}
                              </p>
                            </div>
                            <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all" />
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Subtle footer */}
          {!loading && ads.length > 0 && (
            <div className="p-10 text-center border-t border-slate-200 bg-white/50">
              <p className="text-sm font-bold text-slate-400 flex items-center justify-center gap-2">
                <Globe className="w-4 h-4" />
                Empowering Trans-Regional Global Commerce Since 2024
              </p>
            </div>
          )}
        </main>
      </div>

      {/* Supplier Benefits Modal */}
      {showBenefits && (
        <Modal
          isOpen={showBenefits}
          onClose={() => setShowBenefits(false)}
          title=""
          size="lg"
          hideHeader
          className="rounded-[3rem] overflow-hidden border-none shadow-2xl"
        >
          <div className="flex flex-col lg:flex-row h-full">
            {/* Left Decor Column */}
            <div className="w-full lg:w-[350px] bg-indigo-900 p-12 flex flex-col justify-between text-white relative overflow-hidden shrink-0">
              <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/30 rounded-full blur-3xl -mr-32 -mt-32" />
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-600/20 rounded-full blur-3xl -ml-32 -mb-32" />

              <div className="relative z-10">
                <div className="w-16 h-16 bg-white/10 backdrop-blur-xl rounded-[2rem] flex items-center justify-center mb-8 border border-white/20">
                  <Award className="w-8 h-8 text-indigo-300" />
                </div>
                <h2 className="text-4xl font-black leading-tight uppercase tracking-tighter mb-4">
                  Global <br />Partner <br /><span className="text-indigo-400">Program</span>
                </h2>
                <p className="text-indigo-100/60 font-medium leading-relaxed">
                  Join theater of thousands of verified global suppliers and scale your manufacturing distribution.
                </p>
              </div>

              <div className="relative z-10 pt-10 border-t border-white/10">
                <div className="flex items-center gap-3 mb-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  <span className="text-sm font-bold">Verified Status</span>
                </div>
                <p className="text-xs text-indigo-200/50 font-medium">Earn the elite verification badge through our rigorous supply chain vetting process.</p>
              </div>
            </div>

            {/* Right Content Column */}
            <div className="flex-1 bg-white p-8 lg:p-14 overflow-y-auto max-h-[90vh]">
              <div className="flex justify-between items-start mb-12">
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 text-indigo-600 text-[10px] font-black uppercase rounded-full mb-3">
                    <TrendingUp className="w-3 h-3" />
                    Growth Oriented
                  </div>
                  <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tight">Key Advantages</h3>
                </div>
                <button
                  onClick={() => setShowBenefits(false)}
                  className="p-3 bg-slate-50 text-slate-400 hover:text-slate-600 rounded-2xl transition-all"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
                <div className="space-y-3 p-6 rounded-3xl bg-slate-50 border border-slate-100 hover:border-indigo-100 transition-colors">
                  <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center">
                    <Globe className="w-5 h-5" />
                  </div>
                  <h4 className="font-extrabold text-slate-900">Direct global Export</h4>
                  <p className="text-xs text-slate-500 font-medium leading-relaxed">Reach buyers in 120+ countries directly without intermediaries or excessive commission fees.</p>
                </div>
                <div className="space-y-3 p-6 rounded-3xl bg-slate-50 border border-slate-100 hover:border-emerald-100 transition-colors">
                  <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center">
                    <Zap className="w-5 h-5" />
                  </div>
                  <h4 className="font-extrabold text-slate-900">Smart Lead Matching</h4>
                  <p className="text-xs text-slate-500 font-medium leading-relaxed">Our AI connects your catalog with buyers actively searching for your specific category and SKU.</p>
                </div>
              </div>

              {/* Special Promotion Selection - Highlighted */}
              <div className="relative rounded-[2.5rem] bg-indigo-600 p-8 lg:p-10 text-white overflow-hidden shadow-2xl shadow-indigo-600/30">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-[80px] -mr-32 -mt-32" />
                <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
                  <div className="w-20 h-20 bg-white/20 backdrop-blur-md rounded-[2rem] flex items-center justify-center shrink-0 border border-white/20">
                    <Gift className="w-10 h-10 text-white animate-bounce" />
                  </div>
                  <div className="space-y-2">
                    <div className="inline-flex px-3 py-1 bg-emerald-500 text-[10px] font-black uppercase tracking-widest rounded-full mb-1">Limited Offer</div>
                    <h4 className="text-2xl font-black uppercase tracking-tight leading-tight">Zero-Cost Performance Bonus</h4>
                    <p className="text-indigo-100 font-medium text-sm leading-relaxed max-w-lg">
                      We believe in your success. Secure <span className="text-white font-black underline decoration-emerald-400 decoration-2 underline-offset-4">10 unique orders</span> within any calendar month, and your <span className="text-white font-black underline decoration-emerald-400 decoration-2 underline-offset-4">entire next month's subscription</span> is completely free.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-12 pt-10 border-t border-slate-100 flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className="flex -space-x-3">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="w-10 h-10 rounded-full border-2 border-white bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-500">U{i}</div>
                    ))}
                  </div>
                  <p className="text-sm font-bold text-slate-500">Join 850+ verified suppliers</p>
                </div>
                <Button
                  variant="primary"
                  onClick={() => { setShowBenefits(false); setShowPostForm(true); }}
                  className="w-full md:w-auto rounded-2xl px-10 py-4 font-black text-sm shadow-xl shadow-green-500/30 uppercase tracking-widest"
                >
                  Start Listing Now
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Ad detail modal */}
      {selectedAd && (
        <Modal
          isOpen={!!selectedAd}
          onClose={closeAdDetail}
          title=""
          size="lg"
          hideHeader
          className="rounded-[2.5rem] overflow-hidden border-none shadow-2xl"
        >
          <div className="flex flex-col lg:flex-row h-full min-h-[500px]">
            {/* Left: Images Column */}
            <div className="w-full lg:w-1/2 bg-slate-50 p-6 lg:p-10 flex flex-col space-y-6 lg:border-r border-slate-100">
              <div className="aspect-square rounded-3xl bg-white shadow-xl shadow-slate-200/50 overflow-hidden flex items-center justify-center relative">
                {(displayAd?.images && displayAd.images.length > 0) ? (
                  <img
                    key={activeImageIndex}
                    src={`data:${displayAd.images[activeImageIndex]?.content_type || displayAd.images[0].content_type};base64,${displayAd.images[activeImageIndex]?.data_base64 || displayAd.images[0].data_base64}`}
                    alt={displayAd.title}
                    className="w-full h-full object-contain animate-fade-in"
                  />
                ) : displayAd?.first_image?.data_base64 ? (
                  <img
                    src={`data:${displayAd.first_image.content_type};base64,${displayAd.first_image.data_base64}`}
                    alt={displayAd.title}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <ImageIcon className="w-16 h-16 text-slate-200" />
                )}

                {displayAd?.images && displayAd.images.length > 1 && (
                  <div className="absolute bottom-4 left-4 right-4 flex justify-center gap-2 flex-wrap">
                    {displayAd.images.map((img, i) => (
                      <button
                        key={img.id}
                        onClick={() => setActiveImageIndex(i)}
                        className={`w-12 h-12 rounded-xl border-2 transition-all p-0.5 overflow-hidden shadow-sm bg-white ${activeImageIndex === i ? 'border-indigo-600 scale-110 shadow-md ring-2 ring-indigo-500/20' : 'border-white hover:border-indigo-300'
                          }`}
                      >
                        <img src={`data:${img.content_type};base64,${img.data_base64}`} alt="" className="w-full h-full object-cover rounded-lg" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white/60 backdrop-blur-md rounded-2xl p-4 border border-white/50 space-y-3 shadow-sm">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-green-500" />
                  Supply Assurance
                </h4>
                <p className="text-xs text-slate-600 font-medium leading-relaxed">
                  This supplier is a verified member of BizPlanet. All transactions and communications are monitored for quality assurance and fraud prevention.
                </p>
              </div>
            </div>

            {/* Right: Content Column */}
            <div className="w-full lg:w-1/2 p-6 lg:p-10 flex flex-col overflow-y-auto">
              <div className="mb-6 flex flex-col gap-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-3 py-1 bg-indigo-50 text-indigo-600 text-[10px] font-black uppercase rounded-full">
                    {displayAd?.category_name || displayAd?.category_id}
                  </span>
                  <span className="px-3 py-1 bg-green-50 text-green-600 text-[10px] font-black uppercase rounded-full">
                    In Stock
                  </span>
                </div>
                <h2 className="text-2xl lg:text-3xl font-black text-slate-900 leading-tight uppercase tracking-tight">
                  {displayAd?.title || selectedAd.title}
                </h2>
                {displayAd?.product_brand && (
                  <p className="text-sm font-bold text-slate-500 mt-1">Brand: <span className="text-indigo-600">{displayAd.product_brand}</span></p>
                )}
              </div>

              <div className="space-y-6">
                <div>
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Specifications</h4>
                  <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-sm">
                    {displayAd?.product_model && (
                      <div className="border-b border-slate-50 pb-2">
                        <p className="text-[10px] font-black text-slate-400 uppercase">Model</p>
                        <p className="font-bold text-slate-900">{displayAd.product_model}</p>
                      </div>
                    )}
                    {displayAd?.min_order_quantity != null && (
                      <div className="border-b border-slate-50 pb-2">
                        <p className="text-[10px] font-black text-slate-400 uppercase">Min Order</p>
                        <p className="font-bold text-slate-900">{displayAd.min_order_quantity} {displayAd.unit || 'Units'}</p>
                      </div>
                    )}
                    {displayAd?.created_at && (
                      <div className="border-b border-slate-50 pb-2">
                        <p className="text-[10px] font-black text-slate-400 uppercase">Listed On</p>
                        <p className="font-bold text-slate-900">{new Date(displayAd.created_at).toLocaleDateString()}</p>
                      </div>
                    )}
                    <div className="border-b border-slate-50 pb-2">
                      <p className="text-[10px] font-black text-slate-400 uppercase">Availability</p>
                      <p className="font-bold text-green-600">Global Export Ready</p>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Product Description</h4>
                  <p className="text-sm text-slate-600 font-medium leading-relaxed whitespace-pre-wrap">
                    {displayAd?.description || 'No detailed description provided by the supplier.'}
                  </p>
                </div>

                {displayAd?.specifications && (
                  <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-widest mb-2">Technical Overview</h4>
                    <p className="text-xs text-slate-600 font-medium leading-relaxed whitespace-pre-wrap">
                      {displayAd.specifications}
                    </p>
                  </div>
                )}

                <div className="pt-8 border-t border-slate-100 flex flex-col gap-6">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center font-black text-xl text-slate-400 ring-4 ring-slate-50">
                      {displayAd?.supplier_company_name?.[0] || displayAd?.supplier_name?.[0] || 'S'}
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">
                        {displayAd?.supplier_company_name || displayAd?.supplier_name}
                      </h3>
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                        <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />
                        Verified Global Partner
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    <Button
                      variant="primary"
                      className="w-full rounded-2xl py-4 font-black shadow-xl shadow-green-600/30 flex items-center justify-center gap-3 text-base"
                      onClick={() => {
                        const email = displayAd?.contact_email || displayAd?.supplier_email;
                        if (email) window.location.href = `mailto:${email}?subject=Inquiry: ${displayAd?.title}`;
                      }}
                    >
                      <MessageSquare className="w-5 h-5" />
                      Contact Supplier
                    </Button>

                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => {
                          if (displayAd?.contact_phone) window.location.href = `tel:${displayAd.contact_phone}`;
                        }}
                        className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-white border border-slate-200 text-slate-700 font-bold hover:bg-slate-50 transition-all text-sm"
                      >
                        <Phone className="w-4 h-4 text-indigo-500" />
                        Call Now
                      </button>
                      <button
                        onClick={() => {
                          const email = displayAd?.contact_email || displayAd?.supplier_email;
                          if (email) window.location.href = `mailto:${email}`;
                        }}
                        className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-white border border-slate-200 text-slate-700 font-bold hover:bg-slate-50 transition-all text-sm"
                      >
                        <Mail className="w-4 h-4 text-indigo-500" />
                        Email Proposal
                      </button>
                    </div>

                    <button
                      onClick={() => handleLike(displayAd.id)}
                      className="w-full py-4 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 font-black flex items-center justify-center gap-3 hover:bg-indigo-100 transition-all shadow-sm"
                    >
                      <Heart className={`w-5 h-5 ${displayAd.likes ? 'fill-indigo-600' : ''}`} />
                      Like Listing ({displayAd.likes || 0})
                    </button>
                  </div>

                  <p className="text-[10px] text-slate-400 font-bold text-center italic">
                    By contacting, you agree to our B2B trade terms and privacy policy.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Post ad form modal */}
      {showPostForm && (
        <PostAdFormModal
          categories={categoryItems}
          onClose={() => setShowPostForm(false)}
          onSuccess={() => {
            setShowPostForm(false);
            showToast('Listing active on global market', 'success');
            loadAds();
            loadMyAds();
            loadAdsToday();
          }}
          onError={(msg) => showToast(msg, 'error')}
          setSubmitting={setSubmitting}
        />
      )}
    </div>
  );
};

interface PostAdFormModalProps {
  categories: { id: string; name: string }[];
  onClose: () => void;
  onSuccess: () => void;
  onError: (message: string) => void;
  setSubmitting: (v: boolean) => void;
}

const PostAdFormModal: React.FC<PostAdFormModalProps> = ({
  categories,
  onClose,
  onSuccess,
  onError,
  setSubmitting,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [productBrand, setProductBrand] = useState('');
  const [productModel, setProductModel] = useState('');
  const [minOrderQty, setMinOrderQty] = useState('');
  const [unit, setUnit] = useState('');
  const [specifications, setSpecifications] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [images, setImages] = useState<{ data: string; contentType: string }[]>([]);

  const MAX_IMAGES = 5;
  const MAX_SIZE_MB = 2;

  const readFileAsBase64 = (file: File): Promise<{ data: string; contentType: string }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        resolve({ data: base64, contentType: file.type || 'image/jpeg' });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const onFilesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    const toAdd: { data: string; contentType: string }[] = [];
    for (let i = 0; i < files.length && images.length + toAdd.length < MAX_IMAGES; i++) {
      const file = files[i];
      if (!file.type.startsWith('image/')) continue;
      if (file.size > MAX_SIZE_MB * 1024 * 1024) continue;
      try {
        toAdd.push(await readFileAsBase64(file));
      } catch (_) { }
    }
    setImages((prev) => prev.concat(toAdd).slice(0, MAX_IMAGES));
    e.target.value = '';
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { onError('Title is mandatory'); return; }
    if (!categoryId) { onError('Select a business industry'); return; }
    setSubmitting(true);
    try {
      await apiClient.post('/marketplace', {
        title: title.trim(),
        description: description.trim() || undefined,
        category_id: categoryId,
        product_brand: productBrand.trim() || undefined,
        product_model: productModel.trim() || undefined,
        min_order_quantity: minOrderQty ? parseFloat(minOrderQty) : undefined,
        unit: unit.trim() || undefined,
        specifications: specifications.trim() || undefined,
        contact_email: contactEmail.trim() || undefined,
        contact_phone: contactPhone.trim() || undefined,
        images: images.length ? images : undefined,
      });
      onSuccess();
    } catch (err: any) {
      const msg = err?.message || err?.error || (err?.status === 429 ? 'Daily listing quota reached.' : 'Publication error');
      onError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="" size="lg" hideHeader className="rounded-[2.5rem] bg-indigo-950 text-white overflow-hidden border-none shadow-2xl p-0 max-h-[90vh]">
      <div className="flex h-full flex-col lg:flex-row">
        {/* Left: Banner Column */}
        <div className="hidden lg:flex w-1/3 bg-indigo-900 border-r border-white/5 p-10 flex-col justify-between relative overflow-hidden shrink-0">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-3xl -mr-16 -mt-16" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full blur-3xl -ml-16 -mb-16" />

          <div className="relative z-10 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center backdrop-blur-md">
              <LayoutGrid className="w-6 h-6 text-indigo-400" />
            </div>
            <h2 className="text-3xl font-black leading-tight uppercase tracking-tight">Expand Your <br /><span className="text-indigo-400">Global Reach</span></h2>
            <p className="text-indigo-200/60 text-sm font-medium leading-relaxed">Fill in the details to list your product on the global trade floor. Reaching thousand of verified buyers instantly.</p>
          </div>

          <div className="relative z-10 space-y-4 p-5 bg-white/5 rounded-[2rem] border border-white/10">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 text-green-400" />
              <h4 className="font-bold text-sm">Listing Tips</h4>
            </div>
            <ul className="text-[11px] text-indigo-200/80 space-y-2 font-medium list-disc pl-4">
              <li>High resolution images convert 60% better.</li>
              <li>Detailed specifications build buyer trust.</li>
              <li>Clear MOQ helps qualify the right leads.</li>
            </ul>
          </div>
        </div>

        {/* Right: Form Column */}
        <div className="flex-1 bg-white p-6 lg:p-12 overflow-y-auto max-h-full">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Product Details</h2>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="space-y-6">
              <Input
                label="Listing Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Business-grade professional title..."
                required
                className="rounded-xl border-slate-200 focus:ring-indigo-500/10 focus:border-indigo-500 py-3"
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Industry Category</label>
                  <ComboBox
                    items={categories}
                    selectedId={categoryId}
                    onSelect={(item) => setCategoryId(item?.id || '')}
                    placeholder="Select Sector"
                    className="rounded-xl border-slate-200"
                    allowAddNew={false}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Lead Images (Max 5)</label>
                  <div className="flex gap-2">
                    <label className="w-12 h-12 flex items-center justify-center rounded-xl bg-slate-50 border-2 border-dashed border-slate-200 text-slate-400 cursor-pointer hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-500 transition-all">
                      <Plus className="w-5 h-5" />
                      <input type="file" accept="image/*" multiple className="hidden" onChange={onFilesChange} />
                    </label>
                    <div className="flex gap-2 overflow-x-auto pb-1 scroll-container-x">
                      {images.map((img, idx) => (
                        <div key={idx} className="relative group shrink-0 w-12 h-12 rounded-xl overflow-hidden shadow-sm ring-1 ring-slate-100">
                          <img src={`data:${img.contentType};base64,${img.data}`} alt="" className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => removeImage(idx)}
                            className="absolute inset-0 bg-red-500/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Professional Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Elaborate on the value proposition, usage, and benefits of your product..."
                  rows={4}
                  className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all font-medium min-h-[120px]"
                />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Input
                  label="Brand Name"
                  value={productBrand}
                  onChange={(e) => setProductBrand(e.target.value)}
                  placeholder="Optional"
                  className="rounded-xl"
                />
                <Input
                  label="Model/Serial"
                  value={productModel}
                  onChange={(e) => setProductModel(e.target.value)}
                  placeholder="Optional"
                  className="rounded-xl"
                />
                <Input
                  label="MOQ"
                  type="number"
                  min="0"
                  value={minOrderQty}
                  onChange={(e) => setMinOrderQty(e.target.value)}
                  placeholder="Qty"
                  className="rounded-xl"
                />
                <Input
                  label="Order Unit"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="e.g. Metric Ton"
                  className="rounded-xl"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
                <Input
                  label="Inquiry Email"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="Sales mailbox..."
                  className="rounded-xl"
                />
                <Input
                  label="Direct Hotline"
                  type="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="Country code included"
                  className="rounded-xl"
                />
              </div>
            </div>

            <div className="flex gap-4 pt-6">
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                className="flex-1 py-4 bg-slate-100 text-slate-600 font-bold rounded-2xl hover:bg-slate-200 transition-colors uppercase tracking-widest text-xs"
              >
                Discard
              </Button>
              <Button
                type="submit"
                variant="primary"
                className="flex-[2] py-4 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-green-600/30"
              >
                Go Global Now
              </Button>
            </div>
          </form>
        </div>
      </div>
    </Modal>
  );
};

export default MarketplacePage;
