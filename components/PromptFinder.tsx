"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  Clock3,
  Copy,
  FileText,
  Home,
  Image as ImageIcon,
  LibraryBig,
  Search,
  ShieldCheck,
  Sparkles,
  Video,
} from "lucide-react";
import { createPromptSearchIndex, searchPrompts } from "@/lib/search";
import OfflineControls from "@/components/OfflineControls";
import type { PromptCategory, PromptLibrary, PromptLibraryManifest, PromptModality, PromptRecord, PromptSourceInfo } from "@/types/prompt";

type Screen = "home" | "browse" | "prompt";
type ModalityFilter = "ALL" | PromptModality;

const RECENTS_KEY = "prompt-shelf-recent-v2";
const PAGE_SIZE = 60;
const MODALITIES: PromptModality[] = ["TEXT", "IMAGE", "VIDEO"];

async function loadLocalJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Local data file unavailable: ${path}`);
  return response.json() as Promise<T>;
}

function CategoryPill({ children }: { children: React.ReactNode }) {
  return <span className="category-pill">{children}</span>;
}

function SourceName({ sourceId, sources }: { sourceId: string; sources: PromptSourceInfo[] }) {
  return <>{sources.find((source) => source.id === sourceId)?.name ?? "Prompt source"}</>;
}

function SearchField({
  value,
  onChange,
  onSubmit,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
  label: string;
}) {
  return (
    <form
      role="search"
      aria-label={label}
      className="flex min-w-0 items-stretch gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        event.currentTarget.querySelector("input")?.blur();
        onSubmit();
      }}
    >
      <label className="search-box flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-line bg-white px-3 py-3 text-ink shadow-sm sm:gap-3 sm:px-5">
        <Search size={18} className="shrink-0 text-[#718078]" aria-hidden="true" />
        <input
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          className="min-w-0 w-full bg-transparent text-[16px] outline-none placeholder:text-[#99a39d]"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          aria-label={label}
        />
      </label>
      <button type="submit" className="search-submit">Search</button>
    </form>
  );
}

function ModalityIcon({ modality, size = 13 }: { modality: PromptModality; size?: number }) {
  if (modality === "IMAGE") return <ImageIcon size={size} />;
  if (modality === "VIDEO") return <Video size={size} />;
  return <FileText size={size} />;
}

function PromptCard({
  prompt,
  sources,
  onOpen,
}: {
  prompt: PromptRecord;
  sources: PromptSourceInfo[];
  onOpen: (id: string) => void;
}) {
  const snippet = prompt.description || prompt.content.replace(/\s+/g, " ").trim();
  const source = sources.find((item) => item.id === prompt.source.sourceId);
  return (
    <button className="prompt-card group" data-prompt-id={prompt.id} data-modality={prompt.modality} onClick={() => onOpen(prompt.id)}>
      <div className="flex items-start justify-between gap-5">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <CategoryPill>{prompt.category}</CategoryPill>
            <span className="inline-flex items-center gap-1.5 text-[10px] text-[#87928a]"><ModalityIcon modality={prompt.modality} size={12} />{prompt.modality.toLowerCase()}</span>
            <span className="text-[10px] text-[#9aa49e]">{source?.name ?? "Prompt library"}</span>
          </div>
          <h3 className="text-[16px] font-semibold tracking-[-0.02em] text-ink transition-colors group-hover:text-forest sm:text-[17px]">
            {prompt.title}
          </h3>
          <p className="mt-2 line-clamp-custom text-[13px] leading-[1.65] text-muted">{snippet}</p>
          {prompt.framework && <p className="mt-2 text-[10px] text-[#859188]">Framework · {prompt.framework}</p>}
        </div>
        <span className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-white text-[#809087] transition-all group-hover:border-forest group-hover:bg-forest group-hover:text-white">
          <ChevronRight size={17} strokeWidth={1.8} />
        </span>
      </div>
    </button>
  );
}

function LibraryNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-7 flex items-start gap-3 rounded-2xl border border-[#e8ece7] bg-[#f0f4ee] px-4 py-3.5 text-[11px] leading-5 text-[#66766b]">
      <ShieldCheck size={15} className="mt-0.5 shrink-0 text-forest" />
      <p><span className="font-semibold text-forest">Display-only library.</span> {children}</p>
    </div>
  );
}

export default function PromptFinder() {
  const [library, setLibrary] = useState<PromptLibrary | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [screen, setScreen] = useState<Screen>("home");
  const [query, setQuery] = useState("");
  const searchQuery = useDeferredValue(query);
  const isSearching = query !== searchQuery;
  const [searchRequested, setSearchRequested] = useState(false);
  const searchPanelRef = useRef<HTMLDivElement>(null);
  const resultsHeadingRef = useRef<HTMLHeadingElement>(null);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState("ALL");
  const [selectedModality, setSelectedModality] = useState<ModalityFilter>("ALL");
  const [returnScreen, setReturnScreen] = useState<"home" | "browse">("home");
  const [copied, setCopied] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const manifest = await loadLocalJson<PromptLibraryManifest>("/data/library.json");
        if (manifest.dataFiles.some(({ file }) => !/^\/data\/[a-z0-9-]+\.json$/.test(file))) throw new Error("The manifest contains a non-local data path");
        const datasets = await Promise.all(manifest.dataFiles.map(({ file }) => loadLocalJson<PromptRecord[]>(file)));
        const prompts = datasets.flat();
        if (prompts.length !== manifest.records) throw new Error("The local data files do not match the manifest");
        if (active) setLibrary({ ...manifest, prompts });
      } catch {
        if (active) setLoadError(true);
      }
    };
    void load();
    return () => { active = false; };
  }, []);

  const prompts = library?.prompts ?? [];
  const categories = library?.categories ?? [];
  const sources = library?.sources ?? [];
  const selectedPrompt = useMemo(
    () => prompts.find((prompt) => prompt.id === selectedPromptId) ?? null,
    [prompts, selectedPromptId],
  );
  const selectedCategory = categories.find((category) => category.id === selectedCategoryId) ?? null;
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const prompt of prompts) counts.set(prompt.categoryId, (counts.get(prompt.categoryId) ?? 0) + 1);
    return counts;
  }, [prompts]);
  const topCategories = useMemo(() => [...categories].sort((a, b) => (categoryCounts.get(b.id) ?? 0) - (categoryCounts.get(a.id) ?? 0)).slice(0, 6), [categories, categoryCounts]);
  const recentPrompts = recentIds.map((id) => prompts.find((prompt) => prompt.id === id)).filter((prompt): prompt is PromptRecord => Boolean(prompt));
  const searchIndex = useMemo(() => createPromptSearchIndex(prompts), [prompts]);
  // Share one ranked result set between Home's preview and Browse; never rescan the hidden screen.
  const searchResults = useMemo(() => searchPrompts(searchQuery, searchIndex, prompts.length).map((item) => item.prompt), [searchQuery, searchIndex, prompts.length]);
  const homeResults = searchResults.slice(0, 6);
  const browseResults = useMemo(() => {
    const matching = searchQuery.trim() ? searchResults : prompts;
    return matching.filter((prompt) => {
      const categoryMatches = !selectedCategoryId || prompt.categoryId === selectedCategoryId;
      const sourceMatches = selectedSourceId === "ALL" || prompt.source.sourceId === selectedSourceId;
      const modalityMatches = selectedModality === "ALL" || prompt.modality === selectedModality;
      return categoryMatches && sourceMatches && modalityMatches;
    });
  }, [searchQuery, searchResults, prompts, selectedCategoryId, selectedSourceId, selectedModality]);

  useEffect(() => {
    if (!searchRequested || screen !== "browse" || isSearching) return;
    const frame = window.requestAnimationFrame(() => {
      resultsHeadingRef.current?.focus({ preventScroll: true });
      searchPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      setSearchRequested(false);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [searchRequested, screen, isSearching, searchQuery]);

  useEffect(() => {
    if (!library) return;
    try {
      const saved = window.localStorage.getItem(RECENTS_KEY);
      if (!saved) return;
      const ids: unknown = JSON.parse(saved);
      if (Array.isArray(ids)) setRecentIds(ids.filter((id): id is string => typeof id === "string" && prompts.some((prompt) => prompt.id === id)).slice(0, 6));
    } catch {
      // Recents are optional; a blocked storage API is harmless.
    }
  }, [library, prompts]);

  function persistRecents(ids: string[]) {
    setRecentIds(ids);
    try {
      window.localStorage.setItem(RECENTS_KEY, JSON.stringify(ids));
    } catch {
      // The library remains fully usable when browser storage is unavailable.
    }
  }

  function submitSearch() {
    setQuery(query.trim());
    setVisibleCount(PAGE_SIZE);
    if (screen === "home") {
      setSelectedCategoryId(null);
      setSelectedSourceId("ALL");
      setSelectedModality("ALL");
      setScreen("browse");
    }
    setSearchRequested(true);
  }

  function openPrompt(id: string) {
    setReturnScreen(screen === "browse" ? "browse" : "home");
    setSelectedPromptId(id);
    setScreen("prompt");
    persistRecents([id, ...recentIds.filter((recentId) => recentId !== id)].slice(0, 6));
    setCopied(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goHome() {
    setScreen("home");
    setSelectedCategoryId(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goBrowse(categoryId: string | null = null) {
    setScreen("browse");
    setSelectedCategoryId(categoryId);
    setVisibleCount(PAGE_SIZE);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function copyPrompt() {
    if (!selectedPrompt) return;
    try {
      await navigator.clipboard.writeText(selectedPrompt.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  const isLoading = !library && !loadError;

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-line/80 bg-white/80">
        <div className="mx-auto flex max-w-[1160px] items-center justify-between gap-4 px-5 py-4 sm:px-8 lg:px-10">
          <button className="flex items-center gap-3 text-left" onClick={goHome} aria-label="MEH AI prompt digital library home">
            <span className="brand-mark"><BookOpen size={19} strokeWidth={2.2} /></span>
            <span>
              <span className="block text-[15px] font-bold tracking-[-0.035em]">MEH AI prompt digital library</span>
              <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-[0.15em] text-[#849188]">Cross-model library</span>
            </span>
          </button>
          <nav className="flex items-center gap-1 rounded-full border border-line bg-[#fafbf9] p-1" aria-label="Main navigation">
            <button className={`nav-button ${screen === "home" || (screen === "prompt" && returnScreen === "home") ? "nav-button-active" : ""}`} onClick={goHome}>
              <Home size={15} /> <span>Home</span>
            </button>
            <button className={`nav-button ${screen === "browse" || (screen === "prompt" && returnScreen === "browse") ? "nav-button-active" : ""}`} onClick={() => goBrowse()}>
              <LibraryBig size={15} /> <span>Browse</span>
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[1160px] px-5 pb-16 pt-8 sm:px-8 sm:pt-11 lg:px-10">
        <OfflineControls />
        {isLoading && <div className="empty-card">Loading the local prompt library…</div>}
        {loadError && (
          <div className="empty-card">
            <h1 className="text-[22px] font-semibold">The local library could not be loaded</h1>
            <p className="mt-2 text-[13px] leading-6 text-muted">Check that the bundled <code>/data/library.json</code> manifest and source JSON files are present, then reload this page.</p>
          </div>
        )}

        {library && screen === "home" && (
          <>
            <section className="relative overflow-hidden rounded-[28px] bg-forest px-6 py-8 text-white shadow-card sm:px-10 sm:py-11">
              <div className="hero-orb hero-orb-one" />
              <div className="hero-orb hero-orb-two" />
              <div className="relative z-10 max-w-[720px]">
                <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-medium text-white/80">
                  <Sparkles size={13} className="text-leaf" /> {prompts.length.toLocaleString()} prompt records · {sources.length} licensed datasets
                </div>
                <h1 className="max-w-[640px] text-[37px] font-semibold leading-[1.06] tracking-[-0.055em] sm:text-[50px]">
                  Find a prompt for <span className="text-leaf">what you need.</span>
                </h1>
                <p className="mt-4 max-w-[560px] text-[14px] leading-6 text-white/70 sm:text-[15px]">
                  Search reusable templates across writing, research, coding, image and video tasks. Browse once, then adapt them to your AI platform.
                </p>
                <div className="mt-5"><SearchField value={query} onChange={setQuery} onSubmit={submitSearch} placeholder="Try “email” or “image”…" label="Search local prompts" /></div>
                <p role="status" aria-live="polite" className="mt-3 text-[12px] text-white/85">
                  {query.trim() ? (isSearching ? "Finding local matches…" : `${searchResults.length.toLocaleString()} ${searchResults.length === 1 ? "match" : "matches"}. Tap Search to view results.`) : "Type a task, then tap Search or press Enter."}
                </p>
                <p className="mt-2 text-[11px] text-white/55">Search uses the local JSON library in your browser. No sign-in, AI service, analytics or external database.</p>
              </div>
            </section>

            <div className="mt-5 flex flex-wrap gap-2 text-[10px] text-muted">
              <span className="rounded-full border border-line bg-white px-3 py-1.5">{categories.length} topic groups</span>
              <span className="rounded-full border border-line bg-white px-3 py-1.5">Text · image · video</span>
              <span className="rounded-full border border-line bg-white px-3 py-1.5">ChatGPT · Claude · Gemini · more</span>
              <span className="rounded-full border border-line bg-white px-3 py-1.5">Compatibility not independently tested</span>
            </div>

            <section className="mt-8">
              {searchQuery.trim() ? (
                <>
                  <div className="mb-4 flex items-end justify-between gap-4">
                    <div>
                      <p className="eyebrow">LOCAL SEARCH</p>
                      <h2 className="section-heading mt-1">{homeResults.length ? `Top matches for “${searchQuery}”` : "No close matches"}</h2>
                    </div>
                    <button className="text-button" onClick={submitSearch}>Browse all results <ArrowUpRight size={14} /></button>
                  </div>
                  {homeResults.length ? (
                    <div className="space-y-3">{homeResults.map((prompt) => <PromptCard key={prompt.id} prompt={prompt} sources={sources} onOpen={openPrompt} />)}</div>
                  ) : (
                    <div className="empty-card">
                      <h3 className="font-semibold text-ink">Nothing matched that search</h3>
                      <p className="mt-2 text-[13px] leading-6 text-muted">Try a task, topic, format or source category, such as “planning”, “writing”, “image”, or “customer support”.</p>
                      <button className="text-button mt-4" onClick={() => setQuery("")}>Clear search <ArrowUpRight size={14} /></button>
                    </div>
                  )}
                </>
              ) : (
                <div className="grid gap-8 lg:grid-cols-[1.25fr_0.75fr]">
                  <div>
                    <div className="mb-4 flex items-end justify-between gap-4">
                      <div>
                        <p className="eyebrow">PICK UP WHERE YOU LEFT OFF</p>
                        <h2 className="section-heading mt-1">Recent prompts</h2>
                      </div>
                      {recentPrompts.length > 0 && <span className="pb-1 text-[11px] text-muted">Saved on this device</span>}
                    </div>
                    {recentPrompts.length ? (
                      <div className="space-y-3">{recentPrompts.slice(0, 3).map((prompt) => <PromptCard key={prompt.id} prompt={prompt} sources={sources} onOpen={openPrompt} />)}</div>
                    ) : (
                      <div className="empty-card flex min-h-[170px] flex-col justify-center">
                        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[#f0f3ef] text-[#7c8d82]"><Clock3 size={18} /></div>
                        <h3 className="font-semibold text-ink">Your recent prompts will appear here</h3>
                        <p className="mt-2 max-w-[450px] text-[13px] leading-6 text-muted">Open any record to add it to on-device history. No account or server storage is used.</p>
                      </div>
                    )}
                    <div className="mt-8 mb-4 flex items-end justify-between gap-4">
                      <div>
                        <p className="eyebrow">EXPLORE BY TASK</p>
                        <h2 className="section-heading mt-1">Popular topics</h2>
                      </div>
                      <button className="text-button" onClick={() => goBrowse()}>All topics <ArrowUpRight size={14} /></button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {topCategories.slice(0, 4).map((category) => (
                        <button key={category.id} className="category-row rounded-2xl border border-line bg-white" onClick={() => goBrowse(category.id)}>
                          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f1f5ed] text-forest"><FileText size={16} /></span>
                          <span className="min-w-0 flex-1 text-left">
                            <span className="block text-[13px] font-semibold text-ink">{category.name}</span>
                            <span className="mt-0.5 block truncate text-[11px] text-muted">{category.description}</span>
                          </span>
                          <span className="text-[11px] text-muted">{(categoryCounts.get(category.id) ?? 0).toLocaleString()}</span><ChevronRight size={16} className="text-[#a3ada6]" />
                        </button>
                      ))}
                    </div>
                  </div>
                  <aside>
                    <div className="mb-4">
                      <p className="eyebrow">LOCAL SOURCE DATA</p>
                      <h2 className="section-heading mt-1">Source libraries</h2>
                    </div>
                    <div className="space-y-3">
                      {sources.map((source) => (
                        <div key={source.id} className="rounded-2xl border border-line bg-white p-4">
                          <div className="flex items-start justify-between gap-3">
                            <h3 className="text-[13px] font-semibold text-ink">{source.name}</h3>
                            <span className="shrink-0 rounded-full border border-line bg-[#fafbf9] px-2 py-1 text-[9px] text-muted">{source.license}</span>
                          </div>
                          <p className="mt-2 text-[11px] leading-5 text-muted">{source.recordsIncluded.toLocaleString()} included · {source.version}</p>
                          <a className="source-link mt-2 text-[11px]" href={source.canonicalUrl} target="_blank" rel="noreferrer">Source and attribution <ArrowUpRight size={12} /></a>
                        </div>
                      ))}
                    </div>
                    <LibraryNote>{library.compatibilityNote}</LibraryNote>
                  </aside>
                </div>
              )}
            </section>
          </>
        )}

        {library && screen === "browse" && (
          <section>
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="eyebrow">THE LOCAL PROMPT LIBRARY</p>
                <h1 className="mt-2 text-[34px] font-semibold tracking-[-0.05em] sm:text-[40px]">Browse prompts</h1>
                <p className="mt-2 max-w-[650px] text-[14px] leading-6 text-muted">Filter {prompts.length.toLocaleString()} records by topic, source, or format.</p>
              </div>
              <span className="mb-1 rounded-full border border-line bg-white px-3 py-1.5 text-[11px] text-muted">Local JSON · no external database</span>
            </div>

            <div ref={searchPanelRef} className="scroll-mt-5 rounded-2xl border border-line bg-white p-3 sm:p-4">
              <SearchField value={query} onChange={(value) => { setQuery(value); setVisibleCount(PAGE_SIZE); }} onSubmit={submitSearch} placeholder="Search titles, topics, tags, or prompt text…" label="Search prompts in Browse" />
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <label className="filter-label">Topic
                  <select className="filter-select" value={selectedCategoryId ?? "ALL"} onChange={(event) => { setSelectedCategoryId(event.target.value === "ALL" ? null : event.target.value); setVisibleCount(PAGE_SIZE); }}>
                    <option value="ALL">All topics</option>
                    {categories.map((category) => <option key={category.id} value={category.id}>{category.name} ({(categoryCounts.get(category.id) ?? 0).toLocaleString()})</option>)}
                  </select>
                </label>
                <label className="filter-label">Format
                  <select className="filter-select" value={selectedModality} onChange={(event) => { setSelectedModality(event.target.value as ModalityFilter); setVisibleCount(PAGE_SIZE); }}>
                    <option value="ALL">All formats</option>
                    {MODALITIES.map((modality) => <option key={modality} value={modality}>{modality.charAt(0) + modality.slice(1).toLowerCase()}</option>)}
                  </select>
                </label>
                <label className="filter-label">Source
                  <select className="filter-select" value={selectedSourceId} onChange={(event) => { setSelectedSourceId(event.target.value); setVisibleCount(PAGE_SIZE); }}>
                    <option value="ALL">All sources</option>
                    {sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
                  </select>
                </label>
              </div>
            </div>

            <div aria-live="polite" aria-atomic="true" className="mb-3 mt-6 flex flex-wrap items-center justify-between gap-2">
              <h2 ref={resultsHeadingRef} tabIndex={-1} className="text-[13px] font-semibold text-ink">{isSearching ? "Searching local prompts…" : `${browseResults.length.toLocaleString()} matching ${browseResults.length === 1 ? "record" : "records"}${searchQuery.trim() ? ` for “${searchQuery}”` : ""}`}</h2>
              <span className="text-[10px] text-muted">Showing {Math.min(visibleCount, browseResults.length).toLocaleString()} of {browseResults.length.toLocaleString()}</span>
            </div>
            {browseResults.length ? (
              <>
                <div className="space-y-3">{browseResults.slice(0, visibleCount).map((prompt) => <PromptCard key={prompt.id} prompt={prompt} sources={sources} onOpen={openPrompt} />)}</div>
                {visibleCount < browseResults.length && <button className="load-more mt-5" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>Load {Math.min(PAGE_SIZE, browseResults.length - visibleCount)} more</button>}
              </>
            ) : (
              <div className="empty-card mt-4">
                <h3 className="font-semibold text-ink">No prompts match these filters</h3>
                <p className="mt-2 text-[13px] leading-6 text-muted">Clear one or more filters, or try a broader task keyword.</p>
                <button className="text-button mt-4" onClick={() => { setQuery(""); setSelectedCategoryId(null); setSelectedSourceId("ALL"); setSelectedModality("ALL"); }}>Clear filters <ArrowUpRight size={14} /></button>
              </div>
            )}
            <LibraryNote>Prompt content is rendered as plain text and is never evaluated or sent anywhere. Compatibility notes come from dataset descriptions and are not model tests.</LibraryNote>
          </section>
        )}

        {library && screen === "prompt" && selectedPrompt && (
          <section className="mx-auto max-w-[890px]">
            <button className="back-link mb-6" onClick={() => setScreen(returnScreen)}><ArrowLeft size={15} /> Back to {returnScreen === "browse" ? "browse" : "home"}</button>
            <div className="rounded-[24px] border border-line bg-white p-5 shadow-card sm:p-8">
              <div className="flex flex-wrap items-center gap-2">
                <CategoryPill>{selectedPrompt.category}</CategoryPill>
                <span className="inline-flex items-center gap-1.5 text-[11px] text-muted"><ModalityIcon modality={selectedPrompt.modality} size={13} /> {selectedPrompt.modality.toLowerCase()}</span>
                {selectedPrompt.framework && <span className="tag-chip">{selectedPrompt.framework}</span>}
                {selectedPrompt.difficulty && <span className="tag-chip">{selectedPrompt.difficulty}</span>}
              </div>
              <div className="mt-4 flex flex-wrap items-start justify-between gap-5">
                <div className="max-w-[650px]">
                  <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.045em] sm:text-[36px]">{selectedPrompt.title}</h1>
                  <p className="mt-3 text-[14px] leading-6 text-muted">{selectedPrompt.description}</p>
                </div>
                <button className={`copy-button ${copied ? "copy-button-success" : ""}`} onClick={copyPrompt}>
                  {copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Copied" : "Copy text"}
                </button>
              </div>

              <div className="mt-7 rounded-2xl border border-[#e8ece7] bg-[#fafbf9] p-4 sm:p-6">
                <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#87928a]"><FileText size={13} /> Original prompt text · display only</div>
                <pre className="prompt-content">{selectedPrompt.content}</pre>
              </div>

              {selectedPrompt.alternates.length > 0 && <div className="metadata-card mt-5"><h2>Source-provided alternate text</h2>{selectedPrompt.alternates.map((alternate, index) => <div key={`${alternate.language}-${index}`} className="mt-3"><p className="mb-2 text-[10px] text-muted">Language · {alternate.language}</p><pre className="prompt-content">{alternate.content}</pre></div>)}</div>}
              {selectedPrompt.targetText.length > 0 && <div className="metadata-card mt-5"><h2>Source-provided target text annotation</h2><ul>{selectedPrompt.targetText.map((value, index) => <li key={`${index}-${value}`}>{value}</li>)}</ul></div>}

              {(selectedPrompt.variables.length > 0 || selectedPrompt.constraints.length > 0) && (
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  {selectedPrompt.variables.length > 0 && <div className="metadata-card"><h2>Source-listed variables</h2><ul>{selectedPrompt.variables.map((value, index) => <li key={`${index}-${value}`}>{value}</li>)}</ul></div>}
                  {selectedPrompt.constraints.length > 0 && <div className="metadata-card"><h2>Source-listed constraints</h2><ul>{selectedPrompt.constraints.map((value, index) => <li key={`${index}-${value}`}>{value}</li>)}</ul></div>}
                </div>
              )}

              <div className="mt-5 rounded-2xl border border-line bg-white px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[12px] font-semibold text-ink"><SourceName sourceId={selectedPrompt.source.sourceId} sources={sources} /></p>
                    <p className="mt-1 text-[11px] leading-5 text-muted">{selectedPrompt.source.attribution} · {selectedPrompt.source.license}</p>
                  </div>
                  <a className="source-link shrink-0 text-[11px]" href={selectedPrompt.source.licenseUrl} target="_blank" rel="noreferrer">License <ArrowUpRight size={12} /></a>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 border-t border-line pt-3 text-[10px] text-muted">
                  <a className="source-link" href={selectedPrompt.source.recordUrl} target="_blank" rel="noreferrer">View source record <ArrowUpRight size={12} /></a>
                  <span>Revision {selectedPrompt.source.revision.slice(0, 12)}</span>
                  <span>Line {selectedPrompt.source.line}</span>
                </div>
              </div>
              <LibraryNote>{library.compatibilityNote}</LibraryNote>
              {selectedPrompt.tags.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{selectedPrompt.tags.map((tag, index) => <span key={`${index}-${tag}`} className="tag-chip">{tag}</span>)}</div>}
            </div>
          </section>
        )}

        {library && screen === "prompt" && !selectedPrompt && (
          <div className="empty-card"><h1 className="text-[20px] font-semibold">That prompt record is unavailable</h1><button className="text-button mt-4" onClick={goHome}>Return home <ArrowUpRight size={14} /></button></div>
        )}
      </main>

      <footer className="border-t border-line/80 bg-white/60">
        <div className="mx-auto flex max-w-[1160px] flex-col gap-2 px-5 py-5 text-[10px] text-[#8b9690] sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
          <span>MEH AI prompt digital library · local-first prompt finder</span>
          <span>{prompts.length.toLocaleString()} source records · no accounts · no external database</span>
        </div>
      </footer>
    </div>
  );
}
