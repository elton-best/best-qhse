import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Target, Clock } from 'lucide-react';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export default function Dashboard() {
  const kpiData = [
    {
      title: 'Atteinte Objectifs',
      value: '87%',
      change: '+12%',
      trend: 'up',
      icon: Target,
      color: 'from-[#10b981] to-[#059669]'
    },
    {
      title: 'Actions en Cours',
      value: '24',
      change: '-3',
      trend: 'down',
      icon: Clock,
      color: 'from-[#6366f1] to-[#818cf8]'
    },
    {
      title: 'Conformité Légale',
      value: '94%',
      change: '+5%',
      trend: 'up',
      icon: CheckCircle,
      color: 'from-[#10b981] to-[#059669]'
    },
    {
      title: 'Alertes Risques',
      value: '3',
      change: '+2',
      trend: 'warning',
      icon: AlertTriangle,
      color: 'from-[#ef4444] to-[#dc2626]'
    }
  ];

  const actionsData = {
    labels: ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin'],
    datasets: [
      {
        label: 'Actions Complétées',
        data: [12, 19, 15, 25, 22, 30],
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        fill: true,
        tension: 0.4
      },
      {
        label: 'Actions Planifiées',
        data: [15, 23, 18, 28, 25, 32],
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99, 102, 241, 0.1)',
        fill: true,
        tension: 0.4
      }
    ]
  };

  const kpiTrendsData = {
    labels: ['S1', 'S2', 'S3', 'S4'],
    datasets: [
      {
        label: 'Conformité',
        data: [85, 88, 91, 94],
        backgroundColor: '#10b981'
      },
      {
        label: 'Objectifs',
        data: [78, 82, 85, 87],
        backgroundColor: '#6366f1'
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top' as const
      }
    },
    scales: {
      y: {
        beginAtZero: true
      }
    }
  };

  const riskMatrix = [
    { process: 'Production', risk: 'Accident travail', prob: 'Moyenne', grav: 'Grave', criticite: 12, color: 'bg-[#ef4444]' },
    { process: 'Stockage', risk: 'Pollution sol', prob: 'Faible', grav: 'Critique', criticite: 8, color: 'bg-[#f59e0b]' },
    { process: 'Maintenance', risk: 'Électrocution', prob: 'Moyenne', grav: 'Critique', criticite: 15, color: 'bg-[#ef4444]' },
    { process: 'Livraison', risk: 'Accident route', prob: 'Faible', grav: 'Grave', criticite: 6, color: 'bg-[#10b981]' },
    { process: 'Administration', risk: 'Données perso', prob: 'Moyenne', grav: 'Moyenne', criticite: 9, color: 'bg-[#f59e0b]' }
  ];

  return (
    <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
      {/* Header */}
      <div>
        <h1 className="text-gray-900 dark:text-white mb-2">Tableau de Bord QHSE</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Vue d'ensemble de votre système de management intégré
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpiData.map((kpi, index) => (
          <div
            key={index}
            className="glass rounded-2xl p-6 hover:scale-[1.02] transition-all duration-200 cursor-pointer"
          >
            <div className="flex items-start justify-between mb-4">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${kpi.color} flex items-center justify-center`}>
                <kpi.icon className="w-6 h-6 text-white" />
              </div>
              <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                kpi.trend === 'up' ? 'bg-[#10b981]/10 text-[#10b981]' :
                kpi.trend === 'down' ? 'bg-[#6366f1]/10 text-[#6366f1]' :
                'bg-[#ef4444]/10 text-[#ef4444]'
              }`}>
                {kpi.trend === 'up' ? (
                  <TrendingUp className="w-3 h-3" />
                ) : kpi.trend === 'down' ? (
                  <TrendingDown className="w-3 h-3" />
                ) : (
                  <AlertTriangle className="w-3 h-3" />
                )}
                {kpi.change}
              </div>
            </div>
            <h3 className="text-3xl font-bold text-gray-900 dark:text-white mb-1">
              {kpi.value}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {kpi.title}
            </p>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Actions Progress Chart */}
        <div className="glass rounded-2xl p-6">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
            Progression des Actions
          </h3>
          <div className="h-64">
            <Line data={actionsData} options={chartOptions} />
          </div>
        </div>

        {/* KPI Trends Chart */}
        <div className="glass rounded-2xl p-6">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
            Tendances KPI
          </h3>
          <div className="h-64">
            <Bar data={kpiTrendsData} options={chartOptions} />
          </div>
        </div>
      </div>

      {/* Risk Heatmap */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
              Heatmap des Risques Critiques
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Vue synthétique des risques majeurs par processus
            </p>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-[#10b981]" />
              <span className="text-gray-600 dark:text-gray-400">Faible</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-[#f59e0b]" />
              <span className="text-gray-600 dark:text-gray-400">Moyen</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-[#ef4444]" />
              <span className="text-gray-600 dark:text-gray-400">Critique</span>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">Processus</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">Risque</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">Probabilité</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">Gravité</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">Criticité</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">Niveau</th>
              </tr>
            </thead>
            <tbody>
              {riskMatrix.map((item, index) => (
                <tr key={index} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <td className="py-3 px-4 text-sm font-medium text-gray-900 dark:text-white">{item.process}</td>
                  <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300">{item.risk}</td>
                  <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300">{item.prob}</td>
                  <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300">{item.grav}</td>
                  <td className="py-3 px-4 text-sm font-bold text-gray-900 dark:text-white">{item.criticite}</td>
                  <td className="py-3 px-4">
                    <div className={`w-16 h-8 ${item.color} rounded-lg`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid md:grid-cols-3 gap-6">
        <button className="glass rounded-2xl p-6 text-left hover:scale-[1.02] transition-all duration-200 group">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#6366f1] to-[#818cf8] flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <Target className="w-6 h-6 text-white" />
          </div>
          <h4 className="font-bold text-gray-900 dark:text-white mb-2">Nouveau Risque</h4>
          <p className="text-sm text-gray-600 dark:text-gray-400">Identifier et évaluer un nouveau risque</p>
        </button>

        <button className="glass rounded-2xl p-6 text-left hover:scale-[1.02] transition-all duration-200 group">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#10b981] to-[#059669] flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <CheckCircle className="w-6 h-6 text-white" />
          </div>
          <h4 className="font-bold text-gray-900 dark:text-white mb-2">Nouvel Audit</h4>
          <p className="text-sm text-gray-600 dark:text-gray-400">Planifier un audit interne</p>
        </button>

        <button className="glass rounded-2xl p-6 text-left hover:scale-[1.02] transition-all duration-200 group">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#f59e0b] to-[#d97706] flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <AlertTriangle className="w-6 h-6 text-white" />
          </div>
          <h4 className="font-bold text-gray-900 dark:text-white mb-2">Action Corrective</h4>
          <p className="text-sm text-gray-600 dark:text-gray-400">Créer une action corrective</p>
        </button>
      </div>
    </div>
  );
}
