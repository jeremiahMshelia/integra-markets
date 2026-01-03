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
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors ${isActive
                                ? 'bg-white text-black'
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
