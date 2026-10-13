import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  FileText,
  X,
  CheckCircle,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  status: 'uploading' | 'success' | 'error';
  progress: number;
  error?: string;
}

interface DocumentUploadProps {
  onUpload?: (files: File[]) => void;
  onRemove?: (fileId: string) => void;
  accept?: string;
  maxSize?: number; // in MB
  maxFiles?: number;
  className?: string;
}

export const DocumentUpload: React.FC<DocumentUploadProps> = ({
  onUpload,
  onRemove,
  accept = '.pdf,.docx,.xlsx,.pptx,.doc,.xls,.ppt',
  maxSize = 10,
  maxFiles = 5,
  className,
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [files, setFiles] = useState<UploadedFile[]>([]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const processFiles = useCallback(
    (fileList: FileList) => {
      const newFiles: File[] = [];
      const errors: string[] = [];

      Array.from(fileList).forEach((file) => {
        if (files.length + newFiles.length >= maxFiles) {
          errors.push(`Maximum ${maxFiles} fichiers autorisés`);
          return;
        }

        if (file.size > maxSize * 1024 * 1024) {
          errors.push(`${file.name} dépasse ${maxSize}MB`);
          return;
        }

        newFiles.push(file);
      });

      if (newFiles.length > 0) {
        const uploadedFiles: UploadedFile[] = newFiles.map((file) => ({
          id: Math.random().toString(36).slice(2),
          name: file.name,
          size: file.size,
          type: file.type,
          status: 'uploading' as const,
          progress: 0,
        }));

        setFiles((prev) => [...prev, ...uploadedFiles]);

        // Simulate upload progress
        uploadedFiles.forEach((uploadedFile) => {
          let progress = 0;
          const interval = setInterval(() => {
            progress += Math.random() * 30;
            if (progress >= 100) {
              progress = 100;
              clearInterval(interval);
              setFiles((prev) =>
                prev.map((f) =>
                  f.id === uploadedFile.id
                    ? { ...f, status: 'success' as const, progress: 100 }
                    : f
                )
              );
            } else {
              setFiles((prev) =>
                prev.map((f) =>
                  f.id === uploadedFile.id ? { ...f, progress } : f
                )
              );
            }
          }, 200);
        });

        onUpload?.(newFiles);
      }
    },
    [files.length, maxFiles, maxSize, onUpload]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        processFiles(e.dataTransfer.files);
      }
    },
    [processFiles]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        processFiles(e.target.files);
      }
    },
    [processFiles]
  );

  const handleRemove = useCallback(
    (fileId: string) => {
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
      onRemove?.(fileId);
    },
    [onRemove]
  );

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Drop Zone */}
      <motion.div
        initial={false}
        animate={{
          borderColor: dragActive ? 'hsl(var(--accent))' : 'hsl(var(--border))',
          backgroundColor: dragActive
            ? 'hsl(var(--accent) / 0.05)'
            : 'transparent',
        }}
        className={cn(
          'relative rounded-xl border-2 border-dashed p-8 text-center transition-colors',
          'hover:border-accent/50 hover:bg-accent/5'
        )}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept={accept}
          multiple
          onChange={handleChange}
          className="absolute inset-0 cursor-pointer opacity-0"
        />

        <div className="flex flex-col items-center gap-3">
          <div
            className={cn(
              'h-12 w-12 rounded-xl flex items-center justify-center transition-colors',
              dragActive ? 'bg-accent/20' : 'bg-muted'
            )}
          >
            <Upload
              className={cn(
                'h-6 w-6 transition-colors',
                dragActive ? 'text-accent' : 'text-muted-foreground'
              )}
            />
          </div>
          <div>
            <p className="font-medium">
              Glissez-déposez vos fichiers ici
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              ou cliquez pour parcourir
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Formats: PDF, DOCX, XLSX, PPTX • Max {maxSize}MB • Max {maxFiles}{' '}
            fichiers
          </p>
        </div>
      </motion.div>

      {/* File List */}
      <AnimatePresence>
        {files.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2"
          >
            {files.map((file) => (
              <motion.div
                key={file.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border/50"
              >
                <div className="h-10 w-10 rounded-lg bg-card flex items-center justify-center shrink-0">
                  <FileText className="h-5 w-5 text-accent" />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatFileSize(file.size)}</span>
                    {file.status === 'uploading' && (
                      <span>{Math.round(file.progress)}%</span>
                    )}
                  </div>
                  
                  {/* Progress Bar */}
                  {file.status === 'uploading' && (
                    <div className="mt-2 h-1 w-full rounded-full bg-muted overflow-hidden">
                      <motion.div
                        className="h-full bg-accent"
                        initial={{ width: 0 }}
                        animate={{ width: `${file.progress}%` }}
                        transition={{ duration: 0.2 }}
                      />
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {file.status === 'uploading' && (
                    <Loader2 className="h-4 w-4 animate-spin text-accent" />
                  )}
                  {file.status === 'success' && (
                    <CheckCircle className="h-4 w-4 text-success" />
                  )}
                  {file.status === 'error' && (
                    <AlertCircle className="h-4 w-4 text-destructive" />
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleRemove(file.id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default DocumentUpload;
