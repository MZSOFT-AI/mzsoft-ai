import React from 'react';
import Modal from './Modal';
import { Button } from './Button';
import { AlertCircle, Trash2, HelpCircle } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
  isLoading?: boolean;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirmer',
  cancelText = 'Annuler',
  variant = 'info',
  isLoading = false
}) => {
  const getIcon = () => {
    switch (variant) {
      case 'danger': return <Trash2 className="text-rose-500" size={32} />;
      case 'warning': return <AlertCircle className="text-amber-500" size={32} />;
      default: return <HelpCircle className="text-blue-500" size={32} />;
    }
  };

  const getButtonClass = () => {
    switch (variant) {
      case 'danger': return 'bg-rose-600 hover:bg-rose-700';
      case 'warning': return 'bg-amber-500 hover:bg-amber-600';
      default: return 'bg-blue-600 hover:bg-blue-700';
    }
  };

  const getBgClass = () => {
    switch (variant) {
      case 'danger': return 'bg-rose-50';
      case 'warning': return 'bg-amber-50';
      default: return 'bg-blue-50';
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <div className="p-4 text-center">
        <div className={`w-16 h-16 ${getBgClass()} rounded-full flex items-center justify-center mx-auto mb-4`}>
          {getIcon()}
        </div>
        <h3 className="text-lg font-black text-slate-800 mb-2">{title}</h3>
        <p className="text-sm text-slate-500 mb-6 leading-relaxed">
          {message}
        </p>
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={isLoading}>
            {cancelText}
          </Button>
          <Button 
            className={`flex-1 text-white font-bold uppercase tracking-widest text-xs h-10 ${getButtonClass()}`} 
            onClick={onConfirm} 
            isLoading={isLoading}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default ConfirmationModal;
