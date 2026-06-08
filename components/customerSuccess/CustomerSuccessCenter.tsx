import React, { useMemo, useState } from 'react';
import {
  Rocket,
  PlayCircle,
  BookOpen,
  Sparkles,
  Lightbulb,
  GraduationCap,
  Users,
  Headphones,
  Search,
  ExternalLink,
  ChevronRight,
  Mail,
  MessageCircle,
  Clock,
} from 'lucide-react';
import ProductTourLauncher from '../tours/ProductTourLauncher';
import SupportTicketForm from './SupportTicketForm';
import { useAuth } from '../../context/AuthContext';
import { useCompanyOptional } from '../../context/CompanyContext';
import packageJson from '../../package.json';
import {
  SUCCESS_SECTIONS,
  GETTING_STARTED_STEPS,
  VIDEO_TUTORIALS,
  KNOWLEDGE_ARTICLES,
  PRODUCT_UPDATES,
  TRAINING_RESOURCES,
  COMMUNITY_LINKS,
  SUPPORT_CONTACT,
  buildSearchIndex,
  matchesSearch,
  type SuccessSectionId,
} from '../../shared/customerSuccess/customerSuccessContent';

const SECTION_ICONS: Record<string, React.ReactNode> = {
  rocket: <Rocket className="w-4 h-4" />,
  play: <PlayCircle className="w-4 h-4" />,
  book: <BookOpen className="w-4 h-4" />,
  sparkles: <Sparkles className="w-4 h-4" />,
  lightbulb: <Lightbulb className="w-4 h-4" />,
  graduation: <GraduationCap className="w-4 h-4" />,
  users: <Users className="w-4 h-4" />,
  headphones: <Headphones className="w-4 h-4" />,
};

type Props = {
  onOpenSettingsTab?: (tabId: string) => void;
};

function levelColor(level: string): string {
  if (level === 'Beginner') return 'bg-emerald-100 text-emerald-800';
  if (level === 'Advanced') return 'bg-violet-100 text-violet-800';
  return 'bg-sky-100 text-sky-800';
}

const CustomerSuccessCenter: React.FC<Props> = ({ onOpenSettingsTab }) => {
  const { user, tenant } = useAuth();
  const company = useCompanyOptional();
  const [activeSection, setActiveSection] = useState<SuccessSectionId>('getting-started');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedArticleId, setExpandedArticleId] = useState<string | null>(null);
  const [kbCategory, setKbCategory] = useState<string>('All');

  const searchIndex = useMemo(() => buildSearchIndex(), []);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return searchIndex.filter((item) =>
      matchesSearch(searchQuery, [item.title, item.excerpt, ...item.tags])
    );
  }, [searchQuery, searchIndex]);

  const kbCategories = useMemo(() => {
    const cats = new Set(KNOWLEDGE_ARTICLES.map((a) => a.category));
    return ['All', ...Array.from(cats).sort()];
  }, []);

  const filteredArticles = useMemo(() => {
    return KNOWLEDGE_ARTICLES.filter((a) => {
      const catOk = kbCategory === 'All' || a.category === kbCategory;
      const searchOk = matchesSearch(searchQuery, [a.title, a.excerpt, a.body, a.category, ...a.tags]);
      return catOk && searchOk;
    });
  }, [kbCategory, searchQuery]);

  const handleSearchResultClick = (sectionId: SuccessSectionId, itemId: string) => {
    setActiveSection(sectionId);
    setSearchQuery('');
    if (sectionId === 'knowledge-base') {
      setExpandedArticleId(itemId);
    }
  };

  const renderGettingStarted = () => (
    <div className="space-y-6">
      <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-5 sm:p-6">
        <h3 className="text-lg font-bold text-slate-900">Your first-week checklist</h3>
        <p className="text-sm text-slate-600 mt-1">Complete these steps to go live with confidence.</p>
        <ol className="mt-4 space-y-3">
          {GETTING_STARTED_STEPS.filter((s) =>
            matchesSearch(searchQuery, [s.title, s.description, ...s.tags])
          ).map((step, idx) => (
            <li
              key={step.id}
              className="flex gap-3 sm:gap-4 rounded-xl border border-white/80 bg-white/90 p-4 shadow-sm"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white">
                {idx + 1}
              </span>
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-slate-800">{step.title}</h4>
                <p className="text-sm text-slate-600 mt-0.5">{step.description}</p>
                {step.actionLabel && step.settingsTab && onOpenSettingsTab && (
                  <button
                    type="button"
                    onClick={() => onOpenSettingsTab(step.settingsTab!)}
                    className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-800"
                  >
                    {step.actionLabel}
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <h3 className="text-base font-bold text-slate-800 mb-1">Guided product tours</h3>
        <p className="text-sm text-slate-500 mb-4">Interactive highlights for Dashboard, Accounting, Rental, Projects, and Reports.</p>
        <ProductTourLauncher />
      </div>
    </div>
  );

  const renderVideos = () => (
    <div className="grid gap-4 sm:grid-cols-2">
      {VIDEO_TUTORIALS.filter((v) =>
        matchesSearch(searchQuery, [v.title, v.description, v.module, v.level, ...v.tags])
      ).map((video) => (
        <div
          key={video.id}
          className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all"
        >
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${levelColor(video.level)}`}>
              {video.level}
            </span>
            <span className="text-xs text-slate-400">{video.duration}</span>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
              <PlayCircle className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{video.module}</p>
              <h4 className="font-semibold text-slate-800 mt-0.5">{video.title}</h4>
              <p className="text-sm text-slate-500 mt-1 line-clamp-2">{video.description}</p>
            </div>
          </div>
          {video.url && (
            <a
              href={video.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-800"
            >
              Watch tutorial
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      ))}
    </div>
  );

  const renderKnowledgeBase = () => (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {kbCategories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setKbCategory(cat)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              kbCategory === cat
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        {filteredArticles.map((article) => (
          <div
            key={article.id}
            id={article.id}
            className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm scroll-mt-24"
          >
            <button
              type="button"
              onClick={() => setExpandedArticleId((p) => (p === article.id ? null : article.id))}
              className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-slate-50 transition-colors"
            >
              <div className="min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wide text-indigo-600">{article.category}</span>
                <h4 className="font-semibold text-slate-800 mt-0.5">{article.title}</h4>
                <p className="text-sm text-slate-500 mt-1 line-clamp-1">{article.excerpt}</p>
              </div>
              <ChevronRight
                className={`w-5 h-5 text-slate-400 shrink-0 transition-transform ${
                  expandedArticleId === article.id ? 'rotate-90' : ''
                }`}
              />
            </button>
            {expandedArticleId === article.id && (
              <div className="px-4 pb-4 pt-0 border-t border-slate-100 bg-slate-50/50">
                <p className="text-sm text-slate-600 leading-relaxed pt-3">{article.body}</p>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {article.tags.map((t) => (
                    <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
        {filteredArticles.length === 0 && (
          <p className="text-center text-slate-500 py-8 text-sm">No articles match your search.</p>
        )}
      </div>
    </div>
  );

  const renderProductUpdates = () => (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Current app version: <span className="font-mono font-semibold text-slate-700">v{packageJson.version}</span>
      </p>
      {PRODUCT_UPDATES.filter((u) =>
        matchesSearch(searchQuery, [u.title, u.version, ...u.highlights, ...u.tags])
      ).map((update) => (
        <article key={update.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
              v{update.version}
            </span>
            <span className="text-xs text-slate-400">{update.date}</span>
          </div>
          <h4 className="font-bold text-slate-800">{update.title}</h4>
          <ul className="mt-3 space-y-1.5">
            {update.highlights.map((h) => (
              <li key={h} className="flex gap-2 text-sm text-slate-600">
                <Sparkles className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                <span>{h}</span>
              </li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );

  const renderTraining = () => (
    <div className="grid gap-4 sm:grid-cols-2">
      {TRAINING_RESOURCES.filter((t) =>
        matchesSearch(searchQuery, [t.title, t.description, t.type, ...t.tags])
      ).map((res) => (
        <a
          key={res.id}
          href={res.url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all group"
        >
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
            <span className="font-semibold text-indigo-600">{res.type}</span>
            <span>·</span>
            <span>{res.duration}</span>
          </div>
          <h4 className="font-semibold text-slate-800 group-hover:text-indigo-700">{res.title}</h4>
          <p className="text-sm text-slate-500 mt-1">{res.description}</p>
          <span className="inline-flex items-center gap-1 mt-3 text-sm font-medium text-indigo-600">
            Open resource <ExternalLink className="w-3.5 h-3.5" />
          </span>
        </a>
      ))}
    </div>
  );

  const renderCommunity = () => (
    <div className="grid gap-4 sm:grid-cols-2">
      {COMMUNITY_LINKS.filter((c) =>
        matchesSearch(searchQuery, [c.title, c.description, c.platform, ...c.tags])
      ).map((link) => (
        <a
          key={link.id}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
            <Users className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{link.platform}</p>
            <h4 className="font-semibold text-slate-800">{link.title}</h4>
            <p className="text-sm text-slate-500 mt-0.5">{link.description}</p>
          </div>
        </a>
      ))}
    </div>
  );

  const defaultName = user?.name || '';
  const defaultEmail = user?.email || '';
  const defaultOrg = tenant?.companyName || tenant?.name || company?.activeCompany?.company_name || '';

  const renderFeatureRequests = () => (
    <div className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
      <SupportTicketForm
        ticketType="feature_request"
        title="Submit a feature request"
        description="Describe the workflow or capability you need. Product reviews requests weekly."
        subjectPlaceholder="e.g. Bulk edit rental invoices"
        defaultName={defaultName}
        defaultEmail={defaultEmail}
        defaultOrganization={defaultOrg}
      />
    </div>
  );

  const renderContactSupport = () => (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="lg:col-span-2 space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5">
          <h4 className="font-semibold text-slate-800 mb-3">Direct channels</h4>
          <ul className="space-y-3 text-sm">
            <li className="flex items-start gap-3">
              <Mail className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-slate-800">Email</p>
                <a href={`mailto:${SUPPORT_CONTACT.email}`} className="text-indigo-600 hover:underline">
                  {SUPPORT_CONTACT.email}
                </a>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <MessageCircle className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-slate-800">WhatsApp</p>
                <a href={SUPPORT_CONTACT.whatsappUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
                  Chat with support
                </a>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <Clock className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-slate-800">Hours</p>
                <p className="text-slate-500">{SUPPORT_CONTACT.hours}</p>
              </div>
            </li>
          </ul>
        </div>
        <a
          href="https://www.pbookspro.com/support.html"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:border-indigo-200"
        >
          Public support center
          <ExternalLink className="w-4 h-4 text-slate-400" />
        </a>
      </div>
      <div className="lg:col-span-3 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
        <SupportTicketForm
          ticketType="contact"
          title="Open a support ticket"
          description="We typically respond within one business day. Include steps to reproduce for technical issues."
          defaultName={defaultName}
          defaultEmail={defaultEmail}
          defaultOrganization={defaultOrg}
        />
      </div>
    </div>
  );

  const renderSectionContent = () => {
    switch (activeSection) {
      case 'getting-started':
        return renderGettingStarted();
      case 'video-tutorials':
        return renderVideos();
      case 'knowledge-base':
        return renderKnowledgeBase();
      case 'product-updates':
        return renderProductUpdates();
      case 'feature-requests':
        return renderFeatureRequests();
      case 'training-resources':
        return renderTraining();
      case 'community-links':
        return renderCommunity();
      case 'contact-support':
        return renderContactSupport();
      default:
        return null;
    }
  };

  const activeMeta = SUCCESS_SECTIONS.find((s) => s.id === activeSection)!;

  return (
    <div className="min-h-[600px] flex flex-col">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 px-5 py-8 sm:px-8 sm:py-10 text-white mb-6">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.12),_transparent_50%)]" aria-hidden />
        <div className="relative max-w-2xl">
          <p className="text-indigo-200 text-xs font-bold uppercase tracking-widest mb-2">Customer Success</p>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">How can we help you succeed?</h2>
          <p className="text-indigo-100 text-sm sm:text-base mt-2 max-w-lg">
            Guides, tutorials, release notes, and direct support — everything to master PBooks Pro.
          </p>
          <div className="relative mt-5 max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search guides, videos, updates…"
              className="w-full rounded-xl border-0 bg-white pl-10 pr-4 py-3 text-sm text-slate-800 shadow-lg placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-white/40"
              aria-label="Search customer success content"
            />
          </div>
        </div>
      </div>

      {/* Global search results */}
      {searchQuery.trim() && searchResults.length > 0 && (
        <div className="mb-6 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-indigo-700 mb-3">
            {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} across all sections
          </p>
          <ul className="space-y-2 max-h-48 overflow-y-auto">
            {searchResults.slice(0, 12).map((r) => (
              <li key={`${r.sectionId}-${r.id}`}>
                <button
                  type="button"
                  onClick={() => handleSearchResultClick(r.sectionId, r.id)}
                  className="w-full text-left rounded-lg bg-white px-3 py-2 text-sm hover:bg-indigo-50 border border-indigo-100 transition-colors"
                >
                  <span className="font-medium text-slate-800">{r.title}</span>
                  <span className="ml-2 text-[10px] font-semibold uppercase text-indigo-500">
                    {SUCCESS_SECTIONS.find((s) => s.id === r.sectionId)?.label}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
        {/* Mobile section picker */}
        <div className="lg:hidden">
          <select
            value={activeSection}
            onChange={(e) => setActiveSection(e.target.value as SuccessSectionId)}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 shadow-sm"
            aria-label="Success center section"
          >
            {SUCCESS_SECTIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {/* Desktop nav */}
        <nav
          className="hidden lg:flex lg:w-56 xl:w-64 flex-col gap-1 shrink-0"
          aria-label="Customer success sections"
        >
          {SUCCESS_SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => setActiveSection(section.id)}
              className={`flex items-start gap-3 rounded-xl px-3 py-3 text-left transition-all ${
                activeSection === section.id
                  ? 'bg-indigo-50 text-indigo-800 shadow-sm ring-1 ring-indigo-100'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span
                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                  activeSection === section.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {SECTION_ICONS[section.icon]}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{section.label}</span>
                <span className="block text-[11px] text-slate-500 mt-0.5 line-clamp-2">{section.description}</span>
              </span>
            </button>
          ))}
        </nav>

        {/* Mobile horizontal pills */}
        <div className="lg:hidden -mx-1 overflow-x-auto pb-1 flex gap-2 scrollbar-thin">
          {SUCCESS_SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => setActiveSection(section.id)}
              className={`shrink-0 flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold whitespace-nowrap transition-colors ${
                activeSection === section.id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {SECTION_ICONS[section.icon]}
              {section.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <main className="flex-1 min-w-0">
          <header className="mb-5">
            <h3 className="text-xl font-bold text-slate-900">{activeMeta.label}</h3>
            <p className="text-sm text-slate-500 mt-0.5">{activeMeta.description}</p>
          </header>
          {renderSectionContent()}
        </main>
      </div>
    </div>
  );
};

export default CustomerSuccessCenter;
