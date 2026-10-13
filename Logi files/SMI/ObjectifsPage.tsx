import React, { useState } from 'react';
import { motion } from 'framer-motion';
import Chart from 'react-apexcharts';
import { ApexOptions } from 'apexcharts';
import {
  Plus,
  Download,
  Target,
  TrendingUp,
  TrendingDown,
  Edit2,
  Eye,
  Calendar,
  Filter,
} from 'lucide-react';
import { useQHSEStore, Objective } from '@/stores/qhseStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

export const ObjectifsPage: React.FC = () => {
  const { objectives } = useQHSEStore();
  const [filterAxe, setFilterAxe] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredObjectives = objectives.filter((obj) => {
    const matchesAxe = filterAxe === 'all' || obj.axe === filterAxe;
    const matchesSearch =
      obj.libelle.toLowerCase().includes(searchTerm.toLowerCase()) ||
      obj.code.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesAxe && matchesSearch;
  });

  const axes = [...new Set(objectives.map((o) => o.axe))];

  const getStatutBadge = (statut: Objective['statut']) => {
    const styles = {
      en_cours: 'bg-accent/15 text-accent border-accent/30',
      atteint: 'bg-success/15 text-success border-success/30',
      non_atteint: 'bg-destructive/15 text-destructive border-destructive/30',
    };
    const labels = {
      en_cours: 'En cours',
      atteint: 'Atteint',
      non_atteint: 'Non atteint',
    };
    return (
      <Badge variant="outline" className={cn('font-medium', styles[statut])}>
        {labels[statut]}
      </Badge>
    );
  };

  const getAxeColor = (axe: string) => {
    const colors: Record<string, string> = {
      Qualité: 'bg-accent',
      Sécurité: 'bg-warning',
      Environnement: 'bg-success',
    };
    return colors[axe] || 'bg-primary';
  };

  // Chart for overall progress
  const progressChartOptions: ApexOptions = {
    chart: {
      type: 'donut',
      background: 'transparent',
    },
    labels: ['Atteints', 'En cours', 'Non atteints'],
    colors: ['hsl(152, 69%, 31%)', 'hsl(199, 89%, 48%)', 'hsl(0, 84%, 60%)'],
    plotOptions: {
      pie: {
        donut: {
          size: '70%',
          labels: {
            show: true,
            total: {
              show: true,
              label: 'Objectifs',
              fontSize: '14px',
              fontFamily: 'Inter',
              formatter: () => objectives.length.toString(),
            },
          },
        },
      },
    },
    legend: {
      position: 'bottom',
      fontFamily: 'Inter',
    },
    dataLabels: {
      enabled: false,
    },
  };

  const progressChartSeries = [
    objectives.filter((o) => o.statut === 'atteint').length,
    objectives.filter((o) => o.statut === 'en_cours').length,
    objectives.filter((o) => o.statut === 'non_atteint').length,
  ];

  // Progress by Axe
  const axeProgressChartOptions: ApexOptions = {
    chart: {
      type: 'bar',
      toolbar: { show: false },
      background: 'transparent',
    },
    plotOptions: {
      bar: {
        horizontal: true,
        borderRadius: 6,
        barHeight: '50%',
      },
    },
    colors: ['hsl(199, 89%, 48%)'],
    dataLabels: {
      enabled: true,
      formatter: (val) => `${val}%`,
      style: {
        fontSize: '12px',
        fontFamily: 'Inter',
      },
    },
    xaxis: {
      categories: axes,
      max: 100,
      labels: {
        style: { fontFamily: 'Inter' },
      },
    },
    yaxis: {
      labels: {
        style: { fontFamily: 'Inter' },
      },
    },
    tooltip: { theme: 'dark' },
  };

  const axeProgressSeries = [
    {
      name: 'Progression',
      data: axes.map((axe) => {
        const axeObjectives = objectives.filter((o) => o.axe === axe);
        return Math.round(
          axeObjectives.reduce((sum, o) => sum + o.progression, 0) / axeObjectives.length
        );
      }),
    },
  ];

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold">Objectifs QHSE</h1>
          <p className="text-muted-foreground">
            Point 6.2 - Définition et suivi des objectifs qualité, sécurité, environnement
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="h-4 w-4" />
            Exporter
          </Button>
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Nouvel Objectif
          </Button>
        </div>
      </motion.div>

      {/* Stats & Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Overall Stats */}
        <motion.div variants={itemVariants} className="lg:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="card-kpi">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">
                <Target className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-heading font-bold">{objectives.length}</p>
                <p className="text-sm text-muted-foreground">Total</p>
              </div>
            </div>
          </div>
          <div className="card-kpi">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-success/10">
                <TrendingUp className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-2xl font-heading font-bold">
                  {objectives.filter((o) => o.statut === 'atteint').length}
                </p>
                <p className="text-sm text-muted-foreground">Atteints</p>
              </div>
            </div>
          </div>
          <div className="card-kpi">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-accent/10">
                <Calendar className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="text-2xl font-heading font-bold">
                  {objectives.filter((o) => o.statut === 'en_cours').length}
                </p>
                <p className="text-sm text-muted-foreground">En cours</p>
              </div>
            </div>
          </div>
          <div className="card-kpi">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-destructive/10">
                <TrendingDown className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-heading font-bold">
                  {objectives.filter((o) => o.progression < 50).length}
                </p>
                <p className="text-sm text-muted-foreground">{"< 50%"}</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Donut Chart */}
        <motion.div variants={itemVariants} className="card-kpi">
          <h3 className="font-heading font-semibold mb-2">Répartition</h3>
          <Chart
            options={progressChartOptions}
            series={progressChartSeries}
            type="donut"
            height={200}
          />
        </motion.div>
      </div>

      {/* Progress by Axe */}
      <motion.div variants={itemVariants} className="card-kpi">
        <h3 className="font-heading font-semibold text-lg mb-4">Progression par Axe</h3>
        <Chart
          options={axeProgressChartOptions}
          series={axeProgressSeries}
          type="bar"
          height={200}
        />
      </motion.div>

      {/* Filters */}
      <motion.div variants={itemVariants} className="flex flex-wrap gap-3">
        <Input
          placeholder="Rechercher..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-64"
        />
        <Select value={filterAxe} onValueChange={setFilterAxe}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Axe" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les axes</SelectItem>
            {axes.map((axe) => (
              <SelectItem key={axe} value={axe}>
                {axe}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </motion.div>

      {/* Objectives Cards */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredObjectives.map((objective) => (
          <motion.div
            key={objective.id}
            variants={itemVariants}
            whileHover={{ y: -2 }}
            className="iso-card p-0 overflow-hidden"
            style={{
              ['--card-accent' as any]:
                objective.axe === 'Qualité'
                  ? 'hsl(199, 89%, 48%)'
                  : objective.axe === 'Sécurité'
                  ? 'hsl(38, 92%, 50%)'
                  : 'hsl(152, 69%, 31%)',
            }}
          >
            <div
              className="absolute left-0 top-0 h-full w-1"
              style={{
                background:
                  objective.axe === 'Qualité'
                    ? 'hsl(199, 89%, 48%)'
                    : objective.axe === 'Sécurité'
                    ? 'hsl(38, 92%, 50%)'
                    : 'hsl(152, 69%, 31%)',
              }}
            />
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge
                      variant="secondary"
                      className={cn('text-xs', getAxeColor(objective.axe), 'text-white')}
                    >
                      {objective.axe}
                    </Badge>
                    <span className="text-xs font-mono text-muted-foreground">
                      {objective.code}
                    </span>
                  </div>
                  <CardTitle className="text-base">{objective.libelle}</CardTitle>
                </div>
                {getStatutBadge(objective.statut)}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Indicator */}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Indicateur:</span>
                  <span className="font-medium">{objective.indicateur}</span>
                </div>

                {/* Target vs Realized */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-muted-foreground text-xs mb-1">Cible</p>
                    <p className="text-lg font-heading font-bold">
                      {objective.cible} {objective.unite}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-muted-foreground text-xs mb-1">Réalisé</p>
                    <p className="text-lg font-heading font-bold">
                      {objective.realise} {objective.unite}
                    </p>
                  </div>
                </div>

                {/* Progress */}
                <div>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-muted-foreground">Progression</span>
                    <span className="font-semibold">{objective.progression}%</span>
                  </div>
                  <Progress value={objective.progression} className="h-2" />
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-2 border-t">
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium">{objective.responsable}</span>
                    <span className="mx-2">•</span>
                    <span className="capitalize">{objective.frequence}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </motion.div>
        ))}
      </motion.div>
    </motion.div>
  );
};

export default ObjectifsPage;
