import React from 'react';
import { Outlet } from 'react-router-dom';
import { motion } from 'framer-motion';
import { QHSESidebar } from './QHSESidebar';
import { QHSEHeader } from './QHSEHeader';
import { useAppStore } from '@/stores/appStore';

export const MainLayout: React.FC = () => {
  const { sidebarCollapsed } = useAppStore();

  return (
    <div className="min-h-screen flex w-full bg-background">
      {/* Sidebar */}
      <QHSESidebar />

      {/* Main Content Area */}
      <div
        className={`flex-1 flex flex-col transition-all duration-300 ${
          sidebarCollapsed ? 'ml-16' : 'ml-64'
        }`}
      >
        {/* Header */}
        <QHSEHeader />

        {/* Page Content */}
        <motion.main
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex-1 p-6 overflow-auto"
        >
          <Outlet />
        </motion.main>

        {/* Footer */}
        <footer className="border-t border-border py-4 px-6">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>© 2024 SMI QHSE Platform</span>
            <span>Version 1.0.0</span>
          </div>
        </footer>
      </div>
    </div>
  );
};
