'use client';

import { TrendingUp, TrendingDown, ArrowRight } from 'lucide-react';

export type FilterType = 'All' | 'Bullish' | 'Neutral' | 'Bearish';

interface FilterTabsProps {
    tabs: FilterType[];
    activeTab: FilterType;
    onTabChange: (tab: FilterType) => void;
}

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
        <div className="flex gap-2 flex-wrap">
            {tabs.map((tab) => {
                const isActive = tab === activeTab;
                return (
                    <button
                        key={tab}
                        onClick={() => onTabChange(tab)}
                        className={`flex items-center justify-center gap-1 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm font-medium transition-colors ${isActive
                            ? 'bg-[#4ECCA3] text-[#121212]'
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
