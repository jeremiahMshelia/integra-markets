'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import { motion } from 'framer-motion';
import { Bell } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

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

    // Pagination
    const [displayCount, setDisplayCount] = useState(ARTICLES_PER_PAGE);
    const [loadingMore, setLoadingMore] = useState(false);

    // Bookmarks state
    const [bookmarkedUrls, setBookmarkedUrls] = useState<Set<string>>(new Set());

    // Modal states
    const [selectedArticle, setSelectedArticle] = useState<NewsItem | null>(null);
    const [isAIModalOpen, setIsAIModalOpen] = useState(false);
    const [isProfileOpen, setIsProfileOpen] = useState(false);

    // Auth check
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

            // Load bookmarks
            const savedBookmarks = localStorage.getItem('integra_bookmarks');
            if (savedBookmarks) {
                const parsed = JSON.parse(savedBookmarks);
                setBookmarkedUrls(new Set(parsed.map((b: { id: string }) => b.id)));
            }
        };
        checkAuth();
    }, []);

    // Fetch news
    useEffect(() => {
        const fetchNews = async () => {
            try {
                const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://integra-markets-9zz1.onrender.com';
                const response = await fetch(`${apiUrl}/api/news/analysis?hours=24`);

                if (!response.ok) {
                    throw new Error('Failed to fetch news');
                }

                const data = await response.json();
                setArticles(data.articles || []);
            } catch (err) {
                console.error('Error fetching news:', err);
                setError('Failed to load news. Please try again.');
            } finally {
                setLoading(false);
            }
        };

        fetchNews();
    }, []);

    // Reset display count when filter changes
    useEffect(() => {
        setDisplayCount(ARTICLES_PER_PAGE);
    }, [activeFilter]);

    // Filter articles by sentiment
    const filteredArticles = activeFilter === 'All'
        ? articles
        : articles.filter(a =>
            a.sentiment?.toUpperCase() === activeFilter.toUpperCase()
        );

    // Paginated articles
    const displayedArticles = filteredArticles.slice(0, displayCount);
    const hasMore = displayCount < filteredArticles.length;

    // Handlers
    const handleAIClick = (article: NewsItem) => {
        setSelectedArticle(article);
        setIsAIModalOpen(true);
    };

    const handleBookmarkToggle = useCallback((article: NewsItem) => {
        const articleId = article.url || article.title;

        // Get current bookmarks
        const savedBookmarks = localStorage.getItem('integra_bookmarks');
        let bookmarks = savedBookmarks ? JSON.parse(savedBookmarks) : [];

        const exists = bookmarks.some((b: { id: string }) => b.id === articleId);

        if (exists) {
            bookmarks = bookmarks.filter((b: { id: string }) => b.id !== articleId);
        } else {
            bookmarks.push({
                id: articleId,
                title: article.title,
                source: article.source,
                sentiment: article.sentiment || 'NEUTRAL'
            });
        }

        localStorage.setItem('integra_bookmarks', JSON.stringify(bookmarks));
        setBookmarkedUrls(new Set(bookmarks.map((b: { id: string }) => b.id)));
    }, []);

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

    // Loading state
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
            {/* Header */}
            <DashboardHeader
                userEmail={user?.email}
                onProfileClick={() => setIsProfileOpen(true)}
            />

            {/* Main Content - Wider for Perplexity style */}
            <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                {/* Page Title */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center justify-between mb-6"
                >
                    <h1 className="text-2xl font-semibold text-white">Today</h1>
                    <button className="p-2 rounded-lg hover:bg-white/5 transition-colors">
                        <Bell size={22} className="text-zinc-400" />
                    </button>
                </motion.div>

                {/* Filter Tabs */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="mb-6"
                >
                    <FilterTabs
                        tabs={filterTabs}
                        activeTab={activeFilter}
                        onTabChange={setActiveFilter}
                    />
                </motion.div>

                {/* Error State */}
                {error && (
                    <div className="bg-[#F05454]/10 border border-[#F05454]/20 text-[#F05454] px-4 py-3 rounded-xl mb-6">
                        {error}
                    </div>
                )}

                {/* Empty State */}
                {filteredArticles.length === 0 && !error && (
                    <div className="text-center py-16">
                        <p className="text-zinc-500 mb-2">No {activeFilter.toLowerCase()} articles found.</p>
                        <button
                            onClick={() => setActiveFilter('All')}
                            className="text-[#4ECCA3] text-sm hover:underline"
                        >
                            View all articles
                        </button>
                    </div>
                )}

                {/* Two Column Grid for Desktop (Perplexity style) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {displayedArticles.map((article, index) => (
                        <motion.div
                            key={article.url + index}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: Math.min(index * 0.03, 0.3) }}
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

                {/* Load More Button */}
                {hasMore && (
                    <div className="text-center py-8">
                        <button
                            onClick={handleLoadMore}
                            disabled={loadingMore}
                            className="px-8 py-3 bg-[#1E1E1E] hover:bg-[#2a2a2a] text-white rounded-xl font-medium transition-colors border border-[#333] disabled:opacity-50"
                        >
                            {loadingMore ? (
                                <span className="flex items-center gap-2">
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    Loading...
                                </span>
                            ) : (
                                `Load More (${filteredArticles.length - displayCount} remaining)`
                            )}
                        </button>
                    </div>
                )}

                {/* Article Count */}
                {!hasMore && filteredArticles.length > 0 && (
                    <div className="text-center py-8">
                        <p className="text-zinc-600 text-sm">
                            Showing all {filteredArticles.length} articles
                        </p>
                    </div>
                )}
            </main>

            {/* AI Analysis Modal */}
            <AIAnalysisModal
                isOpen={isAIModalOpen}
                onClose={() => setIsAIModalOpen(false)}
                article={selectedArticle}
                onBookmark={handleBookmarkToggle}
                isBookmarked={selectedArticle ? bookmarkedUrls.has(selectedArticle.url || selectedArticle.title) : false}
            />

            {/* Profile Sidebar */}
            <ProfileSidebar
                isOpen={isProfileOpen}
                onClose={() => setIsProfileOpen(false)}
                user={user}
                onLogout={handleLogout}
            />
        </div>
    );
}
