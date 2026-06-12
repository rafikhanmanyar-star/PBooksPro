import React, { useEffect, useMemo, useState } from 'react';
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
  initialSection?: SuccessSectionId;
  initialArticleId?: string | null;
};

function levelColor(level: string): string {
  if (level === 'Beginner') return 'bg-[color:var(--badge-paid-bg)] text-ds-success border border-ds-success/20';
  if (level === 'Advanced') return 'bg-primary/15 text-primary border border-primary/20';
  return 'bg-[color:var(--badge-partial-bg)] text-[color:var(--badge-partial-text)] border border-ds-warning/20';
}

const cardClass = 'rounded-2xl border border-app-border bg-app-card p-5 shadow-ds-card';
const cardHoverClass = 'rounded-2xl border border-app-border bg-app-card p-5 shadow-ds-card hover:shadow-ds-card hover:border-primary/30 transition-all';

const CustomerSuccessCenter: React.FC<Props> = ({ onOpenSettingsTab, initialSection, initialArticleId }) => {
  const { user, tenant } = useAuth();
  const company = useCompanyOptional();
  const [activeSection, setActiveSection] = useState<SuccessSectionId>(initialSection ?? 'getting-started');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedArticleId, setExpandedArticleId] = useState<string | null>(initialArticleId ?? null);
  const [kbCategory, setKbCategory] = useState<string>('All');

  useEffect(() => {
    if (initialSection) {
      setActiveSection(initialSection);
    }
  }, [initialSection]);

  useEffect(() => {
    if (!initialArticleId) return;
    setActiveSection('knowledge-base');
    setExpandedArticleId(initialArticleId);
    const scrollToArticle = () => {
      document.getElementById(initialArticleId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    const timer = window.setTimeout(scrollToArticle, 150);
    return () => window.clearTimeout(timer);
  }, [initialArticleId]);

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
      <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-app-card to-app-card p-5 sm:p-6">
        <h3 className="text-lg font-bold text-app-text">Your first-week checklist</h3>
        <p className="text-sm text-app-muted mt-1">Complete these steps to go live with confidence.</p>
        <ol className="mt-4 space-y-3">
          {GETTING_STARTED_STEPS.filter((s) =>
            matchesSearch(searchQuery, [s.title, s.description, ...s.tags])
          ).map((step, idx) => (
            <li
              key={step.id}
              className="flex gap-3 sm:gap-4 rounded-xl border border-app-border bg-app-toolbar/30 p-4 shadow-sm"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-ds-on-primary text-sm font-bold">
                {idx + 1}
              </span>
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-app-text">{step.title}</h4>
                <p className="text-sm text-app-muted mt-0.5">{step.description}</p>
                {step.actionLabel && step.settingsTab && onOpenSettingsTab && (
                  <button
                    type="button"
                    onClick={() => onOpenSettingsTab(step.settingsTab!)}
                    className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80"
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
      <div className={cardClass}>
        <h3 className="text-base font-bold text-app-text mb-1">Guided product tours</h3>
        <p className="text-sm text-app-muted mb-4">Interactive highlights for Dashboard, Accounting, Rental, Projects, and Reports.</p>
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
          className={`group ${cardHoverClass}`}
        >
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${levelColor(video.level)}`}>
              {video.level}
            </span>
            <span className="text-xs text-app-muted">{video.duration}</span>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <PlayCircle className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-app-muted">{video.module}</p>
              <h4 className="font-semibold text-app-text mt-0.5">{video.title}</h4>
              <p className="text-sm text-app-muted mt-1 line-clamp-2">{video.description}</p>
            </div>
          </div>
          {video.url && (
            <a
              href={video.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80"
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
                ? 'bg-primary text-ds-on-primary'
                : 'bg-app-toolbar text-app-muted hover:bg-app-table-hover'
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
            className="rounded-xl border border-app-border bg-app-card overflow-hidden shadow-ds-card scroll-mt-24"
          >
            <button
              type="button"
              onClick={() => setExpandedArticleId((p) => (p === article.id ? null : article.id))}
              className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-app-table-hover transition-colors"
            >
              <div className="min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wide text-primary">{article.category}</span>
                <h4 className="font-semibold text-app-text mt-0.5">{article.title}</h4>
                <p className="text-sm text-app-muted mt-1 line-clamp-1">{article.excerpt}</p>
              </div>
              <ChevronRight
                className={`w-5 h-5 text-app-muted shrink-0 transition-transform ${
                  expandedArticleId === article.id ? 'rotate-90' : ''
                }`}
              />
            </button>
            {expandedArticleId === article.id && (
              <div className="px-4 pb-4 pt-0 border-t border-app-border bg-app-toolbar/30">
                <p className="text-sm text-app-text leading-relaxed pt-3">{article.body}</p>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {article.tags.map((t) => (
                    <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-app-toolbar text-app-muted border border-app-border">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
        {filteredArticles.length === 0 && (
          <p className="text-center text-app-muted py-8 text-sm">No articles match your search.</p>
        )}
      </div>
    </div>
  );

  const renderProductUpdates = () => (
    <div className="space-y-4">
      <p className="text-sm text-app-muted">
        Current app version: <span className="font-mono font-semibold text-app-text">v{packageJson.version}</span>
      </p>
      {PRODUCT_UPDATES.filter((u) =>
        matchesSearch(searchQuery, [u.title, u.version, ...u.highlights, ...u.tags])
      ).map((update) => (
        <article key={update.id} className={cardClass}>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="font-mono text-xs font-bold text-primary bg-primary/15 px-2 py-0.5 rounded border border-primary/20">
              v{update.version}
            </span>
            <span className="text-xs text-app-muted">{update.date}</span>
          </div>
          <h4 className="font-bold text-app-text">{update.title}</h4>
          <ul className="mt-3 space-y-1.5">
            {update.highlights.map((h) => (
              <li key={h} className="flex gap-2 text-sm text-app-text">
                <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
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
          className={`${cardHoverClass} group`}
        >
          <div className="flex items-center gap-2 text-xs text-app-muted mb-2">
            <span className="font-semibold text-primary">{res.type}</span>
            <span>·</span>
            <span>{res.duration}</span>
          </div>
          <h4 className="font-semibold text-app-text group-hover:text-primary">{res.title}</h4>
          <p className="text-sm text-app-muted mt-1">{res.description}</p>
          <span className="inline-flex items-center gap-1 mt-3 text-sm font-medium text-primary">
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
          className={`flex gap-4 ${cardHoverClass}`}
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-app-toolbar text-app-muted">
            <Users className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wide text-app-muted">{link.platform}</p>
            <h4 className="font-semibold text-app-text">{link.title}</h4>
            <p className="text-sm text-app-muted mt-0.5">{link.description}</p>
          </div>
        </a>
      ))}
    </div>
  );

  const defaultName = user?.name || '';
  const defaultEmail = user?.email || '';
  const defaultOrg = tenant?.companyName || tenant?.name || company?.activeCompany?.company_name || '';

  const renderFeatureRequests = () => (
    <div className={`max-w-2xl ${cardClass}`}>
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
        <div className="rounded-2xl border border-app-border bg-gradient-to-br from-app-toolbar/50 to-app-card p-5">
          <h4 className="font-semibold text-app-text mb-3">Direct channels</h4>
          <ul className="space-y-3 text-sm">
            <li className="flex items-start gap-3">
              <Mail className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-app-text">Email</p>
                <a href={`mailto:${SUPPORT_CONTACT.email}`} className="text-primary hover:underline">
                  {SUPPORT_CONTACT.email}
                </a>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <MessageCircle className="w-4 h-4 text-ds-success mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-app-text">WhatsApp</p>
                <a href={SUPPORT_CONTACT.whatsappUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  Chat with support
                </a>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <Clock className="w-4 h-4 text-app-muted mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-app-text">Hours</p>
                <p className="text-app-muted">{SUPPORT_CONTACT.hours}</p>
              </div>
            </li>
          </ul>
        </div>
        <a
          href="https://www.pbookspro.com/support.html"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between rounded-xl border border-app-border bg-app-card px-4 py-3 text-sm font-medium text-app-text hover:border-primary/30 hover:bg-app-table-hover transition-colors"
        >
          Public support center
          <ExternalLink className="w-4 h-4 text-app-muted" />
        </a>
      </div>
      <div className={`lg:col-span-3 ${cardClass}`}>
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
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-app-muted pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search guides, videos, updates…"
              className="w-full rounded-xl border border-app-border/20 bg-app-card pl-10 pr-4 py-3 text-sm text-app-text shadow-lg placeholder:text-app-muted focus:outline-none focus:ring-2 focus:ring-white/30 ds-input-field"
              aria-label="Search customer success content"
            />
          </div>
        </div>
      </div>

      {/* Global search results */}
      {searchQuery.trim() && searchResults.length > 0 && (
        <div className="mb-6 rounded-xl border border-primary/25 bg-primary/10 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-primary mb-3">
            {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} across all sections
          </p>
          <ul className="space-y-2 max-h-48 overflow-y-auto">
            {searchResults.slice(0, 12).map((r) => (
              <li key={`${r.sectionId}-${r.id}`}>
                <button
                  type="button"
                  onClick={() => handleSearchResultClick(r.sectionId, r.id)}
                  className="w-full text-left rounded-lg bg-app-card px-3 py-2 text-sm hover:bg-app-table-hover border border-app-border transition-colors"
                >
                  <span className="font-medium text-app-text">{r.title}</span>
                  <span className="ml-2 text-[10px] font-semibold uppercase text-primary">
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
            className="w-full rounded-xl border border-app-border bg-app-card px-4 py-3 text-sm font-medium text-app-text shadow-ds-card ds-input-field"
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
                  ? 'bg-primary/15 text-app-text shadow-ds-card ring-1 ring-primary/25'
                  : 'text-app-muted hover:bg-app-table-hover hover:text-app-text'
              }`}
            >
              <span
                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                  activeSection === section.id ? 'bg-primary text-ds-on-primary' : 'bg-app-toolbar text-app-muted'
                }`}
              >
                {SECTION_ICONS[section.icon]}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{section.label}</span>
                <span className="block text-[11px] text-app-muted mt-0.5 line-clamp-2">{section.description}</span>
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
                  ? 'bg-primary text-ds-on-primary'
                  : 'bg-app-toolbar text-app-muted hover:bg-app-table-hover'
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
            <h3 className="text-xl font-bold text-app-text">{activeMeta.label}</h3>
            <p className="text-sm text-app-muted mt-0.5">{activeMeta.description}</p>
          </header>
          {renderSectionContent()}
        </main>
      </div>
    </div>
  );
};

export default CustomerSuccessCenter;
