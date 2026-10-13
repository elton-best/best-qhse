import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  Home, 
  Target, 
  Users, 
  TrendingUp, 
  Headphones, 
  Play, 
  BarChart, 
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Menu,
  X,
  Building2,
  UserCircle,
  FileText,
  GitBranch,
  Shield,
  Goal,
  AlertTriangle,
  ListChecks,
  Wrench,
  GraduationCap,
  PlayCircle,
  ClipboardCheck,
  TrendingDown
} from 'lucide-react';

interface SidebarProps {
  darkMode: boolean;
  isOpen: boolean;
  onClose: () => void;
}

interface NavItem {
  id: string;
  title: string;
  icon: any;
  path?: string;
  children?: {
    title: string;
    path: string;
    icon: any;
  }[];
}

export default function Sidebar({ darkMode, isOpen, onClose }: SidebarProps) {
  const location = useLocation();
  const [expandedSections, setExpandedSections] = useState<string[]>(['point4']);

  const navItems: NavItem[] = [
    {
      id: 'dashboard',
      title: 'Tableau de Bord',
      icon: Home,
      path: '/dashboard'
    },
    {
      id: 'point4',
      title: 'Point 4 - Contexte',
      icon: Building2,
      children: [
        { title: 'Enjeux Stratégiques', path: '/context', icon: Target },
        { title: 'Parties Intéressées', path: '/context/stakeholders', icon: Users },
        { title: "Domaine d'Application", path: '/context/scope', icon: GitBranch },
        { title: 'Cartographie Processus', path: '/context/processes', icon: GitBranch }
      ]
    },
    {
      id: 'point5',
      title: 'Point 5 - Leadership',
      icon: Shield,
      children: [
        { title: 'Politique QHSE', path: '/leadership', icon: FileText },
        { title: 'Rôles & Responsabilités', path: '/leadership/roles', icon: UserCircle },
        { title: 'Consultation', path: '/leadership/consultation', icon: Users }
      ]
    },
    {
      id: 'point6',
      title: 'Point 6 - Planification',
      icon: Goal,
      children: [
        { title: 'Risques & Opportunités', path: '/planning/risks', icon: AlertTriangle },
        { title: 'Objectifs & Indicateurs', path: '/planning', icon: Target },
        { title: 'Conformité Légale', path: '/planning/compliance', icon: ListChecks },
        { title: 'Aspects Environnementaux', path: '/planning/environment', icon: TrendingUp },
        { title: 'SST - DUERP', path: '/planning/sst', icon: Shield }
      ]
    },
    {
      id: 'point7',
      title: 'Point 7 - Support',
      icon: Headphones,
      children: [
        { title: 'Ressources & Équipements', path: '/support/equipment', icon: Wrench },
        { title: 'Compétences & Formation', path: '/support/training', icon: GraduationCap },
        { title: 'Sensibilisation', path: '/support/awareness', icon: Users },
        { title: 'Gestion Documentaire', path: '/support', icon: FileText }
      ]
    },
    {
      id: 'point8',
      title: 'Point 8 - Réalisation',
      icon: PlayCircle,
      children: [
        { title: 'Maîtrise Opérationnelle', path: '/operations', icon: Play },
        { title: "Actions d'Urgence", path: '/operations/emergency', icon: AlertTriangle }
      ]
    },
    {
      id: 'point9',
      title: 'Point 9 - Évaluation',
      icon: BarChart,
      children: [
        { title: 'Surveillance & Mesure', path: '/evaluation', icon: TrendingUp },
        { title: 'Audits Internes', path: '/evaluation/audits', icon: ClipboardCheck },
        { title: 'Revue de Direction', path: '/evaluation/review', icon: Users }
      ]
    },
    {
      id: 'point10',
      title: 'Point 10 - Amélioration',
      icon: RefreshCw,
      children: [
        { title: 'Non-conformités', path: '/improvement/nonconformities', icon: AlertTriangle },
        { title: 'Actions Correctives', path: '/improvement', icon: TrendingDown },
        { title: 'Tableau de Bord Actions', path: '/improvement/actions', icon: ListChecks }
      ]
    }
  ];

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => 
      prev.includes(sectionId) 
        ? prev.filter(id => id !== sectionId)
        : [...prev, sectionId]
    );
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 h-screen w-72 bg-white dark:bg-gray-900 
          border-r border-gray-200 dark:border-gray-800
          transition-transform duration-300 ease-in-out z-50
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          overflow-y-auto
        `}
      >
        {/* Logo & Close button */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#6366f1] to-[#818cf8] flex items-center justify-center">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 dark:text-white">SMI QHSE</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Plateforme Pro</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-1">
          {navItems.map((item) => (
            <div key={item.id}>
              {item.path ? (
                <Link
                  to={item.path}
                  onClick={onClose}
                  className={`
                    flex items-center gap-3 px-4 py-3 rounded-xl
                    transition-all duration-200
                    ${isActive(item.path)
                      ? 'bg-[#6366f1] text-white shadow-lg shadow-[#6366f1]/30'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }
                  `}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="font-medium">{item.title}</span>
                </Link>
              ) : (
                <>
                  <button
                    onClick={() => toggleSection(item.id)}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-200"
                  >
                    <div className="flex items-center gap-3">
                      <item.icon className="w-5 h-5" />
                      <span className="font-medium">{item.title}</span>
                    </div>
                    {expandedSections.includes(item.id) ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </button>
                  
                  {expandedSections.includes(item.id) && item.children && (
                    <div className="ml-4 mt-1 space-y-1 animate-[fadeIn_0.2s_ease]">
                      {item.children.map((child) => (
                        <Link
                          key={child.path}
                          to={child.path}
                          onClick={onClose}
                          className={`
                            flex items-center gap-3 px-4 py-2 rounded-lg text-sm
                            transition-all duration-200
                            ${isActive(child.path)
                              ? 'bg-[#6366f1]/10 text-[#6366f1] dark:bg-[#6366f1]/20 font-medium'
                              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                            }
                          `}
                        >
                          <child.icon className="w-4 h-4" />
                          <span>{child.title}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          <div className="glass rounded-xl p-4">
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">Version 2026.1</p>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#10b981] animate-pulse" />
              <span className="text-xs text-gray-600 dark:text-gray-400">Système opérationnel</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
