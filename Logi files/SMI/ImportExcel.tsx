import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  FileSpreadsheet,
  Users,
  CheckCircle,
  AlertCircle,
  Download,
  X,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

interface ImportResult {
  success: number;
  errors: { row: number; message: string }[];
  data: Array<{
    nom: string;
    prenom: string;
    email: string;
    role: string;
    status: 'success' | 'error';
    message?: string;
  }>;
}

interface ImportExcelProps {
  onImport?: (results: ImportResult) => void;
  templateUrl?: string;
  className?: string;
  type?: 'users' | 'risks' | 'actions';
}

export const ImportExcel: React.FC<ImportExcelProps> = ({
  onImport,
  templateUrl,
  className,
  type = 'users',
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<ImportResult | null>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const processFile = useCallback(async (file: File) => {
    setIsProcessing(true);
    setResults(null);

    // Simulate processing - In production, this would parse the Excel file
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Mock results
    const mockResults: ImportResult = {
      success: 3,
      errors: [
        { row: 4, message: 'Email invalide' },
        { row: 7, message: 'Rôle non reconnu' },
      ],
      data: [
        {
          nom: 'Martin',
          prenom: 'Pierre',
          email: 'pierre.martin@example.com',
          role: 'Collaborateur',
          status: 'success',
        },
        {
          nom: 'Leroy',
          prenom: 'Marie',
          email: 'marie.leroy@example.com',
          role: 'RQ',
          status: 'success',
        },
        {
          nom: 'Bernard',
          prenom: 'Sophie',
          email: 'sophie.bernard@example.com',
          role: 'Collaborateur',
          status: 'success',
        },
        {
          nom: 'Dubois',
          prenom: 'Jean',
          email: 'invalid-email',
          role: 'Admin',
          status: 'error',
          message: 'Email invalide',
        },
        {
          nom: 'Petit',
          prenom: 'Lucas',
          email: 'lucas.petit@example.com',
          role: 'UnknownRole',
          status: 'error',
          message: 'Rôle non reconnu',
        },
      ],
    };

    setResults(mockResults);
    setIsProcessing(false);
    onImport?.(mockResults);
  }, [onImport]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        processFile(e.dataTransfer.files[0]);
      }
    },
    [processFile]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
        processFile(e.target.files[0]);
      }
    },
    [processFile]
  );

  const handleReset = () => {
    setResults(null);
  };

  const typeLabels = {
    users: 'collaborateurs',
    risks: 'risques',
    actions: 'actions',
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-success/10 flex items-center justify-center">
            <FileSpreadsheet className="h-5 w-5 text-success" />
          </div>
          <div>
            <h3 className="font-heading font-semibold">
              Import Excel {typeLabels[type]}
            </h3>
            <p className="text-sm text-muted-foreground">
              Importez massivement depuis un fichier Excel
            </p>
          </div>
        </div>
        {templateUrl && (
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="h-4 w-4" />
            Télécharger le modèle
          </Button>
        )}
      </div>

      {/* Drop Zone */}
      {!results && (
        <motion.div
          initial={false}
          animate={{
            borderColor: dragActive
              ? 'hsl(var(--success))'
              : 'hsl(var(--border))',
            backgroundColor: dragActive
              ? 'hsl(var(--success) / 0.05)'
              : 'transparent',
          }}
          className={cn(
            'relative rounded-xl border-2 border-dashed p-8 text-center transition-colors',
            'hover:border-success/50 hover:bg-success/5'
          )}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleChange}
            className="absolute inset-0 cursor-pointer opacity-0"
            disabled={isProcessing}
          />

          {isProcessing ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-10 w-10 animate-spin text-success" />
              <p className="font-medium">Traitement en cours...</p>
              <p className="text-sm text-muted-foreground">
                Analyse et validation des données
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div
                className={cn(
                  'h-12 w-12 rounded-xl flex items-center justify-center transition-colors',
                  dragActive ? 'bg-success/20' : 'bg-muted'
                )}
              >
                <Upload
                  className={cn(
                    'h-6 w-6 transition-colors',
                    dragActive ? 'text-success' : 'text-muted-foreground'
                  )}
                />
              </div>
              <div>
                <p className="font-medium">
                  Glissez votre fichier Excel ici
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  ou cliquez pour parcourir
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Formats: XLSX, XLS, CSV
              </p>
            </div>
          )}
        </motion.div>
      )}

      {/* Results */}
      <AnimatePresence>
        {results && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            {/* Summary Alerts */}
            <div className="grid grid-cols-2 gap-4">
              <Alert className="border-success/50 bg-success/5">
                <CheckCircle className="h-4 w-4 text-success" />
                <AlertTitle className="text-success">
                  {results.success} importés avec succès
                </AlertTitle>
                <AlertDescription className="text-success/80">
                  Ces {typeLabels[type]} ont été ajoutés
                </AlertDescription>
              </Alert>

              {results.errors.length > 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>{results.errors.length} erreurs</AlertTitle>
                  <AlertDescription>
                    Vérifiez les lignes en erreur
                  </AlertDescription>
                </Alert>
              )}
            </div>

            {/* Results Table */}
            <div className="rounded-xl border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Statut</TableHead>
                    <TableHead>Nom</TableHead>
                    <TableHead>Prénom</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Rôle</TableHead>
                    <TableHead>Message</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.data.map((row, index) => (
                    <TableRow
                      key={index}
                      className={cn(
                        row.status === 'error' && 'bg-destructive/5'
                      )}
                    >
                      <TableCell>
                        {row.status === 'success' ? (
                          <CheckCircle className="h-4 w-4 text-success" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-destructive" />
                        )}
                      </TableCell>
                      <TableCell>{row.nom}</TableCell>
                      <TableCell>{row.prenom}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {row.email}
                      </TableCell>
                      <TableCell>{row.role}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.message || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={handleReset} className="gap-2">
                <X className="h-4 w-4" />
                Nouvel import
              </Button>
              <Button className="gap-2">
                <Users className="h-4 w-4" />
                Confirmer l'import
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ImportExcel;
