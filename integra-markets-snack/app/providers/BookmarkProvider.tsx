import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../services/supabaseService.js';

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
}

const BookmarkContext = createContext<BookmarkContextType | undefined>(undefined);

export const BookmarkProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    initializeBookmarks();
  }, []);

  const initializeBookmarks = async () => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        await loadBookmarks(user.id);
      }
    } catch (error) {
      console.error('Failed to initialize bookmarks:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadBookmarks = async (uid: string) => {
    try {
      const { data, error } = await supabase
        .from('bookmarks')
        .select('*')
        .eq('user_id', uid)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data) {
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
      }
    } catch (error) {
      console.error('Failed to load bookmarks from Supabase:', error);
    }
  };

  const addBookmark = async (bookmarkData: Omit<Bookmark, 'id' | 'createdAt'>) => {
    if (!userId) {
      console.error('No user logged in');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('bookmarks')
        .insert({
          user_id: userId,
          article_id: bookmarkData.url || bookmarkData.title,
          title: bookmarkData.title,
          url: bookmarkData.url,
          source: bookmarkData.source,
          sentiment: bookmarkData.sentiment,
          sentiment_score: bookmarkData.sentimentScore,
          summary: bookmarkData.summary
        })
        .select()
        .single();

      if (error) throw error;

      if (data) {
        const newBookmark: Bookmark = {
          id: data.id,
          title: data.title,
          summary: data.summary || bookmarkData.summary,
          source: data.source,
          sentiment: data.sentiment,
          sentimentScore: data.sentiment_score,
          url: data.url,
          createdAt: new Date(data.created_at)
        };
        setBookmarks(prev => [newBookmark, ...prev]);
      }
    } catch (error) {
      console.error('Failed to add bookmark:', error);
    }
  };

  const removeBookmark = async (id: string) => {
    if (!userId) return;

    try {
      const { error } = await supabase
        .from('bookmarks')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (error) throw error;

      setBookmarks(prev => prev.filter(bookmark => bookmark.id !== id));
    } catch (error) {
      console.error('Failed to remove bookmark:', error);
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
    isLoading
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