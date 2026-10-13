import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  FileText,
  Upload,
  FolderOpen,
  Search,
  Download,
  Eye,
  Edit2,
  Trash2,
  File,
  FileSpreadsheet,
  FileImage,
} from 'lucide-react';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

interface Document {
  id: string;
  code: string;
  titre: string;
  type: 'procedure' | 'enregistrement' | 'formulaire' | 'manuel' | 'instruction';
  niveau: 'strategique' | 'processus' | 'operationnel';
  processus: string;
  version: string;
  statut: 'draft' | 'en_validation' | 'valide' | 'obsolete';
  dateCreation: Date;
  dateValidation?: Date;
  auteur: string;
  format: 'pdf' | 'docx' | 'xlsx' | 'pptx';
}

const mockDocuments: Document[] = [
  {
    id: '1',
    code: 'PRO-QHSE-001',
    titre: 'Manuel Qualité',
    type: 'manuel',
    niveau: 'strategique',
    processus: 'Management',
    version: '3.0',
    statut: 'valide',
    dateCreation: new Date('2024-01-15'),
    dateValidation: new Date('2024-01-20'),
    auteur: 'Jean Dupont',
    format: 'pdf',
  },
  {
    id: '2',
    code: 'PRO-PROD-002',
    titre: 'Procédure Contrôle Réception',
    type: 'procedure',
    niveau: 'processus',
    processus: 'Production',
    version: '2.1',
    statut: 'valide',
    dateCreation: new Date('2024-02-10'),
    dateValidation: new Date('2024-02-15'),
    auteur: 'Pierre Martin',
    format: 'docx',
  },
  {
    id: '3',
    code: 'ENR-SST-001',
    titre: 'Registre Accidents du Travail',
    type: 'enregistrement',
    niveau: 'operationnel',
    processus: 'RH',
    version: '1.0',
    statut: 'en_validation',
    dateCreation: new Date('2024-03-01'),
    auteur: 'Marie Leroy',
    format: 'xlsx',
  },
  {
    id: '4',
    code: 'FOR-AUDIT-001',
    titre: "Check-list Audit Interne",
    type: 'formulaire',
    niveau: 'processus',
    processus: 'Qualité',
    version: '1.2',
    statut: 'valide',
    dateCreation: new Date('2024-01-05'),
    dateValidation: new Date('2024-01-10'),
    auteur: 'Sophie Bernard',
    format: 'docx',
  },
  {
    id: '5',
    code: 'INS-ENV-001',
    titre: 'Instruction Tri Déchets',
    type: 'instruction',
    niveau: 'operationnel',
    processus: 'Environnement',
    version: '1.0',
    statut: 'draft',
    dateCreation: new Date('2024-03-10'),
    auteur: 'Jean Dupont',
    format: 'pdf',
  },
];

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

export const DocumentsPage: React.FC = () => {
  const [documents] = useState<Document[]>(mockDocuments);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatut, setFilterStatut] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const filteredDocuments = documents.filter((doc) => {
    const matchesType = filterType === 'all' || doc.type === filterType;
    const matchesStatut = filterStatut === 'all' || doc.statut === filterStatut;
    const matchesSearch =
      doc.titre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.code.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesType && matchesStatut && matchesSearch;
  });

  const getStatutBadge = (statut: Document['statut']) => {
    const styles = {
      draft: 'status-chip status-draft',
      en_validation: 'status-chip status-pending',
      valide: 'status-chip status-validated',
      obsolete: 'status-chip bg-muted text-muted-foreground',
    };
    const labels = {
      draft: 'Brouillon',
      en_validation: 'En validation',
      valide: 'Validé',
      obsolete: 'Obsolète',
    };
    return <span className={styles[statut]}>{labels[statut]}</span>;
  };

  const getTypeBadge = (type: Document['type']) => {
    const colors: Record<Document['type'], string> = {
      procedure: 'border-accent/50 text-accent',
      enregistrement: 'border-success/50 text-success',
      formulaire: 'border-warning/50 text-warning',
      manuel: 'border-primary/50 text-primary',
      instruction: 'border-iso-improvement/50 text-iso-improvement',
    };
    const labels: Record<Document['type'], string> = {
      procedure: 'Procédure',
      enregistrement: 'Enregistrement',
      formulaire: 'Formulaire',
      manuel: 'Manuel',
      instruction: 'Instruction',
    };
    return (
      <Badge variant="outline" className={cn('font-medium text-xs', colors[type])}>
        {labels[type]}
      </Badge>
    );
  };

  const getFormatIcon = (format: Document['format']) => {
    const icons = {
      pdf: <FileText className="h-5 w-5 text-destructive" />,
      docx: <FileText className="h-5 w-5 text-accent" />,
      xlsx: <FileSpreadsheet className="h-5 w-5 text-success" />,
      pptx: <FileImage className="h-5 w-5 text-warning" />,
    };
    return icons[format] || <File className="h-5 w-5" />;
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      // Handle file upload
      console.log('Files dropped:', e.dataTransfer.files);
    }
  }, []);

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
          <h1 className="text-2xl font-heading font-bold">Gestion Documentaire</h1>
          <p className="text-muted-foreground">
            Point 7.5 - Informations documentées du SMI
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="h-4 w-4" />
            Exporter
          </Button>
          <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Upload className="h-4 w-4" />
                Uploader Document
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Ajouter un document</DialogTitle>
                <DialogDescription>
                  Uploadez un nouveau document et renseignez ses métadonnées
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {/* Drop Zone */}
                <div
                  className={cn(
                    'border-2 border-dashed rounded-xl p-8 text-center transition-colors',
                    dragActive
                      ? 'border-accent bg-accent/5'
                      : 'border-border hover:border-accent/50'
                  )}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                >
                  <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm font-medium">
                    Glissez-déposez vos fichiers ici
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    ou cliquez pour parcourir
                  </p>
                  <input type="file" className="hidden" multiple />
                </div>

                {/* Metadata Form */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Type de document</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="procedure">Procédure</SelectItem>
                        <SelectItem value="enregistrement">Enregistrement</SelectItem>
                        <SelectItem value="formulaire">Formulaire</SelectItem>
                        <SelectItem value="manuel">Manuel</SelectItem>
                        <SelectItem value="instruction">Instruction</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Niveau</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="strategique">Stratégique</SelectItem>
                        <SelectItem value="processus">Processus</SelectItem>
                        <SelectItem value="operationnel">Opérationnel</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Processus</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="management">Management</SelectItem>
                        <SelectItem value="production">Production</SelectItem>
                        <SelectItem value="qualite">Qualité</SelectItem>
                        <SelectItem value="rh">RH</SelectItem>
                        <SelectItem value="environnement">Environnement</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Version</Label>
                    <Input placeholder="1.0" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Titre du document</Label>
                  <Input placeholder="Titre descriptif..." />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsUploadDialogOpen(false)}>
                  Annuler
                </Button>
                <Button onClick={() => setIsUploadDialogOpen(false)}>
                  Enregistrer
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </motion.div>

      {/* Stats */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="card-kpi">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <FolderOpen className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-heading font-bold">{documents.length}</p>
              <p className="text-sm text-muted-foreground">Total</p>
            </div>
          </div>
        </div>
        <div className="card-kpi">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-success/10">
              <FileText className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-2xl font-heading font-bold">
                {documents.filter((d) => d.statut === 'valide').length}
              </p>
              <p className="text-sm text-muted-foreground">Validés</p>
            </div>
          </div>
        </div>
        <div className="card-kpi">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-warning/10">
              <FileText className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-2xl font-heading font-bold">
                {documents.filter((d) => d.statut === 'en_validation').length}
              </p>
              <p className="text-sm text-muted-foreground">En validation</p>
            </div>
          </div>
        </div>
        <div className="card-kpi">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <FileText className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-heading font-bold">
                {documents.filter((d) => d.statut === 'draft').length}
              </p>
              <p className="text-sm text-muted-foreground">Brouillons</p>
            </div>
          </div>
        </div>
        <div className="card-kpi">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent/10">
              <FileText className="h-5 w-5 text-accent" />
            </div>
            <div>
              <p className="text-2xl font-heading font-bold">
                {documents.filter((d) => d.type === 'procedure').length}
              </p>
              <p className="text-sm text-muted-foreground">Procédures</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Filters */}
      <motion.div variants={itemVariants} className="flex flex-wrap gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par titre ou code..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous types</SelectItem>
            <SelectItem value="procedure">Procédure</SelectItem>
            <SelectItem value="enregistrement">Enregistrement</SelectItem>
            <SelectItem value="formulaire">Formulaire</SelectItem>
            <SelectItem value="manuel">Manuel</SelectItem>
            <SelectItem value="instruction">Instruction</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStatut} onValueChange={setFilterStatut}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous statuts</SelectItem>
            <SelectItem value="draft">Brouillon</SelectItem>
            <SelectItem value="en_validation">En validation</SelectItem>
            <SelectItem value="valide">Validé</SelectItem>
            <SelectItem value="obsolete">Obsolète</SelectItem>
          </SelectContent>
        </Select>
      </motion.div>

      {/* Documents Table */}
      <motion.div variants={itemVariants} className="card-kpi overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="font-semibold w-12"></TableHead>
              <TableHead className="font-semibold">Code</TableHead>
              <TableHead className="font-semibold">Titre</TableHead>
              <TableHead className="font-semibold">Type</TableHead>
              <TableHead className="font-semibold">Processus</TableHead>
              <TableHead className="font-semibold">Version</TableHead>
              <TableHead className="font-semibold">Statut</TableHead>
              <TableHead className="font-semibold">Auteur</TableHead>
              <TableHead className="font-semibold text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredDocuments.map((doc) => (
              <TableRow key={doc.id} className="hover:bg-muted/30 transition-colors">
                <TableCell>{getFormatIcon(doc.format)}</TableCell>
                <TableCell className="font-mono text-sm">{doc.code}</TableCell>
                <TableCell className="font-medium">{doc.titre}</TableCell>
                <TableCell>{getTypeBadge(doc.type)}</TableCell>
                <TableCell>{doc.processus}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className="font-mono">
                    v{doc.version}
                  </Badge>
                </TableCell>
                <TableCell>{getStatutBadge(doc.statut)}</TableCell>
                <TableCell className="text-muted-foreground">{doc.auteur}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <Download className="h-4 w-4" />
                    </Button>
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
    </motion.div>
  );
};

export default DocumentsPage;
