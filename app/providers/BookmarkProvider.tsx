import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabaseService } from '../services/supabaseService';

export interface Bookmark {
  id: string;
  title: string;
  summary: string;
  source: string;
  sentiment: "BULLISH" | "BEARISH" | "NEUTRAL";
  sentimentScore: number;
  url?: string;
  createdAt: Date;
}

interface BookmarkContextType {
  bookmarks: Bookmark[];
  addBookmark: (bookmark: Omit<Bookmark, 'id' | 'createdAt'>) => Promise<void>;
  removeBookmark: (id: string) => Promise<void>;
  isBookmarked: (title: string) => boolean;
  isLoading: boolean;
  refreshBookmarks: () => Promise<void>;
}

const BookmarkContext = createContext<BookmarkContextType | undefined>(undefined);

export const BookmarkProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadBookmarks();
  }, []);

  const loadBookmarks = async () => {
    try {
      setIsLoading(true);
      const userId = await supabaseService.getCurrentUserId();

      if (!userId) {
        console.log('[BookmarkProvider] No user ID, skipping bookmark load');
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabaseService.supabase
        .from('bookmarks')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[BookmarkProvider] Error loading bookmarks:', error);
      } else if (data) {
        const parsedBookmarks = data.map((bookmark: any) => ({
          id: bookmark.id,
          title: bookmark.title || '',
          summary: bookmark.summary || '',
          source: bookmark.source || '',
          sentiment: bookmark.sentiment || 'NEUTRAL',
          sentimentScore: bookmark.sentiment_score || 0.5,
          url: bookmark.url || '',
          createdAt: new Date(bookmark.created_at)
        }));
        setBookmarks(parsedBookmarks);
        console.log('[BookmarkProvider] Loaded', parsedBookmarks.length, 'bookmarks from Supabase');
      }
    } catch (error) {
      console.error('[BookmarkProvider] Failed to load bookmarks:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshBookmarks = async () => {
    await loadBookmarks();
  };

  const addBookmark = async (bookmarkData: Omit<Bookmark, 'id' | 'createdAt'>) => {
    try {
      const userId = await supabaseService.getCurrentUserId();
      if (!userId) {
        console.error('[BookmarkProvider] No user logged in');
        return;
      }

      const { data, error } = await supabaseService.supabase
        .from('bookmarks')
        .insert({
          user_id: userId,
          article_id: bookmarkData.url || bookmarkData.title,
          title: bookmarkData.title,
          url: bookmarkData.url,
          source: bookmarkData.source,
          sentiment: bookmarkData.sentiment,
          sentiment_score: bookmarkData.sentimentScore
        })
        .select()
        .single();

      if (error) {
        console.error('[BookmarkProvider] Error adding bookmark:', error);
        return;
      }

      if (data) {
        const newBookmark: Bookmark = {
          id: data.id,
          title: data.title,
          summary: bookmarkData.summary || '',
          source: data.source,
          sentiment: data.sentiment,
          sentimentScore: data.sentiment_score,
          url: data.url,
          createdAt: new Date(data.created_at)
        };
        setBookmarks(prev => [newBookmark, ...prev]);
        console.log('[BookmarkProvider] Bookmark added to Supabase');
      }
    } catch (error) {
      console.error('[BookmarkProvider] Failed to add bookmark:', error);
    }
  };

  const removeBookmark = async (id: string) => {
    try {
      const userId = await supabaseService.getCurrentUserId();
      if (!userId) return;

      const { error } = await supabaseService.supabase
        .from('bookmarks')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (error) {
        console.error('[BookmarkProvider] Error removing bookmark:', error);
        return;
      }

      setBookmarks(prev => prev.filter(bookmark => bookmark.id !== id));
      console.log('[BookmarkProvider] Bookmark removed from Supabase');
    } catch (error) {
      console.error('[BookmarkProvider] Failed to remove bookmark:', error);
    }
  };

  const isBookmarked = (title: string) => {
    return bookmarks.some(bookmark => bookmark.title === title);
  };

  const value: BookmarkContextType = {
    bookmarks,
    addBookmark,
    removeBookmark,
    isBookmarked,
    isLoading,
    refreshBookmarks
  };

  return (
    <BookmarkContext.Provider value={value}>
      {children}
    </BookmarkContext.Provider>
  );
};

export const useBookmarks = () => {
  const context = useContext(BookmarkContext);
  if (!context) {
    throw new Error('useBookmarks must be used within BookmarkProvider');
  }
  return context;
};