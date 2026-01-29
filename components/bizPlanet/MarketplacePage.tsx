import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../services/api/client';
import Button from '../ui/Button';
import Card from '../ui/Card';
import Input from '../ui/Input';
import Modal from '../ui/Modal';
import ComboBox from '../ui/ComboBox';
import { useNotification } from '../../context/NotificationContext';

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
  const { showToast, showAlert } = useNotification();
  const [categories, setCategories] = useState<MarketplaceCategory[]>([]);
  const [ads, setAds] = useState<MarketplaceAd[]>([]);
  const [myAds, setMyAds] = useState<MarketplaceAd[]>([]);
  const [adsToday, setAdsToday] = useState<{ count: number; limit: number }>({ count: 0, limit: 2 });
  const [loading, setLoading] = useState(true);
  const [loadingMy, setLoadingMy] = useState(false);

  const [filterCategory, setFilterCategory] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');

  const [selectedAd, setSelectedAd] = useState<MarketplaceAd | null>(null);
  const [selectedAdFull, setSelectedAdFull] = useState<MarketplaceAd | null>(null);
  const [showPostForm, setShowPostForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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
  };

  const displayAd = selectedAdFull || selectedAd;

  return (
    <div className="h-full flex flex-col bg-slate-50 overflow-hidden">
      {/* Header + filters */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-semibold text-slate-800 mr-4">Marketplace</h1>
          <div className="flex flex-wrap items-center gap-2 flex-1">
            <div className="w-40">
              <ComboBox
                items={[{ id: '', name: 'All categories' }, ...categoryItems]}
                selectedId={filterCategory || ''}
                onSelect={(item) => setFilterCategory(item?.id || '')}
                placeholder="Category"
                compact
                allowAddNew={false}
              />
            </div>
            <Input
              type="text"
              placeholder="Search products..."
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              className="max-w-xs"
              compact
            />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as 'newest' | 'oldest')}
              className="text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
            {isSupplier && (
              <Button
                variant="primary"
                size="sm"
                disabled={!canPostMore}
                onClick={() => setShowPostForm(true)}
                className="ml-auto"
              >
                Post new ad
              </Button>
            )}
          </div>
        </div>
        {isSupplier && (
          <p className="text-xs text-slate-500 mt-2">
            You can post up to {adsToday.limit} ads per day. Today: {adsToday.count} / {adsToday.limit}.
          </p>
        )}
      </div>

      <div className="flex-1 overflow-auto p-4">
        {/* My Ads (suppliers only) */}
        {isSupplier && myAds.length > 0 && (
          <Card className="p-4 mb-4">
            <h2 className="text-sm font-semibold text-slate-800 mb-3">My ads</h2>
            <div className="flex flex-wrap gap-3">
              {myAds.map((ad) => (
                <div
                  key={ad.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 min-w-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{ad.title}</p>
                    <p className="text-xs text-slate-500">{ad.category_name} • {ad.created_at ? new Date(ad.created_at).toLocaleDateString() : ''}</p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => openAdDetail(ad)}>View</Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={async () => {
                        if (!window.confirm('Remove this ad?')) return;
                        try {
                          await apiClient.delete(`/marketplace/${ad.id}`);
                          showToast('Ad removed', 'success');
                          loadMyAds();
                          loadAds();
                          loadAdsToday();
                        } catch (e: any) {
                          showToast(e?.message || 'Failed to remove ad', 'error');
                        }
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Browse grid */}
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Browse listings</h2>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
          </div>
        ) : ads.length === 0 ? (
          <Card className="p-8 text-center text-slate-500">
            <p>No listings match your filters. Try changing category or search.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {ads.map((ad) => (
              <Card
                key={ad.id}
                className="p-0 flex flex-col overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => openAdDetail(ad)}
              >
                <div className="aspect-[4/3] bg-slate-100 flex-shrink-0">
                  {ad.first_image?.data_base64 ? (
                    <img
                      src={`data:${ad.first_image.content_type};base64,${ad.first_image.data_base64}`}
                      alt={ad.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400">
                      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                </div>
                <div className="p-4 flex flex-col flex-1 min-h-0">
                  <span className="text-xs font-medium text-indigo-600">{ad.category_name || ad.category_id}</span>
                  <h3 className="font-semibold text-slate-900 mt-1 line-clamp-2">{ad.title}</h3>
                  <p className="text-sm text-slate-600 mt-1 line-clamp-2">{ad.description || '—'}</p>
                  <p className="text-xs text-slate-500 mt-2">
                    {ad.supplier_company_name || ad.supplier_name || 'Supplier'}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3 w-full"
                    onClick={(e) => { e.stopPropagation(); openAdDetail(ad); }}
                  >
                    View & contact
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Ad detail modal */}
      {selectedAd && (
        <Modal
          isOpen={!!selectedAd}
          onClose={closeAdDetail}
          title={displayAd?.title || selectedAd.title}
          size="lg"
        >
          <div className="space-y-4">
            {(displayAd?.images && displayAd.images.length > 0) ? (
              <div className="flex gap-2 overflow-x-auto pb-2 rounded-lg bg-slate-50 p-2">
                {displayAd.images.map((img) => img.data_base64 && (
                  <img
                    key={img.id}
                    src={`data:${img.content_type};base64,${img.data_base64}`}
                    alt=""
                    className="h-48 w-auto object-contain rounded border border-slate-200 flex-shrink-0"
                  />
                ))}
              </div>
            ) : displayAd?.first_image?.data_base64 ? (
              <div className="rounded-lg overflow-hidden bg-slate-100">
                <img
                  src={`data:${displayAd.first_image.content_type};base64,${displayAd.first_image.data_base64}`}
                  alt=""
                  className="w-full max-h-64 object-contain"
                />
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <span className="px-2 py-1 text-xs font-medium rounded-full bg-indigo-100 text-indigo-800">
                {displayAd?.category_name || displayAd?.category_id || selectedAd.category_id}
              </span>
            </div>
            {displayAd?.description && (
              <div>
                <p className="text-xs text-slate-500 mb-1">Description</p>
                <p className="text-sm text-slate-900 whitespace-pre-wrap">{displayAd.description}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 text-sm">
              {displayAd?.product_brand && (
                <div>
                  <p className="text-xs text-slate-500">Brand</p>
                  <p className="font-medium text-slate-900">{displayAd.product_brand}</p>
                </div>
              )}
              {displayAd?.product_model && (
                <div>
                  <p className="text-xs text-slate-500">Model</p>
                  <p className="font-medium text-slate-900">{displayAd.product_model}</p>
                </div>
              )}
              {displayAd?.min_order_quantity != null && (
                <div>
                  <p className="text-xs text-slate-500">Min. order</p>
                  <p className="font-medium text-slate-900">
                    {displayAd.min_order_quantity} {displayAd.unit || ''}
                  </p>
                </div>
              )}
              {displayAd?.specifications && (
                <div className="col-span-2">
                  <p className="text-xs text-slate-500">Specifications</p>
                  <p className="text-slate-900 whitespace-pre-wrap">{displayAd.specifications}</p>
                </div>
              )}
            </div>
            <div className="pt-3 border-t border-slate-200">
              <p className="text-xs font-semibold text-slate-700 mb-2">Supplier – contact for registration & orders</p>
              <p className="text-sm font-medium text-slate-900">
                {displayAd?.supplier_company_name || displayAd?.supplier_name || selectedAd.supplier_company_name || selectedAd.supplier_name || 'Supplier'}
              </p>
              {(displayAd?.contact_email || displayAd?.supplier_email) && (
                <p className="text-sm">
                  <a href={`mailto:${displayAd.contact_email || displayAd.supplier_email}`} className="text-indigo-600 hover:underline">
                    {displayAd.contact_email || displayAd.supplier_email}
                  </a>
                </p>
              )}
              {displayAd?.contact_phone && (
                <p className="text-sm">
                  <a href={`tel:${displayAd.contact_phone}`} className="text-indigo-600 hover:underline">
                    {displayAd.contact_phone}
                  </a>
                </p>
              )}
              <p className="text-xs text-slate-500 mt-2">
                Contact this supplier to register as a buyer. After registration you can send POs and they can supply materials/products.
              </p>
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
            showToast('Ad published', 'success');
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
      } catch (_) {}
    }
    setImages((prev) => prev.concat(toAdd).slice(0, MAX_IMAGES));
    e.target.value = '';
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { onError('Title is required'); return; }
    if (!categoryId) { onError('Please select a category'); return; }
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
      const msg = err?.message || err?.error || (err?.status === 429 ? 'Daily limit reached. You can post up to 2 ads per day.' : 'Failed to publish ad');
      onError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Post new ad" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Steel rods, Cement, Office supplies"
          required
          compact
        />
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Category</label>
          <ComboBox
            items={categories}
            selectedId={categoryId}
            onSelect={(item) => setCategoryId(item?.id || '')}
            placeholder="Select category"
            compact
            allowAddNew={false}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Pictures (optional, max {MAX_IMAGES}, {MAX_SIZE_MB}MB each)</label>
          <div className="flex flex-wrap gap-2 items-start">
            {images.map((img, idx) => (
              <div key={idx} className="relative group">
                <img
                  src={`data:${img.contentType};base64,${img.data}`}
                  alt=""
                  className="h-20 w-20 object-cover rounded border border-slate-200"
                />
                <button
                  type="button"
                  onClick={() => removeImage(idx)}
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center opacity-90 group-hover:opacity-100"
                  aria-label="Remove image"
                >
                  ×
                </button>
              </div>
            ))}
            {images.length < MAX_IMAGES && (
              <label className="h-20 w-20 flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-indigo-400 hover:bg-slate-50 text-slate-500 text-xs">
                <svg className="w-6 h-6 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add
                <input type="file" accept="image/*" multiple className="hidden" onChange={onFilesChange} />
              </label>
            )}
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe your product or service"
            rows={3}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Brand"
            value={productBrand}
            onChange={(e) => setProductBrand(e.target.value)}
            placeholder="Optional"
            compact
          />
          <Input
            label="Model"
            value={productModel}
            onChange={(e) => setProductModel(e.target.value)}
            placeholder="Optional"
            compact
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Min. order quantity"
            type="number"
            min="0"
            step="any"
            value={minOrderQty}
            onChange={(e) => setMinOrderQty(e.target.value)}
            placeholder="Optional"
            compact
          />
          <Input
            label="Unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="e.g. kg, pcs, box"
            compact
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Specifications</label>
          <textarea
            value={specifications}
            onChange={(e) => setSpecifications(e.target.value)}
            placeholder="Technical specs or other details (optional)"
            rows={2}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Contact email"
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="Shown to buyers (optional)"
            compact
          />
          <Input
            label="Contact phone"
            type="tel"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            placeholder="Shown to buyers (optional)"
            compact
          />
        </div>
        <p className="text-xs text-slate-500">
          Contact details are optional; if left blank, your organization email may be shown to buyers.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary">Publish ad</Button>
        </div>
      </form>
    </Modal>
  );
};

export default MarketplacePage;
