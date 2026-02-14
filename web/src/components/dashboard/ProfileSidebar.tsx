'use client';

import { useState, useRef, useEffect } from 'react';
import { X, LogOut, User, ChevronRight, Bookmark, Settings, Trash2, Camera } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';

interface BookmarkItem {
    id: string;
    title: string;
    source: string;
    sentiment: string;
    url: string;
    summary: string;
    published: string;
    image_url?: string;
    sentiment_score?: number;
}

interface UserProfile {
    id?: string;
    email?: string;
    username?: string;
    role?: string;
    avatar_url?: string;
    market_focus?: string[];
    experience_level?: string;
    bio?: string;
}

interface ProfileSidebarProps {
    isOpen: boolean;
    onClose: () => void;
    user: { email?: string; name?: string; avatar_url?: string } | null;
    onLogout: () => void;
    onBookmarkClick?: (item: any) => void;
}

const getSentimentColor = (sentiment: string): string => {
    switch (sentiment?.toUpperCase()) {
        case 'BULLISH': return '#4ECCA3';
        case 'BEARISH': return '#F05454';
        case 'NEUTRAL': return '#EAB308';
        default: return '#888888';
    }
};

const MaterialSettings = ({ size = 18, className = "" }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="currentColor"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .43-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
    </svg>
);

export default function ProfileSidebar({ isOpen, onClose, user, onLogout, onBookmarkClick }: ProfileSidebarProps) {
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [avatarUrl, setAvatarUrl] = useState<string>('');
    const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
    const [commoditiesCount, setCommoditiesCount] = useState<number | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [showAllBookmarks, setShowAllBookmarks] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setIsLoading(true);
            Promise.all([loadProfile(), loadBookmarks(), loadAlertPreferences()])
                .finally(() => setIsLoading(false));
        }
    }, [isOpen]);

    const loadProfile = async () => {
        try {
            const supabase = createClient();
            const { data: { user: authUser } } = await supabase.auth.getUser();

            if (authUser) {
                const { data: profileData } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', authUser.id)
                    .single();

                if (profileData) {
                    setProfile(profileData);
                    if (profileData.avatar_url) setAvatarUrl(profileData.avatar_url);
                }
            }
        } catch (error) {
            console.error('Error loading profile:', error);
        }
    };

    const loadAlertPreferences = async () => {
        try {
            const supabase = createClient();
            const { data: { user: authUser } } = await supabase.auth.getUser();
            if (!authUser) return;

            // Try to get commodities from alert_preferences first
            const { data } = await supabase
                .from('alert_preferences')
                .select('commodities')
                .eq('user_id', authUser.id)
                .single();

            if (data?.commodities && data.commodities.length > 0) {
                setCommoditiesCount(data.commodities.length);
            } else {
                // Fallback to market_focus from profiles
                const { data: profileData } = await supabase
                    .from('profiles')
                    .select('market_focus')
                    .eq('id', authUser.id)
                    .single();

                if (profileData?.market_focus && Array.isArray(profileData.market_focus)) {
                    setCommoditiesCount(profileData.market_focus.length);
                }
            }
        } catch (e) {
            // Fallback to profile if alert_preferences doesn't exist
            try {
                const supabase = createClient();
                const { data: { user: authUser } } = await supabase.auth.getUser();
                if (!authUser) return;

                const { data: profileData } = await supabase
                    .from('profiles')
                    .select('market_focus')
                    .eq('id', authUser.id)
                    .single();

                if (profileData?.market_focus && Array.isArray(profileData.market_focus)) {
                    setCommoditiesCount(profileData.market_focus.length);
                }
            } catch {
                console.error('Error loading preferences');
            }
        }
    };

    const loadBookmarks = async () => {
        try {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data, error } = await supabase
                .from('bookmarks')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            if (data) {
                setBookmarks(data.map(b => ({
                    id: b.article_id,
                    title: b.title || 'Untitled',
                    source: b.source || 'Unknown',
                    sentiment: b.sentiment || 'NEUTRAL',
                    url: b.url || '',
                    summary: '', // Bookmarks don't store summary, but needed for NewsItem
                    published: b.published_at || new Date().toISOString(),
                    image_url: b.image_url,
                    sentiment_score: b.sentiment_score
                })));
            }
        } catch (e) {
            console.error('Error loading bookmarks:', e);
        }
    };

    const handleAvatarClick = () => fileInputRef.current?.click();

    const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsUploading(true);

        try {
            const supabase = createClient();
            const { data: { user: authUser } } = await supabase.auth.getUser();
            if (!authUser) return;

            const fileName = `${authUser.id}/avatar-${Date.now()}.jpg`;
            await supabase.storage.from('avatars').upload(fileName, file, { contentType: file.type, upsert: true });

            const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
            await supabase.from('profiles').upsert({ id: authUser.id, avatar_url: urlData.publicUrl, updated_at: new Date().toISOString() });

            setAvatarUrl(urlData.publicUrl);
        } catch (error) {
            console.error('Upload error:', error);
        } finally {
            setIsUploading(false);
        }
    };

    const handleRemoveBookmark = async (id: string) => {
        // Optimistic remove
        setBookmarks(prev => prev.filter(b => b.id !== id));

        try {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            await supabase
                .from('bookmarks')
                .delete()
                .eq('user_id', user.id)
                .eq('article_id', id);
        } catch (e) {
            console.error('Error deleting bookmark:', e);
            loadBookmarks(); // Revert on error
        }
    };

    // Use username from profile like mobile
    const displayName = profile?.username || user?.email?.split('@')[0] || '';
    const displayRole = profile?.role ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1) : '';

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />

                    <motion.div
                        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="fixed top-0 right-0 h-full w-full max-w-md bg-[#121212] border-l border-[#333] z-50 overflow-y-auto"
                    >
                        <div className="flex items-center justify-between p-4 border-b border-[#333]">
                            <button onClick={onClose} className="p-2"><X size={20} className="text-zinc-400" /></button>
                            <h2 className="text-lg font-semibold text-white">Profile</h2>
                            <div className="w-10" />
                        </div>

                        <div className="p-4">
                            <div className="flex items-center gap-2 text-[#4ECCA3] mb-4">
                                <User size={18} fill="currentColor" /><span className="font-medium text-white">Profile</span>
                            </div>
                            <div className="bg-[#1E1E1E] border border-[#333] rounded-2xl p-5">
                                <div className="flex items-center gap-4 mb-4">
                                    <div className="relative">
                                        <button onClick={handleAvatarClick} disabled={isUploading || isLoading} className="w-16 h-16 rounded-full bg-[#4ECCA3] overflow-hidden flex items-center justify-center relative group">
                                            {isUploading ? <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                : isLoading ? <div className="w-full h-full bg-[#333] animate-pulse" />
                                                    : avatarUrl ? <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                                                        : <span className="text-[#121212] text-2xl font-semibold">{displayName.charAt(0).toUpperCase() || '?'}</span>}
                                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><Camera size={20} className="text-white" /></div>
                                        </button>
                                        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
                                        <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-[#4ECCA3] rounded-full border-2 border-[#1E1E1E] flex items-center justify-center">
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="#121212"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" /></svg>
                                        </div>
                                    </div>
                                    <div className="flex-1">
                                        {isLoading ? (
                                            <>
                                                <div className="h-5 w-32 bg-[#333] rounded animate-pulse mb-2" />
                                                <div className="h-4 w-48 bg-[#333] rounded animate-pulse mb-2" />
                                                <div className="h-4 w-20 bg-[#333] rounded animate-pulse" />
                                            </>
                                        ) : (
                                            <>
                                                <p className="text-white font-semibold text-lg">{displayName || 'Loading...'}</p>
                                                <p className="text-sm text-zinc-500">{user?.email}</p>
                                                {displayRole && <p className="text-sm text-[#4ECCA3] font-medium mt-1">{displayRole}</p>}
                                            </>
                                        )}
                                    </div>
                                </div>
                                {!isLoading && profile?.bio && (
                                    <p className="text-zinc-400 text-sm mb-4">{profile.bio}</p>
                                )}
                                <div className="grid grid-cols-3 gap-4 text-center pt-4 border-t border-[#333]">
                                    <div>
                                        {isLoading ? (
                                            <div className="h-5 w-8 bg-[#333] rounded animate-pulse mx-auto mb-1" />
                                        ) : (
                                            <p className="text-white font-semibold text-lg">{commoditiesCount ?? 0}</p>
                                        )}
                                        <p className="text-xs text-zinc-500">Commodities</p>
                                    </div>
                                    <div>
                                        {isLoading ? (
                                            <div className="h-5 w-10 bg-[#333] rounded animate-pulse mx-auto mb-1" />
                                        ) : (
                                            <p className="text-white font-semibold text-lg">{profile?.experience_level || '-'}</p>
                                        )}
                                        <p className="text-xs text-zinc-500">Experience</p>
                                    </div>
                                    <div>
                                        {isLoading ? (
                                            <div className="h-5 w-8 bg-[#333] rounded animate-pulse mx-auto mb-1" />
                                        ) : (
                                            <p className="text-white font-semibold text-lg">{bookmarks.length}</p>
                                        )}
                                        <p className="text-xs text-zinc-500">Bookmarks</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-4">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2 text-[#4ECCA3]"><Bookmark size={18} fill="currentColor" /><span className="font-medium text-white">Bookmarks</span></div>
                                <span className="text-zinc-500 text-sm">{bookmarks.length}</span>
                            </div>
                            {bookmarks.length === 0 ? (
                                <div className="bg-[#1E1E1E] border border-[#333] rounded-xl p-6 text-center">
                                    <p className="text-white font-medium">No bookmarks yet</p>
                                    <p className="text-zinc-500 text-sm mt-1">Bookmark articles to save them</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {(showAllBookmarks ? bookmarks : bookmarks.slice(0, 3)).map((bookmark) => (
                                        <div
                                            key={bookmark.id}
                                            onClick={() => {
                                                onBookmarkClick?.(bookmark);
                                                onClose();
                                            }}
                                            className="bg-[#1E1E1E] border border-[#333] rounded-xl p-4 flex justify-between cursor-pointer hover:bg-white/5 transition-colors group"
                                        >
                                            <div className="flex-1 pr-3">
                                                <p className="text-white font-medium text-sm line-clamp-2 mb-1 group-hover:text-[#4ECCA3] transition-colors">{bookmark.title}</p>
                                                <p className="text-zinc-500 text-xs mb-1">{bookmark.source}</p>
                                                <p className="text-xs font-medium uppercase" style={{ color: getSentimentColor(bookmark.sentiment) }}>{bookmark.sentiment}</p>
                                            </div>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleRemoveBookmark(bookmark.id);
                                                }}
                                                className="p-2 hover:bg-white/10 rounded-lg h-fit"
                                            >
                                                <Trash2 size={16} className="text-[#F05454]" />
                                            </button>
                                        </div>
                                    ))}
                                    {bookmarks.length > 3 && (
                                        <button onClick={() => setShowAllBookmarks(!showAllBookmarks)} className="w-full py-3 text-center text-[#4ECCA3] text-sm font-medium bg-[#4ECCA3]/10 rounded-xl border border-[#4ECCA3]/20">
                                            {showAllBookmarks ? 'Show less' : `View all ${bookmarks.length} bookmarks`}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="p-4">
                            <div className="flex items-center gap-2 mb-4 text-[#4ECCA3]"><MaterialSettings size={18} /><span className="font-medium text-white">Settings</span></div>
                            <div className="bg-[#1E1E1E] border border-[#333] rounded-xl overflow-hidden">
                                <button
                                    onClick={() => window.location.href = '/onboarding?edit=profile'}
                                    className="w-full flex items-center justify-between px-4 py-3 border-b border-[#333] hover:bg-white/5"
                                >
                                    <span className="text-white">Edit Profile</span>
                                    <ChevronRight size={18} className="text-zinc-600" />
                                </button>
                                <button
                                    onClick={() => window.location.href = '/onboarding?edit=alerts'}
                                    className="w-full flex items-center justify-between px-4 py-3 border-b border-[#333] hover:bg-white/5"
                                >
                                    <span className="text-white">Edit Alerts</span>
                                    <ChevronRight size={18} className="text-zinc-600" />
                                </button>
                                <Link href="/settings/privacy" className="flex items-center justify-between px-4 py-3 border-b border-[#333] hover:bg-white/5"><span className="text-white">Privacy Policy</span><ChevronRight size={18} className="text-zinc-600" /></Link>
                                <Link href="/settings/terms" className="flex items-center justify-between px-4 py-3 border-b border-[#333] hover:bg-white/5"><span className="text-white">Terms of Service</span><ChevronRight size={18} className="text-zinc-600" /></Link>
                                <Link href="/settings/about" className="flex items-center justify-between px-4 py-3 border-b border-[#333] hover:bg-white/5"><span className="text-white">About</span><ChevronRight size={18} className="text-zinc-600" /></Link>
                                <button onClick={onLogout} className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#F05454]/10"><div className="flex items-center gap-2"><LogOut size={18} className="text-[#F05454]" /><span className="text-[#F05454]">Log out</span></div><ChevronRight size={18} className="text-[#F05454]/50" /></button>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
