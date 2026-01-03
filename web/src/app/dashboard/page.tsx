'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import { motion } from 'framer-motion';
import { Bell } from 'lucide-react';

import DashboardHeader from '@/components/dashboard/DashboardHeader';
import FilterTabs, { FilterType } from '@/components/dashboard/FilterTabs';
import NewsCard, { NewsItem } from '@/components/dashboard/NewsCard';
import AIAnalysisModal from '@/components/dashboard/AIAnalysisModal';
import ProfileSidebar from '@/components/dashboard/ProfileSidebar';

const filterTabs: FilterType[] = ['All', 'Bullish', 'Neutral', 'Bearish'];
const ARTICLES_PER_PAGE = 10;

export default function Dashboard() {
    const [articles, setArticles] = useState<NewsItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [activeFilter, setActiveFilter] = useState<FilterType>('All');
    const [user, setUser] = useState<{ email?: string; name?: string; avatar_url?: string } | null>(null);

    const [displayCount, setDisplayCount] = useState(ARTICLES_PER_PAGE);
    const [loadingMore, setLoadingMore] = useState(false);
    const [bookmarkedUrls, setBookmarkedUrls] = useState<Set<string>>(new Set());

    const [selectedArticle, setSelectedArticle] = useState<NewsItem | null>(null);
    const [isAIModalOpen, setIsAIModalOpen] = useState(false);
    const [isProfileOpen, setIsProfileOpen] = useState(false);

    useEffect(() => {
        const checkAuth = async () => {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                window.location.href = '/login';
                return;
            }
            setUser({
                email: user.email,
                name: user.user_metadata?.full_name || user.email?.split('@')[0],
                avatar_url: user.user_metadata?.avatar_url
            });

            const savedBookmarks = localStorage.getItem('integra_bookmarks');
            if (savedBookmarks) {
                const parsed = JSON.parse(savedBookmarks);
                setBookmarkedUrls(new Set(parsed.map((b: { id: string }) => b.id)));
            }
        };
        checkAuth();
    }, []);

    const loadBookmarks = async (userId: string) => {
        try {
            const supabase = createClient();
            const { data, error } = await supabase
                .from('bookmarks')
                .select('article_id')
                .eq('user_id', userId);

            if (data) {
                setBookmarkedUrls(new Set(data.map(b => b.article_id)));
            }
        } catch (e) {
            console.error('Error loading bookmarks:', e);
        }
    };

    const fetchNews = async (commodities: string[] | null) => {
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://integra-markets-9zz1.onrender.com';

            let newsData = { articles: [] };
            const cacheBuster = `?t=${Date.now()}`;

            try {
                console.log('Fetching news with commodities:', commodities);
                // Try POST /api/news/latest first (same as mobile)
                const response = await fetch(`${apiUrl}/api/news/latest${cacheBuster}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ commodities: commodities, hours: 24 }),
                });

                if (response.ok) {
                    newsData = await response.json();
                    console.log('Got news from POST /news/latest:', newsData.articles?.[0]);
                }
            } catch (e) {
                console.log('POST /news/latest failed, trying GET /news/analysis');
            }

            // Fallback to GET /api/news/analysis
            if (!newsData.articles || newsData.articles.length === 0) {
                const response = await fetch(`${apiUrl}/api/news/analysis?hours=24&t=${Date.now()}`);
                if (response.ok) {
                    newsData = await response.json();
                    console.log('Got news from GET /news/analysis:', newsData.articles?.[0]);
                }
            }

            // Normalize sentiment data and log what we received
            const normalizedArticles = (newsData.articles || []).map((article: NewsItem) => {
                // Normalize sentiment to uppercase
                if (article.sentiment) {
                    article.sentiment = article.sentiment.toUpperCase();
                }
                console.log(`[Backend] ${article.title?.slice(0, 40)}... sentiment=${article.sentiment} score=${article.sentiment_score}`);
                return article;
            });

            setArticles(normalizedArticles);

            // Only enrich images, NOT sentiment (trust backend data)
            if (normalizedArticles.length > 0) {
                enrichArticleImages(normalizedArticles);
            }
        } catch (err) {
            console.error('Error fetching news:', err);
            setError('Failed to load news. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const checkAuthAndLoadData = async () => {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                window.location.href = '/login';
                return;
            }
            setUser({
                email: user.email,
                name: user.user_metadata?.full_name || user.email?.split('@')[0],
                avatar_url: user.user_metadata?.avatar_url
            });

            // Load bookmarks
            loadBookmarks(user.id);

            // Fetch News with User's Commodities
            let userCommodities = ['Oil', 'Gold', 'Gas']; // Default to bypass stale general cache
            try {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('market_focus')
                    .eq('id', user.id)
                    .single();

                if (profile?.market_focus && Array.isArray(profile.market_focus) && profile.market_focus.length > 0) {
                    userCommodities = profile.market_focus;
                }
            } catch (e) {
                console.error('Error fetching profile commodities:', e);
            }

            fetchNews(userCommodities);
        };
        checkAuthAndLoadData();
    }, []);

    // Only enrich images, NOT sentiment - sentiment comes from backend
    const enrichArticleImages = async (rawArticles: NewsItem[]) => {
        const enriched = [...rawArticles];

        const enrichSingle = async (article: NewsItem, index: number) => {
            // Only enrich Image if missing
            const needsImage = !article.image_url && !article.banner_image;

            if (needsImage && article.url) {
                try {
                    const imgRes = await fetch('/api/meta-image', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url: article.url })
                    });

                    if (imgRes.ok) {
                        const imgData = await imgRes.json();
                        if (imgData.imageUrl) {
                            enriched[index] = {
                                ...article,
                                image_url: imgData.imageUrl
                            };
                        }
                    }
                } catch (e) {
                    console.error('Image enrichment error:', e);
                }
            }
        };

        // Process in chunks
        const chunkSize = 5;
        for (let i = 0; i < enriched.length; i += chunkSize) {
            const chunk = enriched.slice(i, i + chunkSize);
            await Promise.all(chunk.map((a, idx) => enrichSingle(a, i + idx)));
            setArticles([...enriched]);
        }
    };

    useEffect(() => {
        setDisplayCount(ARTICLES_PER_PAGE);
    }, [activeFilter]);

    const filteredArticles = activeFilter === 'All'
        ? articles
        : articles.filter(a => a.sentiment?.toUpperCase() === activeFilter.toUpperCase());

    const displayedArticles = filteredArticles.slice(0, displayCount);
    const hasMore = displayCount < filteredArticles.length;

    const handleAIClick = (article: NewsItem) => {
        setSelectedArticle(article);
        setIsAIModalOpen(true);
    };

    const handleBookmarkToggle = useCallback(async (article: NewsItem) => {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const articleId = article.url || article.title;
        const isBookmarked = bookmarkedUrls.has(articleId);

        // Optimistic Update
        setBookmarkedUrls(prev => {
            const next = new Set(prev);
            if (isBookmarked) next.delete(articleId);
            else next.add(articleId);
            return next;
        });

        try {
            if (isBookmarked) {
                // Remove from Supabase
                await supabase
                    .from('bookmarks')
                    .delete()
                    .eq('user_id', user.id)
                    .eq('article_id', articleId);
            } else {
                // Add to Supabase
                await supabase
                    .from('bookmarks')
                    .insert({
                        user_id: user.id,
                        article_id: articleId,
                        title: article.title,
                        url: article.url,
                        source: article.source,
                        sentiment: article.sentiment,
                        sentiment_score: article.sentiment_score,
                        image_url: article.image_url,
                        published_at: article.published,
                    });
            }
        } catch (error) {
            console.error('Error toggling bookmark:', error);
            // Revert optimistic update on error if needed
            loadBookmarks(user.id);
        }
    }, [bookmarkedUrls]);

    const handleLoadMore = () => {
        setLoadingMore(true);
        setTimeout(() => {
            setDisplayCount(prev => prev + ARTICLES_PER_PAGE);
            setLoadingMore(false);
        }, 300);
    };

    const handleLogout = async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        window.location.href = '/';
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#121212] flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-2 border-[#4ECCA3] border-t-transparent rounded-full animate-spin" />
                    <p className="text-zinc-400 text-sm">Loading news feed...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#121212]">
            <DashboardHeader userEmail={user?.email} onProfileClick={() => setIsProfileOpen(true)} />

            <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
                {/* Page Title & Controls */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-white mb-1">Today</h1>
                        <p className="text-zinc-400 text-sm">Your AI-curated market intelligence feed</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <FilterTabs tabs={filterTabs} activeTab={activeFilter} onTabChange={setActiveFilter} />
                        <button className="p-2.5 rounded-full bg-[#1C1C1E] border border-[#333] hover:bg-[#2a2a2a] transition-colors">
                            <Bell size={20} className="text-zinc-400" />
                        </button>
                    </div>
                </motion.div>

                {error && <div className="bg-[#F05454]/10 border border-[#F05454]/20 text-[#F05454] px-4 py-3 rounded-xl mb-6">{error}</div>}

                {filteredArticles.length === 0 && !error && !loading && (
                    <div className="text-center py-24 bg-[#1C1C1E] rounded-3xl border border-[#2a2a2a] border-dashed">
                        <p className="text-zinc-500 mb-4 text-lg">No {activeFilter.toLowerCase()} articles found.</p>
                        <button onClick={() => setActiveFilter('All')} className="px-6 py-2 bg-[#2a2a2a] rounded-full text-white text-sm font-medium hover:bg-[#333] transition-colors">Clear Filters</button>
                    </div>
                )}

                {/* News Feed Grid System */}
                <div className="space-y-8">
                    {/* Featured Article (First Item) */}
                    {displayedArticles.length > 0 && (
                        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }}>
                            <NewsCard
                                featured={true}
                                item={displayedArticles[0]}
                                onAIClick={handleAIClick}
                                isBookmarked={bookmarkedUrls.has(displayedArticles[0].url || displayedArticles[0].title)}
                                onBookmarkToggle={handleBookmarkToggle}
                            />
                        </motion.div>
                    )}

                    {/* Grid for remaining articles (2 Columns) */}
                    {displayedArticles.length > 1 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {displayedArticles.slice(1).map((article, index) => (
                                <motion.div
                                    key={article.url + index}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: index * 0.05 }}
                                >
                                    <NewsCard
                                        item={article}
                                        onAIClick={handleAIClick}
                                        isBookmarked={bookmarkedUrls.has(article.url || article.title)}
                                        onBookmarkToggle={handleBookmarkToggle}
                                    />
                                </motion.div>
                            ))}
                        </div>
                    )}
                </div>

                {hasMore && (
                    <div className="text-center py-12">
                        <button onClick={handleLoadMore} disabled={loadingMore} className="group relative px-8 py-3 bg-[#1C1C1E] border border-[#333] rounded-full overflow-hidden hover:border-[#4ECCA3]/50 transition-colors disabled:opacity-50">
                            <span className="relative z-10 flex items-center gap-2 text-white font-medium">
                                {loadingMore ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> :
                                    (<><span>Load More Stories</span><span className="text-zinc-500 text-xs">({filteredArticles.length - displayCount} remaining)</span></>)
                                }
                            </span>
                        </button>
                    </div>
                )}

                {!hasMore && filteredArticles.length > 0 && (
                    <div className="text-center py-12 border-t border-[#2a2a2a] mt-12">
                        <p className="text-zinc-600">You've reached the end of the feed.</p>
                    </div>
                )}
            </main>

            <AIAnalysisModal
                isOpen={isAIModalOpen}
                onClose={() => setIsAIModalOpen(false)}
                article={selectedArticle}
                onBookmark={handleBookmarkToggle}
                isBookmarked={selectedArticle ? bookmarkedUrls.has(selectedArticle.url || selectedArticle.title) : false}
            />

            <ProfileSidebar isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} user={user} onLogout={handleLogout} />
        </div>
    );
}
