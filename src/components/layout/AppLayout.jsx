import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { cn } from '@/lib/utils';
import { usePendingBotMessages } from '@/hooks/usePendingBotMessages';

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  
  // Listen for pending bot messages from webhooks (Cal.com etc.) and send them
  usePendingBotMessages();

  return (
    <div className="min-h-screen bg-background">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <main className={cn(
        "transition-all duration-300 min-h-screen",
        collapsed ? "mr-16" : "mr-60"
      )}>
        <div className="p-6 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}