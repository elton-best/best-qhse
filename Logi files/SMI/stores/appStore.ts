import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type UserRole = 'collaborateur' | 'rq' | 'ceo' | 'admin';

interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  hasCompletedOnboarding: boolean;
  signature?: string;
}

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'error';
  read: boolean;
  createdAt: Date;
  link?: string;
}

interface AppState {
  user: User | null;
  notifications: Notification[];
  sidebarCollapsed: boolean;
  darkMode: boolean;
  
  // Actions
  setUser: (user: User | null) => void;
  addNotification: (notification: Omit<Notification, 'id' | 'createdAt'>) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  toggleSidebar: () => void;
  toggleDarkMode: () => void;
  
  // Permission checks
  can: (permission: string) => boolean;
}

const rolePermissions: Record<UserRole, string[]> = {
  collaborateur: [
    'dashboard.view',
    'documents.view',
    'actions.view-own',
    'actions.confirm',
    'profile.edit',
  ],
  rq: [
    'dashboard.view',
    'documents.view',
    'documents.upload',
    'documents.edit',
    'actions.view',
    'actions.create',
    'actions.edit',
    'risques.view',
    'risques.edit',
    'objectifs.view',
    'objectifs.edit',
    'audits.view',
    'audits.create',
    'nc.view',
    'nc.create',
    'profile.edit',
    'users.view',
  ],
  ceo: [
    'dashboard.view',
    'documents.view',
    'documents.validate',
    'actions.view',
    'actions.validate',
    'risques.view',
    'risques.validate',
    'objectifs.view',
    'objectifs.validate',
    'audits.view',
    'audits.validate',
    'revue-direction.view',
    'revue-direction.validate',
    'nc.view',
    'profile.edit',
    'users.view',
  ],
  admin: ['*'], // All permissions
};

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      user: {
        id: '1',
        name: 'Jean Dupont',
        email: 'jean.dupont@entreprise.fr',
        role: 'rq',
        hasCompletedOnboarding: true,
      },
      notifications: [
        {
          id: '1',
          title: 'Action en retard',
          message: "L'action AC-2024-015 dépasse le délai de 12 jours",
          type: 'error',
          read: false,
          createdAt: new Date(),
          link: '/amelioration/actions',
        },
        {
          id: '2',
          title: 'Document à valider',
          message: 'Nouvelle politique QHSE soumise pour validation',
          type: 'info',
          read: false,
          createdAt: new Date(),
          link: '/support/documents',
        },
        {
          id: '3',
          title: 'Objectif atteint',
          message: "L'objectif OBJ-2024-003 a atteint 100%",
          type: 'success',
          read: true,
          createdAt: new Date(),
        },
      ],
      sidebarCollapsed: false,
      darkMode: false,

      setUser: (user) => set({ user }),

      addNotification: (notification) =>
        set((state) => ({
          notifications: [
            {
              ...notification,
              id: Math.random().toString(36).slice(2),
              createdAt: new Date(),
            },
            ...state.notifications,
          ],
        })),

      markNotificationRead: (id) =>
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
          ),
        })),

      markAllNotificationsRead: () =>
        set((state) => ({
          notifications: state.notifications.map((n) => ({ ...n, read: true })),
        })),

      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      toggleDarkMode: () =>
        set((state) => {
          const newDarkMode = !state.darkMode;
          if (newDarkMode) {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
          return { darkMode: newDarkMode };
        }),

      can: (permission) => {
        const { user } = get();
        if (!user) return false;
        
        const permissions = rolePermissions[user.role];
        if (permissions.includes('*')) return true;
        
        return permissions.includes(permission);
      },
    }),
    {
      name: 'qhse-app-storage',
      partialize: (state) => ({
        darkMode: state.darkMode,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    }
  )
);
