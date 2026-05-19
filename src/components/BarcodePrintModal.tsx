import React, { useState, useEffect } from 'react';
import Modal from './ui/Modal';
import { Button } from './ui/Button';
import { barcodeService, BarcodePrintOptions } from '../services/barcodeService';
import { Printer, Download, Image as ImageIcon, Settings2, RefreshCw } from 'lucide-react';
import { Product } from '../types';
import { formatCurrency } from '../lib/utils';
import { toast } from 'react-hot-toast';

interface BarcodePrintModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
}

const BarcodePrintModal: React.FC<BarcodePrintModalProps> = ({ product, isOpen, onClose }) => {
  const [options, setOptions] = useState<BarcodePrintOptions>({
    quantity: 1,
    labelWidth: 50,
    labelHeight: 30,
    showText: true,
    fontSize: 14,
    format: 'CODE128'
  });

  const [previewUrl, setPreviewUrl] = useState<string>('');

  useEffect(() => {
    if (product?.barcode && isOpen) {
      try {
        const url = barcodeService.generateBarcodeDataUrl(product.barcode as string, options);
        setPreviewUrl(url);
      } catch (err: any) {
        toast.error(err.message || "Erreur de génération");
      }
    }
  }, [product, options, isOpen]);

  if (!product) return null;

  const handlePrint = () => {
    try {
      barcodeService.printDirect(product as any, options);
      toast.success('Impression lancée');
    } catch (err: any) {
      toast.error('Erreur d\'impression: ' + err.message);
    }
  };

  const handleDownloadPDF = () => {
    try {
      const doc = barcodeService.generatePDF(product as any, options);
      doc.save(`barcode_${product.barcode}.pdf`);
      toast.success('PDF téléchargé');
    } catch (err: any) {
      toast.error('Erreur PDF: ' + err.message);
    }
  };

  const handleDownloadImage = () => {
    if (!previewUrl) return;
    const link = document.createElement('a');
    link.href = previewUrl;
    link.download = `barcode_${product.barcode}.png`;
    link.click();
    toast.success('Image téléchargée');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Impression de Code-Barres"
      size="lg"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Preview Section */}
        <div className="space-y-4">
          <label className="block text-xs font-black uppercase tracking-widest text-slate-400">Aperçu du Label</label>
          <div className="aspect-[3/2] bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center p-6 relative overflow-hidden">
            <div className="bg-white p-4 shadow-xl border border-slate-100 rounded-lg flex flex-col items-center text-center">
              <p className="text-[10px] font-bold text-slate-500 mb-1 truncate w-40">{product.name}</p>
              {previewUrl ? (
                <img src={previewUrl} alt="Barcode Preview" className="max-w-full h-auto" />
              ) : (
                <div className="h-16 flex items-center text-slate-300">Génération...</div>
              )}
              <p className="text-sm font-black text-slate-800 mt-2">{formatCurrency(product.sellingPrice)}</p>
            </div>
            
            <div className="absolute top-2 right-2 flex gap-1">
               <span className="px-2 py-0.5 bg-slate-200 text-[8px] font-bold rounded uppercase">{options.labelWidth}x{options.labelHeight}mm</span>
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 text-[10px] h-9" onClick={handleDownloadImage}>
              <ImageIcon size={14} className="mr-2" /> PNG
            </Button>
            <Button variant="outline" className="flex-1 text-[10px] h-9" onClick={handleDownloadPDF}>
              <Download size={14} className="mr-2" /> PDF
            </Button>
          </div>
        </div>

        {/* Settings Section */}
        <div className="space-y-6">
          <div className="space-y-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
            <div className="flex items-center gap-2 text-slate-800 font-black text-xs uppercase">
              <Settings2 size={16} /> Configuration
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Nombre de copies</label>
                <input 
                  type="number" 
                  min="1" 
                  max="100"
                  value={options.quantity}
                  onChange={(e) => setOptions({...options, quantity: parseInt(e.target.value) || 1})}
                  className="w-full p-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Format</label>
                <select 
                  value={options.format}
                  onChange={(e) => setOptions({...options, format: e.target.value})}
                  className="w-full p-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-xs"
                >
                  <option value="CODE128">CODE 128</option>
                  <option value="EAN13">EAN 13</option>
                  <option value="EAN8">EAN 8</option>
                  <option value="UPC">UPC</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Largeur (mm)</label>
                <input 
                  type="number" 
                  value={options.labelWidth}
                  onChange={(e) => setOptions({...options, labelWidth: parseInt(e.target.value) || 1})}
                  className="w-full p-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Hauteur (mm)</label>
                <input 
                  type="number" 
                  value={options.labelHeight}
                  onChange={(e) => setOptions({...options, labelHeight: parseInt(e.target.value) || 1})}
                  className="w-full p-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
               <input 
                type="checkbox" 
                id="showText"
                checked={options.showText}
                onChange={(e) => setOptions({...options, showText: e.target.checked})}
                className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
               />
               <label htmlFor="showText" className="text-xs font-bold text-slate-600 cursor-pointer">Afficher le code en texte</label>
            </div>
          </div>

          <Button size="lg" className="w-full bg-slate-900 hover:bg-slate-800 h-14 uppercase font-black tracking-widest text-sm" onClick={handlePrint}>
            <Printer size={20} className="mr-2" /> Imprimer Directement
          </Button>
          
          <p className="text-[10px] text-slate-400 italic text-center">
            Note: Vérifiez les marges de votre imprimante thermique dans les paramètres d'impression système.
          </p>
        </div>
      </div>
    </Modal>
  );
};

export default BarcodePrintModal;
