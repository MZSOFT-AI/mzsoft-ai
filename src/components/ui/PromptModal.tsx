import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import { Button } from './Button';
import { HelpCircle } from 'lucide-react';

interface PromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (value: string) => void;
  title: string;
  message: string;
  defaultValue?: string;
  inputPlaceholder?: string;
  inputType?: string;
  confirmText?: string;
  isLoading?: boolean;
}

const PromptModal: React.FC<PromptModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  defaultValue = '',
  inputPlaceholder = 'Saisir ici...',
  inputType = 'text',
  confirmText = 'Valider',
  isLoading = false
}) => {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    if (isOpen) setValue(defaultValue);
  }, [isOpen, defaultValue]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(value);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center text-blue-500">
            <HelpCircle size={20} />
          </div>
          <div>
            <h3 className="font-black text-slate-800 uppercase tracking-tight">{title}</h3>
            <p className="text-xs text-slate-500">{message}</p>
          </div>
        </div>

        <input
          autoFocus
          type={inputType}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={inputPlaceholder}
          className="w-full h-12 px-4 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:border-blue-500 focus:outline-none transition-colors"
        />

        <div className="flex gap-3 pt-2">
          <Button variant="outline" type="button" className="flex-1" onClick={onClose} disabled={isLoading}>
            Annuler
          </Button>
          <Button 
            type="submit"
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold uppercase tracking-widest text-xs h-10" 
            isLoading={isLoading}
          >
            {confirmText}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default PromptModal;
