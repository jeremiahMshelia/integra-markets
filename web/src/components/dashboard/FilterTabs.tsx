'use client';

import { TrendingUp, TrendingDown, ArrowRight } from 'lucide-react';

export type FilterType = 'All' | 'Bullish' | 'Neutral' | 'Bearish';

interface FilterTabsProps {
    tabs: FilterType[];
    activeTab: FilterType;
    onTabChange: (tab: FilterType) => void;
}

// Get active background color based on tab type (matching mobile) - all text black
const getActiveStyles = (tab: FilterType): string => {
    switch (tab) {
        case 'All': return 'bg-[#4ECCA3] text-black'; // Green
        case 'Bullish': return 'bg-[#4ECCA3] text-black'; // Green
        case 'Neutral': return 'bg-[#FFD700] text-black'; // Yellow/Gold
        case 'Bearish': return 'bg-[#F05454] text-black'; // Red
        default: return 'bg-[#4ECCA3] text-black';
    }
};

const getTabIcon = (tab: FilterType, isActive: boolean) => {
    const color = isActive ? 'currentColor' : '#888';
    switch (tab) {
        case 'Bullish': return <TrendingUp size={14} color={color} />;
        case 'Bearish': return <TrendingDown size={14} color={color} />;
        case 'Neutral': return <ArrowRight size={14} color={color} />;
        default: return null;
    }
};

export default function FilterTabs({ tabs, activeTab, onTabChange }: FilterTabsProps) {
    return (
        <div className="flex gap-2 sm:gap-10 justify-center">
            {tabs.map((tab) => {
                const isActive = tab === activeTab;
                return (
                    <button
                        key={tab}
                        onClick={() => onTabChange(tab)}
                        className={`flex items-center justify-center gap-1.5 px-4 py-2 sm:px-5 sm:py-2.5 rounded-full text-xs sm:text-sm font-medium transition-colors ${isActive
                            ? getActiveStyles(tab)
                            : 'bg-[#2a2a2a] text-zinc-400 hover:bg-[#3a3a3a]'
                            }`}
                    >
                        {getTabIcon(tab, isActive)}
                        {tab}
                    </button>
                );
            })}
        </div>
    );
}
