import { useState, ReactNode } from 'react';
import Sidebar from './Sidebar';
import AppBar from './AppBar';

interface MainLayoutProps {
  children: ReactNode;
  darkMode: boolean;
  setDarkMode: (value: boolean) => void;
}

export default function MainLayout({ children, darkMode, setDarkMode }: MainLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar 
        darkMode={darkMode} 
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      
      <div className="flex-1 flex flex-col lg:ml-72">
        <AppBar 
          darkMode={darkMode} 
          setDarkMode={setDarkMode}
          onMenuClick={() => setSidebarOpen(true)}
        />
        
        <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950 p-6">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>

        <footer className="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 px-6 py-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
            <p>© 2026 SMI QHSE - Plateforme Professionnelle</p>
            <div className="flex items-center gap-6">
              <a href="#" className="hover:text-[#6366f1] transition-colors">Conditions d'utilisation</a>
              <a href="#" className="hover:text-[#6366f1] transition-colors">Confidentialité</a>
              <a href="#" className="hover:text-[#6366f1] transition-colors">Support</a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
