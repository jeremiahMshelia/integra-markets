'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase';
import { Bell, ChevronRight, TrendingUp, TrendingDown, FileText, AlertTriangle, RefreshCw, History, ArrowLeft, Loader2, X } from 'lucide-react';
import Link from 'next/link';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import ProfileSidebar from '@/components/dashboard/ProfileSidebar';
import AIAnalysisModal from '@/components/dashboard/AIAnalysisModal';
import OnboardingTooltip from '@/components/OnboardingTooltip';

// Color Palette (matching mobile)
const colors = {
    bgPrimary: '#121212',
    bgSecondary: '#1E1E1E',
    textPrimary: '#ECECEC',
    textSecondary: '#A0A0A0',
    accentPositive: '#4ECCA3',
    accentNegative: '#F05454',
    accentNeutral: '#EAB308',
    accentData: '#30A5FF',
    divider: '#333333',
    cardBorder: '#2A2A2A',
};

type Sentiment = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

interface AlertPreference {
    commodities: string[];
    regions: string[];
    currencies: string[];
    keywords: string[];
    websiteURLs: string[];
    alertFrequency: string;
    alertThreshold: string;
    pushNotifications: boolean;
    emailAlerts: boolean;
    priceAlerts: boolean;
    newsAlerts: boolean;
}

interface AlertItem {
    id: string;
    title: string;
    message: string;
    source: string;
    sourceUrl?: string;
    sentiment: Sentiment;
    matchedTags: string[];
    score: number;
    createdAt: string;
    timeAgo: string;
    read: boolean;
    severity: 'high' | 'medium' | 'low';
    originalArticle?: any; // Full article data for AI Analysis modal
}

const getSentimentColor = (sentiment: string) => {
    switch (sentiment?.toUpperCase()) {
        case 'BULLISH': return colors.accentPositive;
        case 'BEARISH': return colors.accentNegative;
        default: return colors.accentNeutral;
    }
};

const matchArticleToPreferences = (article: any, preferences: AlertPreference) => {
    const { commodities = [], regions = [], currencies = [], keywords = [], websiteURLs = [] } = preferences;
    const text = `${article.title || ''} ${article.summary || ''}`.toLowerCase();
    const source = (article.source || '').toLowerCase();
    const sourceUrl = (article.source_url || '').toLowerCase();

    const matchedTags: string[] = [];
    let score = 0;

    // Check commodities
    const commodityMap: Record<string, string[]> = {
        'Crude Oil': ['oil', 'crude', 'brent', 'wti', 'petroleum'],
        'Natural Gas': ['gas', 'lng', 'natural gas'],
        'Gold': ['gold', 'bullion'],
        'Silver': ['silver'],
        'Wheat': ['wheat', 'grain'],
        'Corn': ['corn'],
        'Copper': ['copper'],
    };
    for (const c of commodities) {
        const terms = commodityMap[c] || [c.toLowerCase()];
        if (terms.some(t => text.includes(t))) {
            matchedTags.push(c);
            score += 10;
        }
    }

    // Check regions
    const regionMap: Record<string, string[]> = {
        'North America': ['us', 'usa', 'america', 'canada', 'mexico', 'united states'],
        'Middle East': ['middle east', 'saudi', 'iran', 'iraq', 'opec', 'uae', 'dubai'],
        'Europe': ['europe', 'eu', 'uk', 'germany', 'france', 'italy'],
        'Asia Pacific': ['asia', 'china', 'japan', 'india', 'pacific', 'australia'],
        'Latin America': ['latin', 'brazil', 'argentina', 'venezuela'],
        'Africa': ['africa', 'nigeria', 'libya', 'algeria'],
    };
    for (const r of regions) {
        const terms = regionMap[r] || [r.toLowerCase()];
        if (terms.some(t => text.includes(t))) {
            matchedTags.push(r);
            score += 5;
        }
    }

    // Check currencies
    for (const cur of currencies) {
        if (text.includes(cur.toLowerCase())) {
            matchedTags.push(cur);
            score += 3;
        }
    }

    // Check keywords
    for (const kw of keywords) {
        if (text.includes(kw.toLowerCase())) {
            matchedTags.push(kw);
            score += 8;
        }
    }

    // Check website sources
    for (const url of websiteURLs) {
        const domain = url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase();
        if (sourceUrl.includes(domain) || source.includes(domain)) {
            matchedTags.push(`Source: ${url}`);
            score += 7;
        }
    }

    return { matched: score > 0, score, matchedTags };
};

export default function AlertsPage() {
    const [alertPreferences, setAlertPreferences] = useState<AlertPreference>({
        commodities: [],
        regions: [],
        currencies: [],
        keywords: [],
        websiteURLs: [],
        alertFrequency: 'Real-time',
        alertThreshold: 'Medium',
        pushNotifications: true,
        emailAlerts: false,
        priceAlerts: true,
        newsAlerts: true,
    });
    const [preferencesLoaded, setPreferencesLoaded] = useState(false);
    const [alerts, setAlerts] = useState<AlertItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [allAlerts, setAllAlerts] = useState<AlertItem[]>([]);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [user, setUser] = useState<any>(null);
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [permissionStatus, setPermissionStatus] = useState<NotificationPermission>('default');
    const swRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);
    const [toast, setToast] = useState<{ title: string; body: string; sentiment: Sentiment } | null>(null);
    const [selectedArticle, setSelectedArticle] = useState<any>(null);
    const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const seenAlertIdsRef = useRef<Set<string>>(new Set());
    const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const isInitialLoadRef = useRef(true);

    useEffect(() => {
        loadData();
        // Register service worker for notifications
        registerServiceWorker();

        // Auto-refresh every 60 seconds when tab is focused
        const startPolling = () => {
            pollIntervalRef.current = setInterval(() => {
                if (!document.hidden) {
                    loadData(true); // silent refresh (no loading spinner)
                }
            }, 60000);
        };
        startPolling();

        return () => {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        };
    }, []);

    const registerServiceWorker = async () => {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('/sw.js');
                swRegistrationRef.current = registration;
                console.log('Service Worker registered:', registration);
            } catch (error) {
                console.error('Service Worker registration failed:', error);
            }
        }
        if ('Notification' in window) {
            setPermissionStatus(Notification.permission);
        }
    };

    const loadData = async (silentRefresh = false) => {
        if (!silentRefresh) setLoading(true);
        try {
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

            const { data: dbPrefs } = await supabase
                .from('alert_preferences')
                .select('*')
                .eq('user_id', user.id)
                .single();

            let currentPrefs = alertPreferences;
            if (dbPrefs) {
                currentPrefs = {
                    commodities: dbPrefs.commodities || [],
                    regions: dbPrefs.regions || [],
                    currencies: dbPrefs.currencies || [],
                    keywords: dbPrefs.keywords || [],
                    websiteURLs: dbPrefs.website_urls || [],
                    alertFrequency: dbPrefs.alert_frequency || 'Real-time',
                    alertThreshold: dbPrefs.alert_threshold || 'Medium',
                    pushNotifications: dbPrefs.push_enabled !== false,
                    emailAlerts: dbPrefs.email_enabled || false,
                    priceAlerts: true,
                    newsAlerts: true,
                };
                setAlertPreferences(currentPrefs);
            }
            setPreferencesLoaded(true);

            const commodityMap: Record<string, string> = {
                'Crude Oil': 'OIL',
                'Natural Gas': 'NAT GAS',
                'Gold': 'GOLD',
                'Wheat': 'WHEAT',
            };
            const mappedComms = currentPrefs.commodities?.map(c => commodityMap[c] || c.toUpperCase()) || [];

            // STRICT FILTERING LOGIC MATCHING MOBILE
            let queryComms: string[] | null = null;
            if (mappedComms.length > 0) {
                queryComms = [...new Set(mappedComms)];
            } else if (
                currentPrefs.regions?.length > 0 ||
                currentPrefs.currencies?.length > 0 ||
                currentPrefs.keywords?.length > 0 ||
                currentPrefs.websiteURLs?.length > 0
            ) {
                // Fetch broad news if other prefs exist
                queryComms = [];
            } else {
                // No preferences at all -> Empty feed
                queryComms = null;
            }

            if (queryComms === null) {
                setAlerts([]);
                setLoading(false);
                return;
            }

            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://integra-markets-9zz1.onrender.com';
            const response = await fetch(`${apiUrl}/api/news/latest?t=${Date.now()}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ commodities: queryComms, hours: 24 }),
            });

            if (response.ok) {
                const data = await response.json();
                const articles = data.articles || [];

                const newsAlerts = articles.map((article: any, idx: number) => {
                    const { matched, score, matchedTags } = matchArticleToPreferences(article, currentPrefs);

                    // Robust Date Parsing
                    let timeAgo = 'recently';
                    let validPublishedDate = new Date().toISOString();
                    const published = article.published || article.time_published;

                    if (published) {
                        let pubDate;
                        // Handle compact ISO (YYYYMMDDTHHMMSS)
                        if (typeof published === 'string' && /^\d{8}T\d{6}$/.test(published)) {
                            const year = parseInt(published.substring(0, 4));
                            const month = parseInt(published.substring(4, 6)) - 1;
                            const day = parseInt(published.substring(6, 8));
                            const hour = parseInt(published.substring(9, 11));
                            const min = parseInt(published.substring(11, 13));
                            const sec = parseInt(published.substring(13, 15));
                            pubDate = new Date(Date.UTC(year, month, day, hour, min, sec));
                        } else {
                            pubDate = new Date(published);
                        }

                        if (!isNaN(pubDate.getTime())) {
                            validPublishedDate = pubDate.toISOString();
                            const diff = Date.now() - pubDate.getTime();
                            const mins = Math.floor(diff / 60000);
                            if (mins < 60) timeAgo = `${Math.max(0, mins)} min ago`;
                            else if (mins < 1440) timeAgo = `${Math.floor(mins / 60)}h ago`;
                            else timeAgo = `${Math.floor(mins / 1440)}d ago`;
                        }
                    }

                    let sentiment: Sentiment = 'NEUTRAL';
                    const rawSentiment = (article.sentiment || '').toUpperCase();
                    if (rawSentiment.includes('BULL')) sentiment = 'BULLISH';
                    else if (rawSentiment.includes('BEAR')) sentiment = 'BEARISH';

                    return {
                        id: `news-${article.title?.slice(0, 20)}-${validPublishedDate}`,
                        title: article.title,
                        message: article.summary,
                        source: article.source,
                        sourceUrl: article.url || article.source_url, // Prefer direct URL
                        sentiment,
                        matchedTags,
                        score,
                        createdAt: validPublishedDate,
                        timeAgo,
                        read: false,
                        severity: score > 15 ? 'high' : score > 5 ? 'medium' : 'low',
                        originalArticle: article, // Keep full data for AI Analysis modal
                    } as AlertItem;
                })
                    .filter((a: AlertItem) => {
                        // Strict filtering: 
                        // 1. Matches preferences (score > 0)
                        // 2. Not older than 24 hours (Client-side enforcement)
                        const created = new Date(a.createdAt).getTime();
                        const diff = Date.now() - created;
                        const isRecent = diff < 24 * 60 * 60 * 1000; // 24 hours in ms

                        return (a.score > 0) && isRecent;
                    })
                    .sort((a: AlertItem, b: AlertItem) => b.score - a.score);

                setAllAlerts(newsAlerts);
                setAlerts(newsAlerts.slice(0, 15));
                setLoading(false);

                // Detect NEW alerts (not seen before)
                const newAlerts = newsAlerts.filter((a: AlertItem) => !seenAlertIdsRef.current.has(a.id));

                // Track all current alert IDs
                for (const a of newsAlerts) {
                    seenAlertIdsRef.current.add(a.id);
                }

                // On initial load, just show the top toast 
                if (isInitialLoadRef.current) {
                    isInitialLoadRef.current = false;
                    if (currentPrefs.pushNotifications && newsAlerts.length > 0) {
                        const topAlert = newsAlerts[0];
                        if (topAlert.severity === 'high' || topAlert.score > 10) {
                            setTimeout(() => {
                                showToast(topAlert.title, topAlert.message, topAlert.sentiment);
                            }, 1500);
                        }
                    }
                } else if (newAlerts.length > 0 && currentPrefs.pushNotifications) {
                    // On subsequent refreshes, notify about NEW alerts
                    const topNew = newAlerts[0];

                    // Fire browser notification (if permitted)
                    if ('Notification' in window && Notification.permission === 'granted') {
                        try {
                            new Notification(`📊 ${topNew.title}`, {
                                body: topNew.message?.slice(0, 120) || 'New market alert',
                                icon: '/NewLogoInt.png.png',
                                tag: topNew.id, // Prevent duplicate notifications
                            });
                        } catch (e) {
                            console.warn('Browser notification failed:', e);
                        }
                    }

                    // Show in-app toast
                    showToast(
                        `🔔 ${newAlerts.length} new alert${newAlerts.length > 1 ? 's' : ''}`,
                        topNew.title,
                        topNew.sentiment
                    );
                }
            }
        } catch (e) {
            console.error('Error loading alerts:', e);
            if (!silentRefresh) setLoading(false);
        }
    };

    const handleSettingChange = async (key: keyof AlertPreference, value: boolean) => {
        if (key === 'pushNotifications' && value === true) {
            if ('Notification' in window) {
                const permission = await Notification.requestPermission();
                setPermissionStatus(permission);
                if (permission !== 'granted') {
                    alert('Please allow notifications in your browser settings to receive alerts.');
                    return;
                }
            }
        }

        setAlertPreferences(prev => ({ ...prev, [key]: value }));
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const updates: any = {};
        if (key === 'pushNotifications') updates.push_enabled = value;
        if (key === 'emailAlerts') updates.email_enabled = value;

        if (Object.keys(updates).length > 0) {
            await supabase.from('alert_preferences').update(updates).eq('user_id', user.id);
        }
    };

    const showToast = (title: string, body: string, sentiment: Sentiment = 'BULLISH') => {
        // Clear any existing timeout
        if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
        setToast({ title, body, sentiment });
        // Auto-dismiss after 6 seconds
        toastTimeoutRef.current = setTimeout(() => setToast(null), 6000);
    };

    const PreferenceRow = ({ label, value, placeholder }: { label: string, value: string[] | string, placeholder: string }) => (
        <div className="flex justify-between items-start py-3 border-b border-[#333]">
            <span className="text-zinc-200 text-sm font-medium">{label}:</span>
            <span className="text-zinc-400 text-sm text-right flex-1 ml-4">
                {Array.isArray(value) ? (value.length > 0 ? value.join(', ') : placeholder) : (value || placeholder)}
            </span>
        </div>
    );

    const ToggleRow = ({ label, checked, onChange }: { label: string, checked: boolean, onChange: (val: boolean) => void }) => (
        <div className="flex justify-between items-center py-4 border-b border-[#333]">
            <span className="text-zinc-200 text-base">{label}</span>
            <button
                onClick={() => onChange(!checked)}
                className={`w-12 h-6 rounded-full p-1 transition-colors duration-200 ease-in-out ${checked ? 'bg-[#4ECCA3]' : 'bg-[#1E1E1E] border border-[#333]'}`}
            >
                <div className={`w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform duration-200 ease-in-out ${checked ? 'translate-x-6' : 'translate-x-0'}`} />
            </button>
        </div>
    );

    return (
        <div className="min-h-screen bg-[#121212]">
            <DashboardHeader userEmail={user?.email} onProfileClick={() => setIsProfileOpen(true)} />

            <main className="max-w-4xl mx-auto px-4 py-8">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                        <Link href="/dashboard" className="p-2 hover:bg-[#333] rounded-full transition-colors">
                            <ArrowLeft className="text-zinc-400" size={24} />
                        </Link>
                        <h1 className="text-2xl font-bold text-white">Alerts</h1>
                    </div>
                </div>

                {/* Alert Preferences */}
                <div className="mb-8">
                    <h2 className="text-lg font-semibold text-white mb-4">Alert Preferences</h2>
                    <div className="bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl p-5 mb-4">
                        {preferencesLoaded ? (
                            <>
                                <PreferenceRow label="Commodities" value={alertPreferences.commodities} placeholder="No commodities selected" />
                                <PreferenceRow label="Regions" value={alertPreferences.regions} placeholder="No regions selected" />
                                <PreferenceRow label="Currencies" value={alertPreferences.currencies} placeholder="No currencies selected" />
                                <PreferenceRow label="Keywords" value={alertPreferences.keywords} placeholder="No keywords added" />
                                <PreferenceRow label="Website Sources" value={alertPreferences.websiteURLs} placeholder="No website sources added" />
                                <PreferenceRow label="Alert Frequency" value={alertPreferences.alertFrequency} placeholder="Real-time" />
                                <PreferenceRow label="Alert Threshold" value={alertPreferences.alertThreshold} placeholder="Medium" />
                            </>
                        ) : (
                            <div className="py-4 text-center text-zinc-500">Loading preferences...</div>
                        )}
                    </div>
                    <Link href="/onboarding?edit=alerts" className="block w-full bg-[#30A5FF] text-white text-center py-3 rounded-lg font-semibold hover:bg-[#2B95E6] transition-colors">
                        Edit Alert Preferences
                    </Link>
                </div>

                {/* Notification Settings */}
                <div className="mb-8">
                    <h2 className="text-lg font-semibold text-white mb-4">Notification Settings</h2>
                    <div className="bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl px-5 border-b-0 overflow-hidden">
                        <ToggleRow label="Push Notifications" checked={alertPreferences.pushNotifications} onChange={(v) => handleSettingChange('pushNotifications', v)} />
                        <ToggleRow label="Email Alerts" checked={alertPreferences.emailAlerts} onChange={(v) => handleSettingChange('emailAlerts', v)} />
                        <ToggleRow label="Price Alerts" checked={alertPreferences.priceAlerts} onChange={(v) => handleSettingChange('priceAlerts', v)} />
                        <ToggleRow label="News Alerts" checked={alertPreferences.newsAlerts} onChange={(v) => handleSettingChange('newsAlerts', v)} />
                    </div>
                </div>

                {/* Recent Alerts */}
                <div>
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-semibold text-white">Recent Alerts</h2>
                        <button onClick={() => loadData()} className="p-2 hover:bg-[#333] rounded-full text-[#30A5FF]">
                            <RefreshCw size={20} />
                        </button>
                    </div>

                    {loading ? (
                        <div className="bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl p-8 text-center">
                            <Loader2 className="animate-spin mx-auto text-[#4ECCA3] mb-2" size={24} />
                            <p className="text-zinc-500">Loading alerts...</p>
                        </div>
                    ) : alerts.length === 0 ? (
                        <div className="bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl p-8 text-center">
                            <p className="text-white font-medium mb-1">No matching alerts</p>
                            <p className="text-zinc-500 text-sm">Set up your alert preferences to see personalized news.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {alerts.map((alert) => (
                                <div
                                    key={alert.id}
                                    onClick={() => {
                                        // Open Integra Analysis modal with full article data
                                        const article = alert.originalArticle || {};
                                        setSelectedArticle({
                                            title: alert.title,
                                            url: alert.sourceUrl || '',
                                            published: alert.createdAt,
                                            summary: alert.message,
                                            source: alert.source,
                                            sentiment: alert.sentiment,
                                            sentiment_score: article.sentiment_score || article.score,
                                            image_url: article.image_url || article.banner_image,
                                            keywords: article.keywords,
                                            bullish: article.bullish,
                                            bearish: article.bearish,
                                            neutral: article.neutral,
                                            market_impact: article.market_impact,
                                            trade_ideas: article.trade_ideas,
                                            event_type: article.event_type,
                                            severity: article.severity,
                                        });
                                    }}
                                    className="block bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl p-4 cursor-pointer hover:bg-[#252525] transition-colors group mb-3"
                                >
                                    <div className="flex gap-4">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0`} style={{ backgroundColor: getSentimentColor(alert.sentiment) + '20' }}>
                                            {alert.sentiment === 'BULLISH' ? <TrendingUp size={20} color={getSentimentColor(alert.sentiment)} /> :
                                                alert.sentiment === 'BEARISH' ? <TrendingDown size={20} color={getSentimentColor(alert.sentiment)} /> :
                                                    <FileText size={20} color={getSentimentColor(alert.sentiment)} />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-start gap-2">
                                                <h3 className="text-white font-medium text-base mb-1 truncate pr-2 group-hover:text-[#4ECCA3] transition-colors">{alert.title}</h3>
                                            </div>
                                            <p className="text-zinc-400 text-sm mb-2 line-clamp-2">{alert.message}</p>
                                            <div className="flex items-center gap-3 text-xs text-zinc-500">
                                                <span className="font-medium text-[#30A5FF]">{alert.source}</span>
                                                <span>•</span>
                                                <span>{alert.timeAgo}</span>
                                            </div>
                                            {alert.matchedTags.length > 0 && (
                                                <div className="flex flex-wrap gap-2 mt-3">
                                                    {alert.matchedTags.slice(0, 3).map((tag, i) => (
                                                        <span key={i} className="px-2 py-1 bg-[#2A2A2A] rounded text-xs text-zinc-300 font-medium">
                                                            {tag}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}

                            <div className="mt-4 text-center">
                                <button
                                    onClick={() => setIsHistoryOpen(true)}
                                    className="inline-flex items-center gap-2 px-5 py-3 bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl text-[#30A5FF] hover:bg-[#252525] transition-colors font-medium text-sm shadow-sm"
                                >
                                    <History size={18} />
                                    View Alert History
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </main>

            <ProfileSidebar isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} user={user} onLogout={() => { /* Handle Logout */ }} />

            {/* AI Analysis Modal - opens when clicking an alert */}
            <AIAnalysisModal
                isOpen={!!selectedArticle}
                onClose={() => setSelectedArticle(null)}
                article={selectedArticle}
            />

            {/* History Modal */}
            {isHistoryOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div className="bg-[#1E1E1E] border border-[#2A2A2A] rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
                        <div className="flex items-center justify-between p-6 border-b border-[#2A2A2A]">
                            <div>
                                <h2 className="text-xl font-bold text-white">Alert History</h2>
                                <p className="text-zinc-400 text-sm mt-1">Chronological list of recent alerts</p>
                            </div>
                            <button
                                onClick={() => setIsHistoryOpen(false)}
                                className="p-2 hover:bg-[#333] rounded-full text-zinc-400 hover:text-white transition-colors"
                            >
                                <X size={24} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-3">
                            {allAlerts.length === 0 ? (
                                <div className="text-center py-10 text-zinc-500">No history available</div>
                            ) : (
                                allAlerts.map((alert) => (
                                    <div
                                        key={`hist-${alert.id}`}
                                        className="py-4 border-b border-[#2A2A2A]"
                                    >
                                        <h4 className="text-white font-semibold text-sm mb-1">{alert.title}</h4>
                                        <p className="text-zinc-400 text-xs mb-2 leading-relaxed">{alert.message}</p>
                                        <p className="text-zinc-500 text-[10px]">
                                            {new Date(alert.createdAt).toLocaleString()}
                                        </p>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* In-App Toast Notification */}
            {toast && (
                <div
                    className="fixed top-4 right-4 left-4 md:left-auto md:w-[420px] z-50 animate-slide-down"
                    style={{ animation: 'slideDown 0.4s ease-out' }}
                >
                    <div className="bg-[#000000] border border-[#2A2A2A] rounded-xl p-4 shadow-2xl shadow-black/50 backdrop-blur-sm">
                        <div className="flex gap-3 items-start">
                            <div
                                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                                style={{ backgroundColor: getSentimentColor(toast.sentiment) + '20' }}
                            >
                                {toast.sentiment === 'BULLISH' ? (
                                    <TrendingUp size={20} color={getSentimentColor(toast.sentiment)} />
                                ) : toast.sentiment === 'BEARISH' ? (
                                    <TrendingDown size={20} color={getSentimentColor(toast.sentiment)} />
                                ) : (
                                    <Bell size={20} color={getSentimentColor(toast.sentiment)} />
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                    <h4 className="text-white font-semibold text-sm truncate">{toast.title}</h4>
                                    <button
                                        onClick={() => setToast(null)}
                                        className="text-zinc-500 hover:text-white text-lg leading-none shrink-0 p-1"
                                    >
                                        ×
                                    </button>
                                </div>
                                <p className="text-zinc-400 text-xs mt-1 line-clamp-2">{toast.body}</p>
                                <div className="flex items-center gap-2 mt-2">
                                    <span
                                        className="text-xs font-medium px-2 py-0.5 rounded-full"
                                        style={{
                                            color: getSentimentColor(toast.sentiment),
                                            backgroundColor: getSentimentColor(toast.sentiment) + '15',
                                        }}
                                    >
                                        {toast.sentiment}
                                    </span>
                                    <span className="text-zinc-600 text-xs">Just now</span>
                                </div>
                            </div>
                        </div>
                        {/* Progress bar for auto-dismiss */}
                        <div className="mt-3 h-0.5 bg-[#2A2A2A] rounded-full overflow-hidden">
                            <div
                                className="h-full rounded-full"
                                style={{
                                    backgroundColor: getSentimentColor(toast.sentiment),
                                    animation: 'shrinkWidth 6s linear forwards',
                                }}
                            />
                        </div>
                    </div>
                </div>
            )}

            <style jsx>{`
                @keyframes slideDown {
                    from {
                        opacity: 0;
                        transform: translateY(-20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                @keyframes shrinkWidth {
                    from { width: 100%; }
                    to { width: 0%; }
                }
            `}</style>

            <OnboardingTooltip
                storageKey="tooltip_alerts_v3"
                title="Your Curated Alerts"
                message="Your curated sentiment news based on your commodity and keyword preferences will appear here. You can adjust your preferences anytime using the Edit Alert Preferences button below."
            />
        </div>
    );
}
