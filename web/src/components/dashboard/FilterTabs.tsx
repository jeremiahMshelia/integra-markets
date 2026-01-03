'use client';

import { TrendingUp, TrendingDown, ArrowRight } from 'lucide-react';

type FilterType = 'All' | 'Bullish' | 'Neutral' | 'Bearish';

interface FilterTabsProps {
    tabs: FilterType[];
    activeTab: FilterType;
    onTabChange: (tab: FilterType) => void;
}

const filterConfig: Record<FilterType, {
    activeColor: string;
    textColor: string;
    icon?: React.ReactNode;
}> = {
    All: {
        activeColor: 'bg-[#2a2a2a] border border-white/20',
        textColor: 'text-white',
    },
    Bullish: {
        activeColor: 'bg-[#28c76f]',
        textColor: 'text-black',
        icon: <TrendingUp size={14} strokeWidth={2.5} />
    },
    Neutral: {
        activeColor: 'bg-[#f4c542]',
        textColor: 'text-black',
        icon: <ArrowRight size={14} strokeWidth={2.5} />
    },
    Bearish: {
        activeColor: 'bg-[#ea5455]',
        textColor: 'text-black',
        icon: <TrendingDown size={14} strokeWidth={2.5} />
    },
};

export default function FilterTabs({ tabs, activeTab, onTabChange }: FilterTabsProps) {
    return (
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {tabs.map((tab) => {
                const isActive = activeTab === tab;
                const config = filterConfig[tab];

                return (
                    <button
                        key={tab}
                        onClick={() => onTabChange(tab)}
                        className={`flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-medium transition-all whitespace-nowrap ${isActive
                                ? `${config.activeColor} ${config.textColor}`
                                : 'bg-[#2a2a2a] text-[#a0a0a0] hover:text-white'
                            }`}
                    >
                        {isActive && config.icon}
                        {tab}
                    </button>
                );
            })}
        </div>
    );
}

export type { FilterType };
