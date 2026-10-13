import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Building2,
  Users,
  Target,
  FileStack,
  Settings,
  ClipboardCheck,
  AlertTriangle,
  TrendingUp,
  ChevronDown,
  ChevronRight,
  Shield,
  BookOpen,
  FileText,
  HardHat,
  Leaf,
  Scale,
  Award,
  ChevronLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/appStore';

interface NavItem {
  label: string;
  icon: React.ElementType;
  path?: string;
  children?: NavItem[];
  isoPoint?: string;
  color?: string;
}

const navigationItems: NavItem[] = [
  {
    label: 'Tableau de bord',
    icon: LayoutDashboard,
    path: '/',
  },
  {
    label: 'Point 4 - Contexte',
    icon: Building2,
    isoPoint: '4',
    color: 'text-iso-context',
    children: [
      { label: 'Enjeux Stratégiques', icon: Target, path: '/contexte/enjeux' },
      { label: 'Parties Intéressées', icon: Users, path: '/contexte/parties' },
      { label: 'Domaine Application', icon: FileText, path: '/contexte/domaine' },
      { label: 'Cartographie Processus', icon: Settings, path: '/contexte/processus' },
    ],
  },
  {
    label: 'Point 5 - Leadership',
    icon: Award,
    isoPoint: '5',
    color: 'text-iso-leadership',
    children: [
      { label: 'Politique QHSE', icon: BookOpen, path: '/leadership/politique' },
      { label: 'Rôles & Responsabilités', icon: Users, path: '/leadership/roles' },
      { label: 'Consultation', icon: ClipboardCheck, path: '/leadership/consultation' },
    ],
  },
  {
    label: 'Point 6 - Planification',
    icon: Target,
    isoPoint: '6',
    color: 'text-iso-planning',
    children: [
      { label: 'Risques & Opportunités', icon: AlertTriangle, path: '/planification/risques' },
      { label: 'Objectifs QHSE', icon: Target, path: '/planification/objectifs' },
      { label: 'Veille Conformité', icon: Scale, path: '/planification/conformite' },
      { label: 'Analyse Environnementale', icon: Leaf, path: '/planification/environnement' },
      { label: 'DUERP / SST', icon: HardHat, path: '/planification/sst' },
    ],
  },
  {
    label: 'Point 7 - Support',
    icon: FileStack,
    isoPoint: '7',
    color: 'text-iso-support',
    children: [
      { label: 'Ressources', icon: Settings, path: '/support/ressources' },
      { label: 'Compétences', icon: Users, path: '/support/competences' },
      { label: 'Sensibilisation', icon: BookOpen, path: '/support/sensibilisation' },
      { label: 'Gestion Documentaire', icon: FileText, path: '/support/documents' },
    ],
  },
  {
    label: 'Point 8 - Réalisation',
    icon: Settings,
    isoPoint: '8',
    color: 'text-iso-realization',
    children: [
      { label: 'Maîtrise Opérationnelle', icon: ClipboardCheck, path: '/realisation/maitrise' },
      { label: 'Actions Urgence', icon: AlertTriangle, path: '/realisation/urgence' },
    ],
  },
  {
    label: 'Point 9 - Évaluation',
    icon: TrendingUp,
    isoPoint: '9',
    color: 'text-iso-evaluation',
    children: [
      { label: 'Surveillance & Mesure', icon: TrendingUp, path: '/evaluation/surveillance' },
      { label: 'Audits', icon: ClipboardCheck, path: '/evaluation/audits' },
      { label: 'Revue Direction', icon: Users, path: '/evaluation/revue' },
    ],
  },
  {
    label: 'Point 10 - Amélioration',
    icon: TrendingUp,
    isoPoint: '10',
    color: 'text-iso-improvement',
    children: [
      { label: 'Non-conformités', icon: AlertTriangle, path: '/amelioration/nc' },
      { label: 'Actions Correctives', icon: Target, path: '/amelioration/actions' },
      { label: 'Tableau de Bord', icon: LayoutDashboard, path: '/amelioration/tableau' },
    ],
  },
];

export const QHSESidebar: React.FC = () => {
  const location = useLocation();
  const { sidebarCollapsed, toggleSidebar } = useAppStore();
  const [expandedItems, setExpandedItems] = useState<string[]>(['Point 6 - Planification']);

  const toggleExpand = (label: string) => {
    setExpandedItems((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    );
  };

  const isActive = (path?: string) => path === location.pathname;
  const isParentActive = (children?: NavItem[]) =>
    children?.some((child) => child.path === location.pathname);

  return (
    <motion.aside
      initial={false}
      animate={{ width: sidebarCollapsed ? 64 : 256 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      className="fixed left-0 top-0 h-screen bg-sidebar z-50 flex flex-col border-r border-sidebar-border"
    >
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-sidebar-border">
        <AnimatePresence mode="wait">
          {!sidebarCollapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2"
            >
              <Shield className="h-8 w-8 text-sidebar-primary" />
              <span className="font-heading font-bold text-lg text-sidebar-foreground">
                SMI QHSE
              </span>
            </motion.div>
          )}
        </AnimatePresence>
        {sidebarCollapsed && <Shield className="h-8 w-8 text-sidebar-primary mx-auto" />}
        <button
          onClick={toggleSidebar}
          className="p-1.5 rounded-lg hover:bg-sidebar-accent transition-colors text-sidebar-foreground/70 hover:text-sidebar-foreground"
        >
          <ChevronLeft
            className={cn('h-4 w-4 transition-transform', sidebarCollapsed && 'rotate-180')}
          />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2">
        <ul className="space-y-1">
          {navigationItems.map((item) => (
            <li key={item.label}>
              {item.children ? (
                // Parent with children
                <div>
                  <button
                    onClick={() => toggleExpand(item.label)}
                    className={cn(
                      'sidebar-item w-full justify-between',
                      (isParentActive(item.children) || expandedItems.includes(item.label)) &&
                        'bg-sidebar-accent text-sidebar-foreground'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <item.icon className={cn('h-5 w-5 flex-shrink-0', item.color)} />
                      <AnimatePresence mode="wait">
                        {!sidebarCollapsed && (
                          <motion.span
                            initial={{ opacity: 0, width: 0 }}
                            animate={{ opacity: 1, width: 'auto' }}
                            exit={{ opacity: 0, width: 0 }}
                            className="text-sm font-medium truncate"
                          >
                            {item.label}
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </div>
                    {!sidebarCollapsed && (
                      <motion.div
                        animate={{ rotate: expandedItems.includes(item.label) ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <ChevronDown className="h-4 w-4" />
                      </motion.div>
                    )}
                  </button>

                  <AnimatePresence>
                    {expandedItems.includes(item.label) && !sidebarCollapsed && (
                      <motion.ul
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden ml-4 mt-1 space-y-1 border-l border-sidebar-border pl-3"
                      >
                        {item.children.map((child) => (
                          <li key={child.path}>
                            <Link
                              to={child.path!}
                              className={cn(
                                'sidebar-item text-sm',
                                isActive(child.path) && 'active'
                              )}
                            >
                              <child.icon className="h-4 w-4 flex-shrink-0" />
                              <span className="truncate">{child.label}</span>
                            </Link>
                          </li>
                        ))}
                      </motion.ul>
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                // Single item
                <Link
                  to={item.path!}
                  className={cn('sidebar-item', isActive(item.path) && 'active')}
                >
                  <item.icon className="h-5 w-5 flex-shrink-0" />
                  <AnimatePresence mode="wait">
                    {!sidebarCollapsed && (
                      <motion.span
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: 'auto' }}
                        exit={{ opacity: 0, width: 0 }}
                        className="text-sm font-medium"
                      >
                        {item.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </Link>
              )}
            </li>
          ))}
        </ul>
      </nav>

      {/* User Section */}
      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-sidebar-primary flex items-center justify-center text-sidebar-primary-foreground font-medium text-sm flex-shrink-0">
            JD
          </div>
          <AnimatePresence mode="wait">
            {!sidebarCollapsed && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="overflow-hidden"
              >
                <p className="text-sm font-medium text-sidebar-foreground truncate">
                  Jean Dupont
                </p>
                <p className="text-xs text-sidebar-foreground/60 truncate">
                  Responsable Qualité
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.aside>
  );
};
