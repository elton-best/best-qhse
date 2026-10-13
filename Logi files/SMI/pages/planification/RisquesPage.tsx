import React, { useState } from 'react';
import { motion } from 'framer-motion';
import Chart from 'react-apexcharts';
import { ApexOptions } from 'apexcharts';
import {
  Plus,
  Filter,
  Download,
  AlertTriangle,
  TrendingUp,
  Edit2,
  Trash2,
  Eye,
  Sparkles,
} from 'lucide-react';
import { useQHSEStore, Risk } from '@/stores/qhseStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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

export const RisquesPage: React.FC = () => {
  const { risks, addRisk, updateRisk } = useQHSEStore();
  const [filterType, setFilterType] = useState<string>('all');
  const [filterNiveau, setFilterNiveau] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'matrix'>('table');

  const filteredRisks = risks.filter((risk) => {
    const matchesType = filterType === 'all' || risk.type === filterType;
    const matchesNiveau = filterNiveau === 'all' || risk.niveau === filterNiveau;
    const matchesSearch =
      risk.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      risk.processus.toLowerCase().includes(searchTerm.toLowerCase()) ||
      risk.code.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesType && matchesNiveau && matchesSearch;
  });

  const getNiveauBadge = (niveau: Risk['niveau']) => {
    const styles = {
      faible: 'bg-success/15 text-success border-success/30',
      moyen: 'bg-warning/15 text-warning border-warning/30',
      eleve: 'bg-destructive/15 text-destructive border-destructive/30',
      critique: 'bg-destructive text-destructive-foreground border-destructive',
    };
    const labels = {
      faible: 'Faible',
      moyen: 'Moyen',
      eleve: 'Élevé',
      critique: 'Critique',
    };
    return (
      <Badge variant="outline" className={cn('font-medium', styles[niveau])}>
        {labels[niveau]}
      </Badge>
    );
  };

  const getStatutBadge = (statut: Risk['statut']) => {
    const styles = {
      identifie: 'status-chip status-draft',
      en_cours: 'status-chip status-pending',
      maitrise: 'status-chip status-validated',
      clos: 'status-chip bg-muted text-muted-foreground',
    };
    const labels = {
      identifie: 'Identifié',
      en_cours: 'En cours',
      maitrise: 'Maîtrisé',
      clos: 'Clos',
    };
    return <span className={styles[statut]}>{labels[statut]}</span>;
  };

  // Heatmap configuration
  const heatmapOptions: ApexOptions = {
    chart: {
      type: 'heatmap',
      toolbar: { show: false },
      background: 'transparent',
      events: {
        dataPointSelection: (event, chartContext, config) => {
          // Handle cell click
        },
      },
    },
    dataLabels: {
      enabled: true,
      formatter: (val) => {
        const count = risks.filter(
          (r) => r.criticite === val
        ).length;
        return count > 0 ? count.toString() : '';
      },
      style: {
        colors: ['#fff'],
        fontSize: '14px',
        fontWeight: 600,
      },
    },
    plotOptions: {
      heatmap: {
        shadeIntensity: 0.5,
        radius: 8,
        useFillColorAsStroke: false,
        colorScale: {
          ranges: [
            { from: 0, to: 0, color: '#f3f4f6', name: 'Aucun' },
            { from: 1, to: 4, color: '#22c55e', name: 'Faible' },
            { from: 5, to: 9, color: '#eab308', name: 'Moyen' },
            { from: 10, to: 16, color: '#f97316', name: 'Élevé' },
            { from: 17, to: 25, color: '#ef4444', name: 'Critique' },
          ],
        },
      },
    },
    xaxis: {
      categories: ['1 - Négligeable', '2 - Mineure', '3 - Modérée', '4 - Majeure', '5 - Catastrophique'],
      title: { text: 'Gravité', style: { fontFamily: 'Space Grotesk', fontWeight: 600 } },
      labels: { style: { fontFamily: 'Inter', fontSize: '11px' } },
    },
    yaxis: {
      title: { text: 'Probabilité', style: { fontFamily: 'Space Grotesk', fontWeight: 600 } },
      labels: { style: { fontFamily: 'Inter', fontSize: '11px' } },
    },
    tooltip: {
      enabled: true,
      theme: 'dark',
      y: {
        formatter: (val) => `Criticité: ${val}`,
      },
    },
    legend: {
      show: true,
      position: 'bottom',
    },
  };

  const heatmapSeries = [
    { name: '5', data: [5, 10, 15, 20, 25] },
    { name: '4', data: [4, 8, 12, 16, 20] },
    { name: '3', data: [3, 6, 9, 12, 15] },
    { name: '2', data: [2, 4, 6, 8, 10] },
    { name: '1', data: [1, 2, 3, 4, 5] },
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
          <h1 className="text-2xl font-heading font-bold">Risques & Opportunités</h1>
          <p className="text-muted-foreground">
            Point 6.1 - Gestion des risques et opportunités QHSE
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="h-4 w-4" />
            Exporter
          </Button>
          <Button className="ai-button" size="sm">
            <Sparkles className="h-4 w-4" />
            Analyser avec IA
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Nouveau Risque
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Identifier un nouveau risque</DialogTitle>
                <DialogDescription>
                  Renseignez les informations pour ajouter un risque ou opportunité
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="type">Type</Label>
                    <Select defaultValue="risque">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="risque">Risque</SelectItem>
                        <SelectItem value="opportunite">Opportunité</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="processus">Processus</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="production">Production</SelectItem>
                        <SelectItem value="logistique">Logistique</SelectItem>
                        <SelectItem value="rh">RH</SelectItem>
                        <SelectItem value="commercial">Commercial</SelectItem>
                        <SelectItem value="qualite">Qualité</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Décrivez le risque ou l'opportunité..."
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Probabilité (1-5)</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="1-5" />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5].map((v) => (
                          <SelectItem key={v} value={v.toString()}>
                            {v}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Gravité (1-5)</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="1-5" />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5].map((v) => (
                          <SelectItem key={v} value={v.toString()}>
                            {v}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Responsable</Label>
                    <Input placeholder="Nom..." />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Actions de maîtrise</Label>
                  <Textarea
                    placeholder="Actions prévues pour maîtriser ce risque..."
                    rows={2}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Annuler
                </Button>
                <Button onClick={() => setIsDialogOpen(false)}>Enregistrer</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </motion.div>

      {/* Stats Cards */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card-kpi">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <AlertTriangle className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-heading font-bold">{risks.length}</p>
              <p className="text-sm text-muted-foreground">Total identifiés</p>
            </div>
          </div>
        </div>
        <div className="card-kpi">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-2xl font-heading font-bold">
                {risks.filter((r) => r.niveau === 'critique' || r.niveau === 'eleve').length}
              </p>
              <p className="text-sm text-muted-foreground">Critiques/Élevés</p>
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
                {risks.filter((r) => r.statut === 'maitrise').length}
              </p>
              <p className="text-sm text-muted-foreground">Maîtrisés</p>
            </div>
          </div>
        </div>
        <div className="card-kpi">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent/10">
              <TrendingUp className="h-5 w-5 text-accent" />
            </div>
            <div>
              <p className="text-2xl font-heading font-bold">
                {risks.filter((r) => r.type === 'opportunite').length}
              </p>
              <p className="text-sm text-muted-foreground">Opportunités</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Filters & View Toggle */}
      <motion.div variants={itemVariants} className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div className="flex flex-wrap gap-3">
          <Input
            placeholder="Rechercher..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-64"
          />
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous types</SelectItem>
              <SelectItem value="risque">Risques</SelectItem>
              <SelectItem value="opportunite">Opportunités</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterNiveau} onValueChange={setFilterNiveau}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Niveau" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous niveaux</SelectItem>
              <SelectItem value="faible">Faible</SelectItem>
              <SelectItem value="moyen">Moyen</SelectItem>
              <SelectItem value="eleve">Élevé</SelectItem>
              <SelectItem value="critique">Critique</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 bg-muted rounded-lg p-1">
          <Button
            variant={viewMode === 'table' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('table')}
          >
            Tableau
          </Button>
          <Button
            variant={viewMode === 'matrix' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('matrix')}
          >
            Matrice
          </Button>
        </div>
      </motion.div>

      {/* Content */}
      {viewMode === 'table' ? (
        <motion.div variants={itemVariants} className="card-kpi overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="font-semibold">Code</TableHead>
                <TableHead className="font-semibold">Type</TableHead>
                <TableHead className="font-semibold">Processus</TableHead>
                <TableHead className="font-semibold max-w-xs">Description</TableHead>
                <TableHead className="font-semibold text-center">P</TableHead>
                <TableHead className="font-semibold text-center">G</TableHead>
                <TableHead className="font-semibold text-center">C</TableHead>
                <TableHead className="font-semibold">Niveau</TableHead>
                <TableHead className="font-semibold">Statut</TableHead>
                <TableHead className="font-semibold">Responsable</TableHead>
                <TableHead className="font-semibold text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRisks.map((risk) => (
                <TableRow key={risk.id} className="hover:bg-muted/30 transition-colors">
                  <TableCell className="font-mono text-sm">{risk.code}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        risk.type === 'risque'
                          ? 'border-warning/50 text-warning'
                          : 'border-accent/50 text-accent'
                      }
                    >
                      {risk.type === 'risque' ? 'Risque' : 'Opportunité'}
                    </Badge>
                  </TableCell>
                  <TableCell>{risk.processus}</TableCell>
                  <TableCell className="max-w-xs truncate" title={risk.description}>
                    {risk.description}
                  </TableCell>
                  <TableCell className="text-center font-medium">{risk.probabilite}</TableCell>
                  <TableCell className="text-center font-medium">{risk.gravite}</TableCell>
                  <TableCell className="text-center">
                    <span
                      className={cn(
                        'inline-flex items-center justify-center h-7 w-7 rounded-full font-bold text-sm',
                        risk.criticite <= 4 && 'bg-success/20 text-success',
                        risk.criticite > 4 && risk.criticite <= 9 && 'bg-warning/20 text-warning',
                        risk.criticite > 9 && risk.criticite <= 16 && 'bg-destructive/20 text-destructive',
                        risk.criticite > 16 && 'bg-destructive text-destructive-foreground'
                      )}
                    >
                      {risk.criticite}
                    </span>
                  </TableCell>
                  <TableCell>{getNiveauBadge(risk.niveau)}</TableCell>
                  <TableCell>{getStatutBadge(risk.statut)}</TableCell>
                  <TableCell>{risk.responsable}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </motion.div>
      ) : (
        <motion.div variants={itemVariants} className="card-kpi">
          <h3 className="font-heading font-semibold text-lg mb-4">
            Matrice de Criticité (Probabilité × Gravité)
          </h3>
          <Chart
            options={heatmapOptions}
            series={heatmapSeries}
            type="heatmap"
            height={400}
          />
          <div className="mt-4 flex flex-wrap gap-4 justify-center">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 rounded bg-success"></div>
              <span className="text-sm">Faible (1-4)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 rounded bg-warning"></div>
              <span className="text-sm">Moyen (5-9)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 rounded bg-risk-high"></div>
              <span className="text-sm">Élevé (10-16)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 rounded bg-destructive"></div>
              <span className="text-sm">Critique (17-25)</span>
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
};

export default RisquesPage;
