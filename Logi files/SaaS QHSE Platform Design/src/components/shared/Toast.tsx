import { useEffect, useState } from 'react';
import { CheckCircle, AlertTriangle, Info, X as XIcon } from 'lucide-react';

export interface ToastProps {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  duration?: number;
  onClose: (id: string) => void;
}

export default function Toast({ id, type, message, duration = 5000, onClose }: ToastProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      handleClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration]);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => {
      setIsVisible(false);
      onClose(id);
    }, 300);
  };

  if (!isVisible) return null;

  const configs = {
    success: {
      icon: CheckCircle,
      bgColor: 'bg-[#10b981]',
      textColor: 'text-white'
    },
    error: {
      icon: AlertTriangle,
      bgColor: 'bg-[#ef4444]',
      textColor: 'text-white'
    },
    warning: {
      icon: AlertTriangle,
      bgColor: 'bg-[#f59e0b]',
      textColor: 'text-white'
    },
    info: {
      icon: Info,
      bgColor: 'bg-[#6366f1]',
      textColor: 'text-white'
    }
  };

  const config = configs[type];
  const Icon = config.icon;

  return (
    <div
      className={`
        flex items-center gap-3 min-w-[300px] max-w-md px-4 py-3 rounded-xl shadow-xl
        ${config.bgColor} ${config.textColor}
        transition-all duration-300
        ${isExiting ? 'opacity-0 translate-x-full' : 'opacity-100 translate-x-0'}
      `}
    >
      <Icon className="w-5 h-5 flex-shrink-0" />
      <p className="flex-1 text-sm font-medium">{message}</p>
      <button
        onClick={handleClose}
        className="hover:bg-white/20 rounded-lg p-1 transition-colors"
      >
        <XIcon className="w-4 h-4" />
      </button>
    </div>
  );
}

// Toast Container Component
interface ToastContainerProps {
  toasts: ToastProps[];
  onRemove: (id: string) => void;
}

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  return (
    <div className="fixed top-20 right-6 z-[100] space-y-3 pointer-events-none">
      <div className="space-y-3 pointer-events-auto">
        {toasts.map((toast) => (
          <Toast key={toast.id} {...toast} onClose={onRemove} />
        ))}
      </div>
    </div>
  );
}

// Hook to manage toasts
export function useToast() {
  const [toasts, setToasts] = useState<ToastProps[]>([]);

  const addToast = (toast: Omit<ToastProps, 'id' | 'onClose'>) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { ...toast, id, onClose: removeToast }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  return { toasts, addToast, removeToast };
}
