'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { ArrowLeft, ArrowRight, Check, TrendingUp, BarChart3, Building2, Briefcase, Fuel, Droplets, Factory, Truck, Gem, Wheat, MoreHorizontal } from 'lucide-react';

// Onboarding data (matching mobile exactly)
const roleOptions = [
    { value: 'Trader', icon: TrendingUp, description: 'Active market trading' },
    { value: 'Analyst', icon: BarChart3, description: 'Research & analysis' },
    { value: 'Hedge Fund', icon: Building2, description: 'Fund management' },
    { value: 'Bank', icon: Briefcase, description: 'Banking institution' },
    { value: 'Refiner', icon: Fuel, description: 'Oil refining operations' },
    { value: 'Blender', icon: Droplets, description: 'Fuel blending' },
    { value: 'Producer', icon: Factory, description: 'Commodity production' },
    { value: 'Shipping and Freight', icon: Truck, description: 'Transportation & logistics' },
];

const experienceOptions = [
    { value: '0-2', label: '0-2 years', description: 'New to the industry' },
    { value: '3-5', label: '3-5 years', description: 'Growing expertise' },
    { value: '6-10', label: '6-10 years', description: 'Experienced professional' },
    { value: '10+', label: '10+ years', description: 'Industry veteran' },
];

const marketFocusOptions = [
    { value: 'Oil & Oil Products', icon: Fuel, color: '#30A5FF' },
    { value: 'Metals & Minerals', icon: Gem, color: '#FFD700' },
    { value: 'Agricultural Products', icon: Wheat, color: '#4ECCA3' },
    { value: 'Other', icon: MoreHorizontal, color: '#A0A0A0' },
];

// Alert preferences data (matching mobile)
const suggestedCommodities = [
    'Crude Oil', 'WTI', 'Brent', 'Natural Gas', 'Gold', 'Silver',
    'Copper', 'Corn', 'Soybeans', 'Wheat', 'Tin', 'Zinc'
];

const suggestedRegions = [
    'North America', 'Europe', 'Asia Pacific', 'Middle East',
    'South America', 'Africa', 'Eastern Europe', 'Southeast Asia'
];

const suggestedCurrencies = [
    'USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD',
    'AUD', 'CNY', 'RUB', 'INR', 'BRL', 'SAR',
    'Bitcoin', 'Ethereum', 'Solana'
];

const suggestedWebsiteSources = [
    { name: 'Bloomberg', url: 'https://www.bloomberg.com' },
    { name: 'Reuters', url: 'https://www.reuters.com' },
    { name: 'MarketWatch', url: 'https://www.marketwatch.com' },
    { name: 'Financial Times', url: 'https://www.ft.com' },
    { name: 'CNBC', url: 'https://www.cnbc.com' },
    { name: 'Wall Street Journal', url: 'https://www.wsj.com' },
    { name: 'Yahoo Finance', url: 'https://finance.yahoo.com' },
    { name: 'Investing.com', url: 'https://www.investing.com' },
    { name: 'Commodity.com', url: 'https://commodity.com' },
    { name: 'Mining Weekly', url: 'https://www.miningweekly.com' }
];

export default function OnboardingPage() {
    const router = useRouter();
    const [currentStep, setCurrentStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const [editMode, setEditMode] = useState<'profile' | 'alerts' | null>(null);
    const [formData, setFormData] = useState({
        role: '',
        experience: '',
        marketFocus: [] as string[],
        username: '',
        institution: '',
        bio: '',
        linkedin: '',
    });

    // Alert preferences state
    const [selectedCommodities, setSelectedCommodities] = useState<string[]>([]);
    const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
    const [selectedCurrencies, setSelectedCurrencies] = useState<string[]>([]);

    // Additional alert settings
    const [keywords, setKeywords] = useState<string[]>([]);
    const [keywordInput, setKeywordInput] = useState('');
    const [selectedWebsites, setSelectedWebsites] = useState<string[]>([]);
    const [customUrl, setCustomUrl] = useState('');
    const [alertFrequency, setAlertFrequency] = useState('Daily');
    const [alertThreshold, setAlertThreshold] = useState('Medium');

    // For edit mode: profile steps are 1-4, alert steps are 5-8
    // Step 9 is final submit only in full onboarding
    const totalSteps = editMode === 'profile' ? 4 : editMode === 'alerts' ? 4 : 9;

    useEffect(() => {
        // Check for edit mode from URL params
        const params = new URLSearchParams(window.location.search);
        const edit = params.get('edit');
        if (edit === 'profile' || edit === 'alerts') {
            setEditMode(edit);
        }
        checkAuthAndOnboarding(edit as 'profile' | 'alerts' | null);
    }, []);

    const checkAuthAndOnboarding = async (edit: 'profile' | 'alerts' | null) => {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            router.push('/login');
            return;
        }

        // If in edit mode, load existing profile data
        if (edit) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();

            if (profile) {
                setFormData({
                    role: profile.role || '',
                    experience: profile.experience_level || '',
                    marketFocus: profile.market_focus || [],
                    username: profile.username || '',
                    institution: profile.institution || '',
                    bio: profile.bio || '',
                    linkedin: profile.linkedin || '',
                });
            }

            // Load alert preferences
            if (edit === 'alerts') {
                const { data: alertPrefs } = await supabase
                    .from('alert_preferences')
                    .select('*')
                    .eq('user_id', user.id)
                    .single();

                if (alertPrefs) {
                    setSelectedCommodities(alertPrefs.commodities || []);
                    setSelectedRegions(alertPrefs.regions || []);
                    setSelectedCurrencies(alertPrefs.currencies || []);
                    setKeywords(alertPrefs.keywords || []);
                    setSelectedWebsites(alertPrefs.website_urls || []);
                    setAlertFrequency(alertPrefs.alert_frequency || 'Daily');
                    setAlertThreshold(alertPrefs.alert_threshold || 'Medium');
                }
                // For alerts edit, start at step 1 (which will map to alert step 6)
                setCurrentStep(1);
            }

            setInitialLoading(false);
            return;
        }

        // Normal onboarding flow - check if already onboarded
        const { data: profile } = await supabase
            .from('profiles')
            .select('username')
            .eq('id', user.id)
            .single();

        if (profile?.username) {
            router.push('/dashboard');
            return;
        }

        // Pre-fill username from email
        const emailUsername = user.email?.split('@')[0] || '';
        setFormData(prev => ({ ...prev, username: emailUsername }));

        setInitialLoading(false);
    };

    // Map current step to actual step number based on edit mode
    const getActualStep = () => {
        if (editMode === 'alerts') {
            // In alerts edit mode, step 1 maps to step 5 (commodities), step 2 to step 6, step 3 to step 7
            return currentStep + 4;
        }
        return currentStep;
    };

    const actualStep = getActualStep();

    const handleNext = () => {
        if (currentStep < totalSteps) {
            setCurrentStep(currentStep + 1);
        }
    };

    const handlePrevious = () => {
        if (currentStep > 1) {
            setCurrentStep(currentStep - 1);
        } else if (editMode) {
            // In edit mode, go back to dashboard
            router.push('/dashboard');
        }
    };

    const toggleMarketFocus = (market: string) => {
        setFormData(prev => ({
            ...prev,
            marketFocus: prev.marketFocus.includes(market)
                ? prev.marketFocus.filter(m => m !== market)
                : [...prev.marketFocus, market]
        }));
    };

    const toggleCommodity = (commodity: string) => {
        setSelectedCommodities(prev =>
            prev.includes(commodity)
                ? prev.filter(c => c !== commodity)
                : [...prev, commodity]
        );
    };

    const toggleRegion = (region: string) => {
        setSelectedRegions(prev =>
            prev.includes(region)
                ? prev.filter(r => r !== region)
                : [...prev, region]
        );
    };

    const toggleCurrency = (currency: string) => {
        setSelectedCurrencies(prev =>
            prev.includes(currency)
                ? prev.filter(c => c !== currency)
                : [...prev, currency]
        );
    };

    const toggleWebsite = (url: string) => {
        setSelectedWebsites(prev =>
            prev.includes(url)
                ? prev.filter(s => s !== url)
                : [...prev, url]
        );
    };

    const addKeyword = () => {
        if (keywordInput.trim() && !keywords.includes(keywordInput.trim())) {
            setKeywords(prev => [...prev, keywordInput.trim()]);
            setKeywordInput('');
        }
    };

    const removeKeyword = (keyword: string) => {
        setKeywords(prev => prev.filter(k => k !== keyword));
    };

    const handleKeywordKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addKeyword();
        }
    };

    const handleAddCustomUrl = () => {
        if (!customUrl.trim()) return;
        let url = customUrl.trim();
        if (!url.startsWith('http')) {
            url = 'https://' + url;
        }
        if (!selectedWebsites.includes(url)) {
            setSelectedWebsites([...selectedWebsites, url]);
        }
        setCustomUrl('');
    };

    const handleCustomUrlKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAddCustomUrl();
        }
    };

    const handleSubmit = async () => {
        // Only require username for profile edit or full onboarding
        if (editMode !== 'alerts' && !formData.username.trim()) {
            alert('Please enter a username');
            return;
        }

        setLoading(true);

        try {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();

            if (!user) {
                router.push('/login');
                return;
            }

            // Only save profile data if not in alerts-only edit mode
            if (editMode !== 'alerts') {
                const { error: profileError } = await supabase
                    .from('profiles')
                    .upsert({
                        id: user.id,
                        username: formData.username.trim(),
                        role: formData.role || null,
                        experience_level: formData.experience || null,
                        market_focus: formData.marketFocus,
                        company: formData.institution || null,
                        bio: formData.bio || null,
                        linkedin: formData.linkedin || null,
                        updated_at: new Date().toISOString(),
                    });

                if (profileError) {
                    console.error('Error saving profile:', profileError);
                    alert('Failed to save profile. Please try again.');
                    setLoading(false);
                    return;
                }
            }

            // Save alert preferences if in alerts edit mode OR if selections were made
            if (editMode === 'alerts' || selectedCommodities.length > 0 || selectedRegions.length > 0 || selectedCurrencies.length > 0) {
                console.log('[Onboarding] Saving alert preferences:', {
                    commodities: selectedCommodities,
                    regions: selectedRegions,
                    currencies: selectedCurrencies
                });

                const { data: alertData, error: alertError } = await supabase
                    .from('alert_preferences')
                    .upsert({
                        user_id: user.id,
                        commodities: selectedCommodities,
                        regions: selectedRegions,
                        currencies: selectedCurrencies,
                        keywords: keywords,
                        website_urls: selectedWebsites,
                        alert_frequency: alertFrequency,
                        alert_threshold: alertThreshold,
                        push_enabled: true,
                        email_enabled: false,
                        updated_at: new Date().toISOString(),
                    }, {
                        onConflict: 'user_id'
                    })
                    .select();

                if (alertError) {
                    console.error('[Onboarding] Error saving alert preferences:', alertError);
                    // Don't block - continue to dashboard
                } else {
                    console.log('[Onboarding] Alert preferences saved:', alertData);
                }
            }

            router.push('/dashboard');
        } catch (error) {
            console.error('Error:', error);
            alert('Something went wrong. Please try again.');
            setLoading(false);
        }
    };

    const handleSkipOnboarding = async () => {
        setLoading(true);

        try {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();

            if (user) {
                const username = user.email?.split('@')[0] || `user_${Date.now()}`;
                await supabase
                    .from('profiles')
                    .upsert({
                        id: user.id,
                        username: username,
                        updated_at: new Date().toISOString(),
                    });
            }

            router.push('/dashboard');
        } catch (error) {
            console.error('Error:', error);
            router.push('/dashboard');
        }
    };

    const canProceed = () => {
        switch (actualStep) {
            case 1: return true; // Role - optional
            case 2: return true; // Experience - optional
            case 3: return formData.marketFocus.length > 0; // Market focus - required
            case 4: return formData.username.trim() !== ''; // Username - required
            case 5: return true; // Commodities - optional
            case 6: return true; // Regions - optional
            case 7: return true; // Currencies - optional
            case 8: return true; // Additional Settings - optional
            case 9: return formData.username.trim() !== ''; // Confirmation
            default: return true;
        }
    };

    const hasSelection = () => {
        switch (actualStep) {
            case 1: return formData.role !== '';
            case 2: return formData.experience !== '';
            case 5: return selectedCommodities.length > 0;
            case 6: return selectedRegions.length > 0;
            case 7: return selectedCurrencies.length > 0;
            case 8: return keywords.length > 0 || selectedWebsites.length > 0;
            default: return true;
        }
    };

    const isOptionalStep = () => {
        return actualStep === 1 || actualStep === 2 || actualStep === 5 || actualStep === 6 || actualStep === 7 || actualStep === 8;
    };

    if (initialLoading) {
        return (
            <div className="min-h-screen bg-[#121212] flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-[#4ECCA3] border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#121212] flex flex-col">
            {/* Header */}
            <header className="border-b border-[#333] px-6 py-4">
                <div className="max-w-2xl mx-auto flex items-center">
                    {currentStep > 1 || editMode ? (
                        <button onClick={handlePrevious} className="p-2 hover:bg-white/5 rounded-lg transition-colors">
                            <ArrowLeft size={24} className="text-white" />
                        </button>
                    ) : (
                        <div className="w-10" />
                    )}

                    {/* Progress Bar */}
                    <div className="flex-1 px-4">
                        {editMode && (
                            <h2 className="text-white font-semibold text-center mb-2">
                                {editMode === 'profile' ? 'Edit Profile' : 'Edit Alerts'}
                            </h2>
                        )}
                        <div className="h-1 bg-[#1E1E1E] rounded-full overflow-hidden">
                            <div
                                className="h-full bg-[#4ECCA3] transition-all duration-300"
                                style={{ width: `${(currentStep / totalSteps) * 100}%` }}
                            />
                        </div>
                        <p className="text-center text-zinc-500 text-xs mt-2">{currentStep} of {totalSteps}</p>
                    </div>

                    <div className="w-10" />
                </div>
            </header>

            {/* Content */}
            <main className="flex-1 overflow-y-auto">
                <div className="max-w-2xl mx-auto px-6 py-8">
                    {/* Step 1: Role Selection */}
                    {actualStep === 1 && (
                        <div className="animate-fadeIn">
                            <h1 className="text-2xl font-semibold text-white mb-2">What&apos;s your role? (Optional)</h1>
                            <p className="text-zinc-400 mb-8">Help us customize your experience</p>

                            <div className="grid grid-cols-2 gap-3">
                                {roleOptions.map((role) => (
                                    <button
                                        key={role.value}
                                        onClick={() => setFormData(prev => ({ ...prev, role: prev.role === role.value ? '' : role.value }))}
                                        className={`relative p-4 rounded-xl border text-left transition-all ${formData.role === role.value
                                            ? 'bg-[#4ECCA3] border-[#4ECCA3]'
                                            : 'bg-[#1E1E1E] border-[#333] hover:border-[#4ECCA3]/50'
                                            }`}
                                    >
                                        <role.icon size={24} className={formData.role === role.value ? 'text-[#121212]' : 'text-[#4ECCA3]'} />
                                        <p className={`font-medium mt-2 ${formData.role === role.value ? 'text-[#121212]' : 'text-white'}`}>{role.value}</p>
                                        <p className={`text-xs mt-1 ${formData.role === role.value ? 'text-[#121212]/70' : 'text-zinc-500'}`}>{role.description}</p>
                                        {formData.role === role.value && (
                                            <div className="absolute top-3 right-3 w-5 h-5 bg-[#121212] rounded-full flex items-center justify-center">
                                                <Check size={12} className="text-[#4ECCA3]" />
                                            </div>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Step 2: Experience */}
                    {actualStep === 2 && (
                        <div className="animate-fadeIn">
                            <h1 className="text-2xl font-semibold text-white mb-2">Years of experience? (Optional)</h1>
                            <p className="text-zinc-400 mb-8">This helps us tailor content complexity</p>

                            <div className="space-y-3">
                                {experienceOptions.map((exp) => (
                                    <button
                                        key={exp.value}
                                        onClick={() => setFormData(prev => ({ ...prev, experience: prev.experience === exp.value ? '' : exp.value }))}
                                        className={`w-full p-4 rounded-xl border flex items-center justify-between transition-all ${formData.experience === exp.value
                                            ? 'bg-[#4ECCA3]/10 border-[#4ECCA3]'
                                            : 'bg-[#1E1E1E] border-[#333] hover:border-[#4ECCA3]/50'
                                            }`}
                                    >
                                        <div>
                                            <p className={`font-medium text-left ${formData.experience === exp.value ? 'text-[#4ECCA3]' : 'text-white'}`}>{exp.label}</p>
                                            <p className={`text-sm text-left ${formData.experience === exp.value ? 'text-[#4ECCA3]/70' : 'text-zinc-500'}`}>{exp.description}</p>
                                        </div>
                                        {formData.experience === exp.value && (
                                            <Check size={24} className="text-[#4ECCA3]" />
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Step 3: Market Focus */}
                    {actualStep === 3 && (
                        <div className="animate-fadeIn">
                            <h1 className="text-2xl font-semibold text-white mb-2">Market focus areas</h1>
                            <p className="text-zinc-400 mb-8">Select your primary interests (multiple allowed)</p>

                            <div className="grid grid-cols-2 gap-4">
                                {marketFocusOptions.map((market) => (
                                    <button
                                        key={market.value}
                                        onClick={() => toggleMarketFocus(market.value)}
                                        className={`relative p-6 rounded-xl border text-center transition-all ${formData.marketFocus.includes(market.value)
                                            ? 'bg-[#4ECCA3] border-[#4ECCA3]'
                                            : 'bg-[#1E1E1E] border-[#333] hover:border-[#4ECCA3]/50'
                                            }`}
                                    >
                                        <market.icon
                                            size={32}
                                            className="mx-auto"
                                            style={{ color: formData.marketFocus.includes(market.value) ? '#121212' : market.color }}
                                        />
                                        <p className={`font-medium mt-3 ${formData.marketFocus.includes(market.value) ? 'text-[#121212]' : 'text-white'}`}>
                                            {market.value}
                                        </p>
                                        {formData.marketFocus.includes(market.value) && (
                                            <div className="absolute top-3 right-3 w-6 h-6 bg-[#121212] rounded-full flex items-center justify-center">
                                                <Check size={14} className="text-[#4ECCA3]" />
                                            </div>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Step 4: Profile Details */}
                    {actualStep === 4 && (
                        <div className="animate-fadeIn">
                            <h1 className="text-2xl font-semibold text-white mb-2">Complete Your Profile</h1>
                            <p className="text-zinc-400 mb-8">Set up your trading identity</p>

                            <div className="space-y-5">
                                <div>
                                    <label className="block text-white font-medium mb-2">
                                        Username <span className="text-red-400">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.username}
                                        onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                                        placeholder="Choose a unique username"
                                        className="w-full bg-[#1E1E1E] border border-[#333] rounded-xl py-3 px-4 text-white placeholder-zinc-500 focus:outline-none focus:border-[#4ECCA3] transition-colors"
                                    />
                                </div>

                                <div>
                                    <label className="block text-white font-medium mb-2">Company / Institution</label>
                                    <input
                                        type="text"
                                        value={formData.institution}
                                        onChange={(e) => setFormData(prev => ({ ...prev, institution: e.target.value }))}
                                        placeholder="e.g., Goldman Sachs, Shell, etc."
                                        className="w-full bg-[#1E1E1E] border border-[#333] rounded-xl py-3 px-4 text-white placeholder-zinc-500 focus:outline-none focus:border-[#4ECCA3] transition-colors"
                                    />
                                </div>

                                <div>
                                    <label className="block text-white font-medium mb-2">Bio</label>
                                    <textarea
                                        value={formData.bio}
                                        onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value }))}
                                        placeholder="Tell us about your trading background"
                                        rows={3}
                                        className="w-full bg-[#1E1E1E] border border-[#333] rounded-xl py-3 px-4 text-white placeholder-zinc-500 focus:outline-none focus:border-[#4ECCA3] transition-colors resize-none"
                                    />
                                </div>

                                <div>
                                    <label className="block text-white font-medium mb-2">LinkedIn</label>
                                    <input
                                        type="url"
                                        value={formData.linkedin}
                                        onChange={(e) => setFormData(prev => ({ ...prev, linkedin: e.target.value }))}
                                        placeholder="linkedin.com/in/yourprofile"
                                        className="w-full bg-[#1E1E1E] border border-[#333] rounded-xl py-3 px-4 text-white placeholder-zinc-500 focus:outline-none focus:border-[#4ECCA3] transition-colors"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Step 5: Alert Preferences - Commodities */}
                    {actualStep === 5 && (
                        <div className="animate-fadeIn">
                            <h1 className="text-2xl font-semibold text-white mb-2">Select Commodities</h1>
                            <p className="text-zinc-400 mb-8">Choose commodities you want to track</p>

                            <div className="flex flex-wrap gap-2">
                                {suggestedCommodities.map((commodity) => (
                                    <button
                                        key={commodity}
                                        onClick={() => toggleCommodity(commodity)}
                                        className={`px-4 py-2 rounded-full border transition-all ${selectedCommodities.includes(commodity)
                                            ? 'bg-[#4ECCA3] border-[#4ECCA3] text-[#121212]'
                                            : 'bg-[#1E1E1E] border-[#333] text-white hover:border-[#4ECCA3]/50'
                                            }`}
                                    >
                                        {commodity}
                                        {selectedCommodities.includes(commodity) && (
                                            <Check size={14} className="inline ml-2" />
                                        )}
                                    </button>
                                ))}
                            </div>

                            {selectedCommodities.length > 0 && (
                                <p className="text-[#4ECCA3] text-sm mt-4">{selectedCommodities.length} selected</p>
                            )}
                        </div>
                    )}

                    {/* Step 6: Alert Preferences - Regions */}
                    {actualStep === 6 && (
                        <div className="animate-fadeIn">
                            <h1 className="text-2xl font-semibold text-white mb-2">Select Regions</h1>
                            <p className="text-zinc-400 mb-8">Choose regions you want news from</p>

                            <div className="flex flex-wrap gap-2">
                                {suggestedRegions.map((region) => (
                                    <button
                                        key={region}
                                        onClick={() => toggleRegion(region)}
                                        className={`px-4 py-2 rounded-full border transition-all ${selectedRegions.includes(region)
                                            ? 'bg-[#4ECCA3] border-[#4ECCA3] text-[#121212]'
                                            : 'bg-[#1E1E1E] border-[#333] text-white hover:border-[#4ECCA3]/50'
                                            }`}
                                    >
                                        {region}
                                        {selectedRegions.includes(region) && (
                                            <Check size={14} className="inline ml-2" />
                                        )}
                                    </button>
                                ))}
                            </div>

                            {selectedRegions.length > 0 && (
                                <p className="text-[#4ECCA3] text-sm mt-4">{selectedRegions.length} selected</p>
                            )}
                        </div>
                    )}

                    {/* Step 7: Alert Preferences - Currencies */}
                    {actualStep === 7 && (
                        <div className="animate-fadeIn">
                            <h1 className="text-2xl font-semibold text-white mb-2">Select Currencies</h1>
                            <p className="text-zinc-400 mb-8">Choose currencies to monitor</p>

                            <div className="flex flex-wrap gap-2">
                                {suggestedCurrencies.map((currency) => (
                                    <button
                                        key={currency}
                                        onClick={() => toggleCurrency(currency)}
                                        className={`px-4 py-2 rounded-full border transition-all ${selectedCurrencies.includes(currency)
                                            ? 'bg-[#4ECCA3] border-[#4ECCA3] text-[#121212]'
                                            : 'bg-[#1E1E1E] border-[#333] text-white hover:border-[#4ECCA3]/50'
                                            }`}
                                    >
                                        {currency}
                                        {selectedCurrencies.includes(currency) && (
                                            <Check size={14} className="inline ml-2" />
                                        )}
                                    </button>
                                ))}
                            </div>

                            {selectedCurrencies.length > 0 && (
                                <p className="text-[#4ECCA3] text-sm mt-4">{selectedCurrencies.length} selected</p>
                            )}
                        </div>
                    )}

                    {/* Step 8: Additional Alert Settings */}
                    {actualStep === 8 && (
                        <div className="animate-fadeIn space-y-8">
                            <div>
                                <h1 className="text-2xl font-semibold text-white mb-2">Select Alert Details</h1>
                                <p className="text-zinc-400">Customize how and when you receive alerts</p>
                            </div>

                            {/* Keywords */}
                            <div>
                                <label className="block text-sm font-medium text-zinc-400 mb-3">Keywords</label>
                                <div className="flex gap-2 mb-3">
                                    <input
                                        type="text"
                                        value={keywordInput}
                                        onChange={(e) => setKeywordInput(e.target.value)}
                                        onKeyDown={handleKeywordKeyDown}
                                        placeholder="Add keywords (e.g. 'OPEC', 'Fed')"
                                        className="flex-1 bg-[#1E1E1E] border border-[#333] rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-[#4ECCA3] transition-colors"
                                    />
                                    <button
                                        onClick={addKeyword}
                                        disabled={!keywordInput.trim()}
                                        className="bg-[#4ECCA3]/10 text-[#4ECCA3] border border-[#4ECCA3]/50 px-4 rounded-xl font-medium hover:bg-[#4ECCA3]/20 disabled:opacity-50 transition-colors"
                                    >
                                        Add
                                    </button>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {keywords.map((keyword) => (
                                        <span key={keyword} className="bg-[#1E1E1E] border border-[#333] rounded-lg px-3 py-1.5 text-sm text-zinc-300 flex items-center gap-2">
                                            {keyword}
                                            <button onClick={() => removeKeyword(keyword)} className="hover:text-red-400 transition-colors">
                                                <div className="w-4 h-4 flex items-center justify-center rounded-full bg-zinc-800">×</div>
                                            </button>
                                        </span>
                                    ))}
                                    {keywords.length === 0 && <span className="text-zinc-600 text-sm italic">No keywords added</span>}
                                </div>
                            </div>

                            {/* Website Sources */}
                            <div>
                                <label className="block text-sm font-medium text-zinc-400 mb-3">Preferred Sources</label>
                                <div className="flex flex-wrap gap-2 mb-3">
                                    {suggestedWebsiteSources.map((source) => (
                                        <button
                                            key={source.url}
                                            onClick={() => toggleWebsite(source.url)}
                                            className={`px-4 py-2 rounded-full text-sm border transition-all ${selectedWebsites.includes(source.url)
                                                ? 'bg-[#4ECCA3] border-[#4ECCA3] text-[#121212]'
                                                : 'bg-[#1E1E1E] border-[#333] text-white hover:border-[#4ECCA3]/50'
                                                }`}
                                        >
                                            {source.name}
                                            {selectedWebsites.includes(source.url) && (
                                                <Check size={14} className="inline ml-2" />
                                            )}
                                        </button>
                                    ))}
                                    {selectedWebsites
                                        .filter(url => !suggestedWebsiteSources.some(s => s.url === url))
                                        .map(url => (
                                            <button
                                                key={url}
                                                onClick={() => toggleWebsite(url)}
                                                className="bg-[#4ECCA3] border border-[#4ECCA3] text-[#121212] px-4 py-2 rounded-full text-sm transition-all flex items-center gap-2"
                                            >
                                                {url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}
                                                <div className="w-4 h-4 flex items-center justify-center rounded-full bg-[#121212]/20 hover:bg-[#121212]/30">×</div>
                                            </button>
                                        ))
                                    }
                                </div>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={customUrl}
                                        onChange={(e) => setCustomUrl(e.target.value)}
                                        onKeyDown={handleCustomUrlKeyDown}
                                        placeholder="Add custom URL (e.g. bloomberg.com)"
                                        className="flex-1 bg-[#1E1E1E] border border-[#333] rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-[#4ECCA3] transition-colors"
                                    />
                                    <button
                                        onClick={handleAddCustomUrl}
                                        disabled={!customUrl.trim()}
                                        className="bg-[#4ECCA3]/10 text-[#4ECCA3] border border-[#4ECCA3]/50 px-4 rounded-xl font-medium hover:bg-[#4ECCA3]/20 disabled:opacity-50 transition-colors"
                                    >
                                        Add
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                {/* Frequency */}
                                <div>
                                    <label className="block text-sm font-medium text-zinc-400 mb-3">Alert Frequency</label>
                                    <div className="flex flex-col gap-2">
                                        {['Real-time', 'Daily', 'Weekly'].map((freq) => (
                                            <button
                                                key={freq}
                                                onClick={() => setAlertFrequency(freq)}
                                                className={`w-full py-2.5 px-4 rounded-lg border text-sm text-left transition-all ${alertFrequency === freq
                                                    ? 'bg-[#4ECCA3]/10 border-[#4ECCA3] text-[#4ECCA3]'
                                                    : 'bg-[#1E1E1E] border-[#333] text-zinc-400 hover:border-[#4ECCA3]/30'
                                                    }`}
                                            >
                                                {freq}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Threshold */}
                                <div>
                                    <label className="block text-sm font-medium text-zinc-400 mb-3">Relevance Threshold</label>
                                    <div className="flex flex-col gap-2">
                                        {['High', 'Medium', 'Low'].map((threshold) => (
                                            <button
                                                key={threshold}
                                                onClick={() => setAlertThreshold(threshold)}
                                                className={`w-full py-2.5 px-4 rounded-lg border text-sm text-left transition-all ${alertThreshold === threshold
                                                    ? 'bg-[#4ECCA3]/10 border-[#4ECCA3] text-[#4ECCA3]'
                                                    : 'bg-[#1E1E1E] border-[#333] text-zinc-400 hover:border-[#4ECCA3]/30'
                                                    }`}
                                            >
                                                {threshold}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Step 9: Confirmation */}
                    {actualStep === 9 && (
                        <div className="animate-fadeIn text-center py-8">
                            <div className="w-20 h-20 bg-[#4ECCA3]/20 rounded-full flex items-center justify-center mx-auto mb-6">
                                <Check size={40} className="text-[#4ECCA3]" />
                            </div>
                            <h1 className="text-2xl font-semibold text-white mb-2">You&apos;re all set!</h1>
                            <p className="text-zinc-400 mb-8">Ready to start trading smarter with Integra Markets</p>

                            <div className="bg-[#1E1E1E] border border-[#333] rounded-xl p-6 text-left max-w-sm mx-auto">
                                <h3 className="text-white font-medium mb-4">Your Profile</h3>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-zinc-500">Username</span>
                                        <span className="text-white">{formData.username || 'Not set'}</span>
                                    </div>
                                    {formData.role && (
                                        <div className="flex justify-between">
                                            <span className="text-zinc-500">Role</span>
                                            <span className="text-white">{formData.role}</span>
                                        </div>
                                    )}
                                    {formData.experience && (
                                        <div className="flex justify-between">
                                            <span className="text-zinc-500">Experience</span>
                                            <span className="text-white">{formData.experience} years</span>
                                        </div>
                                    )}
                                    {formData.marketFocus.length > 0 && (
                                        <div className="flex justify-between">
                                            <span className="text-zinc-500">Markets</span>
                                            <span className="text-white text-right">{formData.marketFocus.length} selected</span>
                                        </div>
                                    )}
                                    {selectedCommodities.length > 0 && (
                                        <div className="flex justify-between">
                                            <span className="text-zinc-500">Commodities</span>
                                            <span className="text-white">{selectedCommodities.length} tracked</span>
                                        </div>
                                    )}
                                    {selectedRegions.length > 0 && (
                                        <div className="flex justify-between">
                                            <span className="text-zinc-500">Regions</span>
                                            <span className="text-white">{selectedRegions.length} tracked</span>
                                        </div>
                                    )}
                                    {selectedCurrencies.length > 0 && (
                                        <div className="flex justify-between">
                                            <span className="text-zinc-500">Currencies</span>
                                            <span className="text-white">{selectedCurrencies.length} tracked</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </main>

            {/* Footer */}
            <footer className="border-t border-[#333] px-6 py-4">
                <div className="max-w-2xl mx-auto">
                    {currentStep < totalSteps ? (
                        <>
                            {isOptionalStep() && !hasSelection() ? (
                                <button
                                    onClick={handleNext}
                                    className="w-full py-3.5 px-6 rounded-xl bg-[#1E1E1E] border border-[#333] text-white font-medium flex items-center justify-center gap-2 hover:bg-[#2a2a2a] transition-colors"
                                >
                                    Skip <ArrowRight size={18} />
                                </button>
                            ) : (
                                <button
                                    onClick={handleNext}
                                    disabled={!canProceed()}
                                    className="w-full py-3.5 px-6 rounded-xl bg-[#4ECCA3] text-[#121212] font-semibold flex items-center justify-center gap-2 hover:bg-[#45b393] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Continue <ArrowRight size={18} />
                                </button>
                            )}
                        </>
                    ) : (
                        <button
                            onClick={handleSubmit}
                            disabled={loading || (editMode !== 'alerts' && !formData.username.trim())}
                            className="w-full py-3.5 px-6 rounded-xl bg-[#4ECCA3] text-[#121212] font-semibold flex items-center justify-center gap-2 hover:bg-[#45b393] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? (
                                <div className="w-5 h-5 border-2 border-[#121212] border-t-transparent rounded-full animate-spin" />
                            ) : (
                                <>{editMode ? 'Save Changes' : 'Complete Setup'} <Check size={18} /></>
                            )}
                        </button>
                    )}
                </div>
            </footer>

            <style jsx>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-fadeIn {
                    animation: fadeIn 0.3s ease-out;
                }
            `}</style>
        </div>
    );
}
