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
}

interface UserProfile {
    id?: string;
    email?: string;
    username?: string;
    role?: string;
    avatar_url?: string;
    market_focus?: string[];
    experience?: string;
}

interface ProfileSidebarProps {
    isOpen: boolean;
    onClose: () => void;
    user: { email?: string; name?: string; avatar_url?: string } | null;
    onLogout: () => void;
}

const getSentimentColor = (sentiment: string): string => {
    switch (sentiment?.toUpperCase()) {
        case 'BULLISH': return '#4ECCA3';
        case 'BEARISH': return '#F05454';
        case 'NEUTRAL': return '#EAB308';
        default: return '#888888';
    }
};

export default function ProfileSidebar({ isOpen, onClose, user, onLogout }: ProfileSidebarProps) {
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [avatarUrl, setAvatarUrl] = useState<string>('');
    const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [showAllBookmarks, setShowAllBookmarks] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            loadProfile();
            loadBookmarks();
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
                    sentiment: b.sentiment || 'NEUTRAL'
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

    // Use username from profile like mobile ("pipsss")
    const displayName = profile?.username || user?.email?.split('@')[0] || 'User';
    const displayRole = profile?.role ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1) : 'Analyst';

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
                                <User size={18} /><span className="font-medium text-white">Profile</span>
                            </div>
                            <div className="bg-[#1E1E1E] border border-[#333] rounded-2xl p-5">
                                <div className="flex items-center gap-4 mb-4">
                                    <div className="relative">
                                        <button onClick={handleAvatarClick} disabled={isUploading} className="w-16 h-16 rounded-full bg-[#4ECCA3] overflow-hidden flex items-center justify-center relative group">
                                            {isUploading ? <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                : avatarUrl ? <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                                                    : <span className="text-[#121212] text-2xl font-semibold">{displayName.charAt(0).toUpperCase()}</span>}
                                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><Camera size={20} className="text-white" /></div>
                                        </button>
                                        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
                                        <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-[#4ECCA3] rounded-full border-2 border-[#1E1E1E] flex items-center justify-center">
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="#121212"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" /></svg>
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-white font-semibold text-lg">{displayName}</p>
                                        <p className="text-sm text-zinc-500">{user?.email}</p>
                                        <p className="text-sm text-[#4ECCA3] font-medium mt-1">{displayRole}</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-3 gap-4 text-center pt-4 border-t border-[#333]">
                                    <div><p className="text-white font-semibold text-lg">{profile?.market_focus?.length || 3}</p><p className="text-xs text-zinc-500">Market Focus</p></div>
                                    <div><p className="text-white font-semibold text-lg">{profile?.experience || '3-5'}</p><p className="text-xs text-zinc-500">Experience</p></div>
                                    <div><p className="text-white font-semibold text-lg">{bookmarks.length}</p><p className="text-xs text-zinc-500">Bookmarks</p></div>
                                </div>
                            </div>
                        </div>

                        <div className="p-4">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2"><Bookmark size={18} className="text-[#EAB308]" /><span className="font-medium text-white">Bookmarks</span></div>
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
                                        <div key={bookmark.id} className="bg-[#1E1E1E] border border-[#333] rounded-xl p-4 flex justify-between">
                                            <div className="flex-1 pr-3">
                                                <p className="text-white font-medium text-sm line-clamp-2 mb-1">{bookmark.title}</p>
                                                <p className="text-zinc-500 text-xs mb-1">{bookmark.source}</p>
                                                <p className="text-xs font-medium uppercase" style={{ color: getSentimentColor(bookmark.sentiment) }}>{bookmark.sentiment}</p>
                                            </div>
                                            <button onClick={() => handleRemoveBookmark(bookmark.id)} className="p-2 hover:bg-white/5 rounded-lg"><Trash2 size={16} className="text-[#F05454]" /></button>
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
                            <div className="flex items-center gap-2 mb-4"><Settings size={18} className="text-zinc-400" /><span className="font-medium text-white">Settings</span></div>
                            <div className="bg-[#1E1E1E] border border-[#333] rounded-xl overflow-hidden">
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
