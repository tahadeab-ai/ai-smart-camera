import React from 'react';
import { Camera, Image, Film, BarChart3, Cpu } from 'lucide-react';
import { AppViewTab } from '../../types';

interface MobileNavBarProps {
  activeTab: AppViewTab;
  setActiveTab: (tab: AppViewTab) => void;
  isStreaming?: boolean;
}

export const MobileNavBar: React.FC<MobileNavBarProps> = ({
  activeTab,
  setActiveTab,
  isStreaming = false,
}) => {
  const navItems: { id: AppViewTab; label: string; icon: React.ReactNode }[] = [
    {
      id: 'camera',
      label: 'Live',
      icon: (
        <div className="relative">
          <Camera className="w-5 h-5" />
          {isStreaming && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-400 rounded-full animate-ping" />
          )}
        </div>
      ),
    },
    {
      id: 'image',
      label: 'Image',
      icon: <Image className="w-5 h-5" />,
    },
    {
      id: 'video',
      label: 'Video',
      icon: <Film className="w-5 h-5" />,
    },
    {
      id: 'analytics',
      label: 'Stats',
      icon: <BarChart3 className="w-5 h-5" />,
    },
    {
      id: 'system',
      label: 'System',
      icon: <Cpu className="w-5 h-5" />,
    },
  ];

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-lg border-t border-slate-800 safe-area-bottom shadow-2xl"
      aria-label="Mobile Navigation"
    >
      <div className="grid grid-cols-5 h-16 items-center px-1">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all duration-200 select-none ${
                isActive
                  ? 'text-emerald-400 bg-emerald-500/10 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 active:scale-95'
              }`}
            >
              {item.icon}
              <span className="text-[10px] mt-1 font-medium tracking-wide">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
