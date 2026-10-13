import { Bell, User, Moon, Sun, Menu } from 'lucide-react';
import { useState } from 'react';

interface AppBarProps {
  darkMode: boolean;
  setDarkMode: (value: boolean) => void;
  onMenuClick: () => void;
}

interface Notification {
  id: string;
  title: string;
  message: string;
  time: string;
  type: 'info' | 'warning' | 'success' | 'danger';
  read: boolean;
}

export default function AppBar({ darkMode, setDarkMode, onMenuClick }: AppBarProps) {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  const notifications: Notification[] = [
    {
      id: '1',
      title: 'Action en retard',
      message: 'L\'action #AC-2024-045 dépasse le délai de 12 jours',
      time: 'Il y a 5 min',
      type: 'danger',
      read: false
    },
    {
      id: '2',
      title: 'Formation à planifier',
      message: 'Formation "Sécurité incendie" à renouveler pour 8 collaborateurs',
      time: 'Il y a 1h',
      type: 'warning',
      read: false
    },
    {
      id: '3',
      title: 'Audit complété',
      message: 'Audit interne ISO 9001 terminé avec succès',
      time: 'Il y a 2h',
      type: 'success',
      read: true
    },
    {
      id: '4',
      title: 'Nouveau document',
      message: 'Politique QHSE 2026 validée et publiée',
      time: 'Hier',
      type: 'info',
      read: true
    }
  ];

  const unreadCount = notifications.filter(n => !n.read).length;

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'danger': return 'text-[#ef4444]';
      case 'warning': return 'text-[#f59e0b]';
      case 'success': return 'text-[#10b981]';
      default: return 'text-[#6366f1]';
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 backdrop-blur-lg bg-opacity-90 dark:bg-opacity-90">
      <div className="flex items-center justify-between px-6 py-4">
        {/* Left: Menu button + Search */}
        <div className="flex items-center gap-4">
          <button
            onClick={onMenuClick}
            className="lg:hidden p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <Menu className="w-5 h-5 text-gray-700 dark:text-gray-300" />
          </button>
          
          <div className="hidden md:flex items-center gap-3">
            <input
              type="search"
              placeholder="Rechercher..."
              className="w-64 px-4 py-2 bg-gray-100 dark:bg-gray-800 border-none rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#6366f1] transition-all"
            />
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-3">
          {/* Dark mode toggle */}
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-all duration-200 hover:scale-105"
            title={darkMode ? 'Mode clair' : 'Mode sombre'}
          >
            {darkMode ? (
              <Sun className="w-5 h-5 text-gray-700 dark:text-gray-300" />
            ) : (
              <Moon className="w-5 h-5 text-gray-700 dark:text-gray-300" />
            )}
          </button>

          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => {
                setShowNotifications(!showNotifications);
                setShowProfile(false);
              }}
              className="relative p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-all duration-200 hover:scale-105"
              title="Notifications"
            >
              <Bell className="w-5 h-5 text-gray-700 dark:text-gray-300" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-[#ef4444] text-white text-xs font-bold rounded-full flex items-center justify-center animate-pulse">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Notifications dropdown */}
            {showNotifications && (
              <div className="absolute right-0 mt-2 w-96 glass rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 animate-[scaleIn_0.2s_ease]">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                  <h3 className="font-bold text-gray-900 dark:text-white">Notifications</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {unreadCount} non lue{unreadCount > 1 ? 's' : ''}
                  </p>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {notifications.map((notif) => (
                    <div
                      key={notif.id}
                      className={`p-4 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer ${
                        !notif.read ? 'bg-[#6366f1]/5' : ''
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-2 h-2 rounded-full mt-2 ${
                          notif.type === 'danger' ? 'bg-[#ef4444]' :
                          notif.type === 'warning' ? 'bg-[#f59e0b]' :
                          notif.type === 'success' ? 'bg-[#10b981]' :
                          'bg-[#6366f1]'
                        }`} />
                        <div className="flex-1">
                          <p className={`text-sm font-medium ${getNotificationColor(notif.type)}`}>
                            {notif.title}
                          </p>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            {notif.message}
                          </p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                            {notif.time}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="p-3 text-center border-t border-gray-200 dark:border-gray-700">
                  <button className="text-sm text-[#6366f1] hover:text-[#5558e3] font-medium">
                    Voir toutes les notifications
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Profile */}
          <div className="relative">
            <button
              onClick={() => {
                setShowProfile(!showProfile);
                setShowNotifications(false);
              }}
              className="flex items-center gap-3 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-all duration-200"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#6366f1] to-[#818cf8] flex items-center justify-center">
                <User className="w-5 h-5 text-white" />
              </div>
              <div className="hidden md:block text-left">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Marie Dubois
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Responsable QHSE
                </p>
              </div>
            </button>

            {/* Profile dropdown */}
            {showProfile && (
              <div className="absolute right-0 mt-2 w-64 glass rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 animate-[scaleIn_0.2s_ease]">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#6366f1] to-[#818cf8] flex items-center justify-center">
                      <User className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">Marie Dubois</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">marie@entreprise.fr</p>
                    </div>
                  </div>
                </div>
                <div className="p-2">
                  <button className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-sm transition-colors">
                    Mon profil
                  </button>
                  <button className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-sm transition-colors">
                    Paramètres
                  </button>
                  <button className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-sm transition-colors">
                    Aide & Support
                  </button>
                </div>
                <div className="p-2 border-t border-gray-200 dark:border-gray-700">
                  <button className="w-full text-left px-4 py-2 hover:bg-[#ef4444]/10 rounded-lg text-sm text-[#ef4444] font-medium transition-colors">
                    Déconnexion
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
