import React from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Target,
  FileText,
  Clock,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import Chart from 'react-apexcharts';
import { ApexOptions } from 'apexcharts';
import { Link } from 'react-router-dom';
import { useQHSEStore } from '@/stores/qhseStore';
import { useAppStore } from '@/stores/appStore';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

export const Dashboard: React.FC = () => {
  const { risks, objectives, actions } = useQHSEStore();
  const { user, notifications } = useAppStore();

  // KPI Calculations
  const objectivesAtteints = objectives.filter((o) => o.statut === 'atteint').length;
  const objectifsTotal = objectives.length;
  const tauxObjectifs = Math.round((objectivesAtteints / objectifsTotal) * 100);

  const actionsEnRetard = actions.filter((a) => a.retard > 10 && a.statut !== 'cloturee').length;
  const actionsEnCours = actions.filter(
    (a) => a.statut === 'en_cours' || a.statut === 'ouverte'
  ).length;
  const tauxActions = Math.round(
    (actions.filter((a) => a.statut === 'cloturee' || a.statut === 'validee').length /
      actions.length) *
      100
  );

  const risquesCritiques = risks.filter((r) => r.niveau === 'critique' || r.niveau === 'eleve').length;
  const risquesMaitrises = risks.filter((r) => r.statut === 'maitrise').length;
  const tauxMaitrise = Math.round((risquesMaitrises / risks.length) * 100);

  // Risk Matrix Heatmap Data
  const riskMatrixData = [
    [0, 0, 1, 0, 0],
    [0, 1, 0, 1, 0],
    [1, 0, 1, 0, 0],
    [0, 1, 0, 0, 1],
    [0, 0, 0, 0, 0],
  ];

  const heatmapOptions: ApexOptions = {
    chart: {
      type: 'heatmap',
      toolbar: { show: false },
      background: 'transparent',
    },
    dataLabels: {
      enabled: true,
      style: {
        colors: ['#fff'],
      },
    },
    colors: ['#22c55e'],
    plotOptions: {
      heatmap: {
        shadeIntensity: 0.5,
        radius: 8,
        colorScale: {
          ranges: [
            { from: 0, to: 0, color: '#e5e7eb', name: 'Aucun' },
            { from: 1, to: 4, color: '#22c55e', name: 'Faible' },
            { from: 5, to: 9, color: '#eab308', name: 'Moyen' },
            { from: 10, to: 16, color: '#f97316', name: 'Élevé' },
            { from: 17, to: 25, color: '#ef4444', name: 'Critique' },
          ],
        },
      },
    },
    xaxis: {
      categories: ['1', '2', '3', '4', '5'],
      title: { text: 'Gravité', style: { fontFamily: 'Inter' } },
      labels: { style: { fontFamily: 'Inter' } },
    },
    yaxis: {
      title: { text: 'Probabilité', style: { fontFamily: 'Inter' } },
      labels: { style: { fontFamily: 'Inter' } },
    },
    tooltip: {
      theme: 'dark',
    },
  };

  const heatmapSeries = [
    { name: '5', data: [5, 10, 15, 20, 25] },
    { name: '4', data: [4, 8, 12, 16, 20] },
    { name: '3', data: [3, 6, 9, 12, 15] },
    { name: '2', data: [2, 4, 6, 8, 10] },
    { name: '1', data: [1, 2, 3, 4, 5] },
  ];

  // Objectives Chart
  const objectivesChartOptions: ApexOptions = {
    chart: {
      type: 'radialBar',
      background: 'transparent',
    },
    plotOptions: {
      radialBar: {
        hollow: { size: '65%' },
        track: {
          background: 'hsl(var(--muted))',
        },
        dataLabels: {
          name: {
            fontSize: '14px',
            color: 'hsl(var(--muted-foreground))',
            fontFamily: 'Inter',
          },
          value: {
            fontSize: '28px',
            fontWeight: 700,
            color: 'hsl(var(--foreground))',
            fontFamily: 'Space Grotesk',
          },
        },
      },
    },
    fill: {
      type: 'gradient',
      gradient: {
        shade: 'dark',
        type: 'vertical',
        stops: [0, 100],
        colorStops: [
          { offset: 0, color: 'hsl(199, 89%, 48%)', opacity: 1 },
          { offset: 100, color: 'hsl(217, 91%, 60%)', opacity: 1 },
        ],
      },
    },
    labels: ['Progression'],
  };

  // Actions Timeline Chart
  const actionsChartOptions: ApexOptions = {
    chart: {
      type: 'bar',
      toolbar: { show: false },
      background: 'transparent',
    },
    plotOptions: {
      bar: {
        horizontal: true,
        borderRadius: 6,
        barHeight: '60%',
        distributed: true,
      },
    },
    colors: ['#22c55e', '#3b82f6', '#eab308', '#ef4444'],
    dataLabels: { enabled: false },
    legend: { show: false },
    xaxis: {
      categories: ['Clôturées', 'En cours', 'En retard', 'Critiques'],
      labels: { style: { fontFamily: 'Inter' } },
    },
    yaxis: {
      labels: { style: { fontFamily: 'Inter' } },
    },
    tooltip: { theme: 'dark' },
  };

  const actionsChartSeries = [
    {
      name: 'Actions',
      data: [
        actions.filter((a) => a.statut === 'cloturee').length,
        actions.filter((a) => a.statut === 'en_cours').length,
        actionsEnRetard,
        actions.filter((a) => a.retard > 20).length,
      ],
    },
  ];

  const kpiCards = [
    {
      title: 'Objectifs Atteints',
      value: `${objectivesAtteints}/${objectifsTotal}`,
      percentage: tauxObjectifs,
      trend: 'up',
      icon: Target,
      color: 'text-success',
      bgColor: 'bg-success/10',
    },
    {
      title: 'Actions en Cours',
      value: actionsEnCours.toString(),
      percentage: tauxActions,
      trend: 'neutral',
      icon: CheckCircle,
      color: 'text-accent',
      bgColor: 'bg-accent/10',
    },
    {
      title: 'Risques Élevés',
      value: risquesCritiques.toString(),
      percentage: tauxMaitrise,
      trend: risquesCritiques > 2 ? 'down' : 'up',
      icon: AlertTriangle,
      color: 'text-warning',
      bgColor: 'bg-warning/10',
    },
    {
      title: 'Actions en Retard',
      value: actionsEnRetard.toString(),
      percentage: 100 - (actionsEnRetard / actions.length) * 100,
      trend: actionsEnRetard > 0 ? 'down' : 'up',
      icon: Clock,
      color: 'text-destructive',
      bgColor: 'bg-destructive/10',
    },
  ];

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Welcome Header */}
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">
            Bonjour, {user?.name.split(' ')[0]} 👋
          </h1>
          <p className="text-muted-foreground mt-1">
            Voici l'aperçu de votre système de management intégré
          </p>
        </div>
        <Button className="ai-button">
          <Sparkles className="h-4 w-4" />
          Générer rapport avec IA
        </Button>
      </motion.div>

      {/* KPI Cards */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((kpi, index) => (
          <motion.div
            key={kpi.title}
            variants={itemVariants}
            whileHover={{ y: -4 }}
            className="card-kpi"
          >
            <div className="flex items-start justify-between">
              <div className={`p-2 rounded-lg ${kpi.bgColor}`}>
                <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
              </div>
              {kpi.trend === 'up' && (
                <TrendingUp className="h-4 w-4 text-success" />
              )}
              {kpi.trend === 'down' && (
                <TrendingDown className="h-4 w-4 text-destructive" />
              )}
            </div>
            <div className="mt-4">
              <p className="text-2xl font-heading font-bold">{kpi.value}</p>
              <p className="text-sm text-muted-foreground mt-1">{kpi.title}</p>
            </div>
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-muted-foreground">Taux</span>
                <span className="font-medium">{kpi.percentage}%</span>
              </div>
              <Progress value={kpi.percentage} className="h-1.5" />
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Risk Heatmap */}
        <motion.div variants={itemVariants} className="card-kpi">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-heading font-semibold text-lg">Matrice des Risques</h3>
              <p className="text-sm text-muted-foreground">Vue d'ensemble criticité</p>
            </div>
            <Link to="/planification/risques">
              <Button variant="ghost" size="sm" className="gap-1">
                Voir tout <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
          <Chart
            options={heatmapOptions}
            series={heatmapSeries}
            type="heatmap"
            height={280}
          />
        </motion.div>

        {/* Objectives Progress */}
        <motion.div variants={itemVariants} className="card-kpi">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-heading font-semibold text-lg">Progression Objectifs</h3>
              <p className="text-sm text-muted-foreground">Année en cours</p>
            </div>
            <Link to="/planification/objectifs">
              <Button variant="ghost" size="sm" className="gap-1">
                Voir tout <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
          <div className="flex items-center gap-6">
            <div className="w-48">
              <Chart
                options={objectivesChartOptions}
                series={[Math.round((objectives.reduce((acc, o) => acc + o.progression, 0) / objectives.length))]}
                type="radialBar"
                height={200}
              />
            </div>
            <div className="flex-1 space-y-3">
              {objectives.slice(0, 4).map((obj) => (
                <div key={obj.id} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="truncate pr-4">{obj.libelle}</span>
                    <span className="font-medium shrink-0">{obj.progression}%</span>
                  </div>
                  <Progress
                    value={obj.progression}
                    className="h-1.5"
                  />
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Actions & Alerts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Actions Chart */}
        <motion.div variants={itemVariants} className="card-kpi lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-heading font-semibold text-lg">État des Actions</h3>
              <p className="text-sm text-muted-foreground">Suivi global</p>
            </div>
            <Link to="/amelioration/actions">
              <Button variant="ghost" size="sm" className="gap-1">
                Gérer <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
          <Chart
            options={actionsChartOptions}
            series={actionsChartSeries}
            type="bar"
            height={200}
          />
        </motion.div>

        {/* Alerts Panel */}
        <motion.div variants={itemVariants} className="card-kpi">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-heading font-semibold text-lg">Alertes Récentes</h3>
            <span className="text-xs px-2 py-1 rounded-full bg-destructive/10 text-destructive font-medium">
              {notifications.filter((n) => !n.read).length} non lues
            </span>
          </div>
          <div className="space-y-3">
            {notifications.slice(0, 4).map((notif) => (
              <div
                key={notif.id}
                className={`p-3 rounded-lg border transition-colors ${
                  notif.read
                    ? 'bg-muted/30 border-border/50'
                    : 'bg-card border-accent/30'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`p-1.5 rounded-lg ${
                      notif.type === 'error'
                        ? 'bg-destructive/10'
                        : notif.type === 'warning'
                        ? 'bg-warning/10'
                        : notif.type === 'success'
                        ? 'bg-success/10'
                        : 'bg-accent/10'
                    }`}
                  >
                    <AlertTriangle
                      className={`h-3.5 w-3.5 ${
                        notif.type === 'error'
                          ? 'text-destructive'
                          : notif.type === 'warning'
                          ? 'text-warning'
                          : notif.type === 'success'
                          ? 'text-success'
                          : 'text-accent'
                      }`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{notif.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {notif.message}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Quick Actions */}
      <motion.div variants={itemVariants} className="card-kpi">
        <h3 className="font-heading font-semibold text-lg mb-4">Actions Rapides</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Link to="/planification/risques">
            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="p-4 rounded-xl border border-border/50 hover:border-accent/50 hover:bg-accent/5 transition-all cursor-pointer group"
            >
              <AlertTriangle className="h-8 w-8 text-warning mb-3 group-hover:scale-110 transition-transform" />
              <p className="font-medium text-sm">Nouveau Risque</p>
              <p className="text-xs text-muted-foreground">Identifier un risque</p>
            </motion.div>
          </Link>
          <Link to="/support/documents">
            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="p-4 rounded-xl border border-border/50 hover:border-accent/50 hover:bg-accent/5 transition-all cursor-pointer group"
            >
              <FileText className="h-8 w-8 text-accent mb-3 group-hover:scale-110 transition-transform" />
              <p className="font-medium text-sm">Uploader Document</p>
              <p className="text-xs text-muted-foreground">Ajouter un fichier</p>
            </motion.div>
          </Link>
          <Link to="/amelioration/nc">
            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="p-4 rounded-xl border border-border/50 hover:border-accent/50 hover:bg-accent/5 transition-all cursor-pointer group"
            >
              <AlertTriangle className="h-8 w-8 text-destructive mb-3 group-hover:scale-110 transition-transform" />
              <p className="font-medium text-sm">Déclarer NC</p>
              <p className="text-xs text-muted-foreground">Non-conformité</p>
            </motion.div>
          </Link>
          <Link to="/evaluation/audits">
            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="p-4 rounded-xl border border-border/50 hover:border-accent/50 hover:bg-accent/5 transition-all cursor-pointer group"
            >
              <CheckCircle className="h-8 w-8 text-success mb-3 group-hover:scale-110 transition-transform" />
              <p className="font-medium text-sm">Planifier Audit</p>
              <p className="text-xs text-muted-foreground">Interne ou externe</p>
            </motion.div>
          </Link>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default Dashboard;
