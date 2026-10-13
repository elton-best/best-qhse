import React, { useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { motion } from 'framer-motion';
import { Eraser, Check, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SignaturePadProps {
  onSave?: (signature: string) => void;
  onClear?: () => void;
  width?: number;
  height?: number;
  className?: string;
  label?: string;
  required?: boolean;
}

export const SignaturePad: React.FC<SignaturePadProps> = ({
  onSave,
  onClear,
  width = 400,
  height = 200,
  className,
  label = 'Signature',
  required = false,
}) => {
  const sigRef = useRef<SignatureCanvas>(null);
  const [isEmpty, setIsEmpty] = useState(true);

  const handleClear = () => {
    sigRef.current?.clear();
    setIsEmpty(true);
    onClear?.();
  };

  const handleSave = () => {
    if (sigRef.current && !sigRef.current.isEmpty()) {
      const dataUrl = sigRef.current.toDataURL('image/png');
      onSave?.(dataUrl);
    }
  };

  const handleEnd = () => {
    if (sigRef.current) {
      setIsEmpty(sigRef.current.isEmpty());
    }
  };

  return (
    <div className={cn('space-y-2', className)}>
      {label && (
        <label className="text-sm font-medium text-foreground">
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </label>
      )}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative"
      >
        <div className="rounded-xl border-2 border-dashed border-border bg-card p-2 transition-colors hover:border-accent/50">
          <SignatureCanvas
            ref={sigRef}
            canvasProps={{
              width,
              height,
              className: 'rounded-lg bg-background cursor-crosshair',
            }}
            penColor="hsl(var(--foreground))"
            onEnd={handleEnd}
          />
          
          {/* Placeholder text when empty */}
          {isEmpty && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <p className="text-sm text-muted-foreground">
                Signez ici avec la souris ou le doigt
              </p>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 mt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClear}
            className="gap-1.5"
          >
            <RotateCcw className="h-4 w-4" />
            Effacer
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={isEmpty}
            className="gap-1.5"
          >
            <Check className="h-4 w-4" />
            Valider
          </Button>
        </div>
      </motion.div>
    </div>
  );
};

export default SignaturePad;
