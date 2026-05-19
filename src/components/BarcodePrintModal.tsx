import React, { useState, useEffect } from 'react';
import Modal from './ui/Modal';
import { Button } from './ui/Button';
import { barcodeService, BarcodePrintOptions } from '../services/barcodeService';
import { Printer, Download, Image as ImageIcon, Settings2, RefreshCw, Plus, X, Search, Package } from 'lucide-react';
import { Product } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { toast } from 'react-hot-toast';

interface BarcodePrintModalProps {
  products: Product[];
  initialProduct: Product | null;
  isOpen: boolean;
  onClose: () => void;
}

interface PrintItem {
  product: Product;
  quantity: number;
}

const BarcodePrintModal: React.FC<BarcodePrintModalProps> = ({ products, initialProduct, isOpen, onClose }) => {
  const [printItems, setPrintItems] = useState<PrintItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [options, setOptions] = useState<BarcodePrintOptions>({
    quantity: 1, // This will now act as a default for new items
    labelWidth: 50,
    labelHeight: 30,
    showText: true,
    fontSize: 14,
    format: 'CODE128'
  });

  const [previewUrl, setPreviewUrl] = useState<string>('');

  useEffect(() => {
    if (initialProduct && isOpen) {
      // Add initial product to queue if not already there
      setPrintItems(prev => {
        if (prev.some(item => item.product.id === initialProduct.id)) return prev;
        return [{ product: initialProduct, quantity: options.quantity }, ...prev];
      });
    }
  }, [initialProduct, isOpen]);

  const activeProduct = printItems[0]?.product || null;

  useEffect(() => {
    if (activeProduct?.barcode && isOpen) {
      try {
        const url = barcodeService.generateBarcodeDataUrl(activeProduct.barcode as string, options);
        setPreviewUrl(url);
      } catch (err: any) {
        toast.error(err.message || "Erreur de génération");
      }
    }
  }, [activeProduct, options, isOpen]);

  const handlePrint = () => {
    if (printItems.length === 0) return;
    try {
      if (printItems.length === 1) {
        barcodeService.printDirect(printItems[0].product as any, { 
          ...options, 
          quantity: printItems[0].quantity 
        });
      } else {
        barcodeService.printBatch(printItems as any, options);
      }
      toast.success('Impression lancée');
    } catch (err: any) {
      toast.error('Erreur d\'impression: ' + err.message);
    }
  };

  const addItem = (product: Product) => {
    if (printItems.some(i => i.product.id === product.id)) {
      toast.error('Déjà dans la liste');
      return;
    }
    setPrintItems([...printItems, { product, quantity: 1 }]);
    setSearchTerm('');
  };

  const removeItem = (id: string) => {
    setPrintItems(printItems.filter(i => i.product.id !== id));
  };

  const updateItemQty = (id: string, qty: number) => {
    setPrintItems(printItems.map(i => i.product.id === id ? { ...i, quantity: Math.max(1, qty) } : i));
  };

  const filteredProducts = searchTerm.length > 1 
    ? products.filter(p => 
        (p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
         p.barcode?.includes(searchTerm)) &&
        !printItems.some(i => i.product.id === p.id)
      ).slice(0, 5)
    : [];

  if (!isOpen) return null;

  const handleDownloadPDF = () => {
    if (printItems.length === 0) return;
    try {
      const doc = printItems.length === 1 
        ? barcodeService.generatePDF(printItems[0].product as any, { ...options, quantity: printItems[0].quantity })
        : barcodeService.generateBatchPDF(printItems as any, options);
        
      const fileName = printItems.length === 1 
        ? `barcode_${printItems[0].product.barcode}.pdf`
        : `barcodes_batch_${Date.now()}.pdf`;
        
      doc.save(fileName);
      toast.success('PDF téléchargé');
    } catch (err: any) {
      toast.error('Erreur PDF: ' + err.message);
    }
  };

  const handleDownloadImage = () => {
    if (!previewUrl || !activeProduct) return;
    const link = document.createElement('a');
    link.href = previewUrl;
    link.download = `barcode_${activeProduct.barcode}.png`;
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
            {activeProduct ? (
              <div className="bg-white p-4 shadow-xl border border-slate-100 rounded-lg flex flex-col items-center text-center">
                <p className="text-[10px] font-bold text-slate-500 mb-1 truncate w-40">{activeProduct.name}</p>
                {previewUrl ? (
                  <img src={previewUrl} alt="Barcode Preview" className="max-w-full h-auto" />
                ) : (
                  <div className="h-16 flex items-center text-slate-300">Génération...</div>
                )}
                <p className="text-sm font-black text-slate-800 mt-2">{formatCurrency(activeProduct.sellingPrice)}</p>
              </div>
            ) : (
              <div className="text-slate-300 text-xs font-bold uppercase">Aucun aperçu</div>
            )}
            
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
          <div className="space-y-4 p-4 bg-slate-50 rounded-2xl border border-slate-100 font-sans">
            <div className="flex items-center gap-2 text-slate-800 font-black text-xs uppercase">
              <Settings2 size={16} /> Configuration Globale
            </div>

            <div className="grid grid-cols-2 gap-4">
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
              <div className="flex items-center gap-3 mt-4">
                <input 
                  type="checkbox" 
                  id="showText"
                  checked={options.showText}
                  onChange={(e) => setOptions({...options, showText: e.target.checked})}
                  className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <label htmlFor="showText" className="text-[10px] font-bold text-slate-600 cursor-pointer uppercase">Afficher Texte</label>
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
          </div>

          <div className="space-y-3">
             <div className="flex items-center justify-between">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Liste d'impression</label>
                <span className="text-[10px] font-bold text-blue-600">{printItems.length} produit(s)</span>
             </div>
             
             <div className="max-h-48 overflow-y-auto space-y-2 pr-2">
                {printItems.map(item => (
                   <div key={item.product.id} className="flex items-center justify-between p-2 bg-white border border-slate-100 rounded-xl group transition-all hover:border-blue-200">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                         <div className="w-8 h-8 bg-slate-50 flex items-center justify-center rounded text-slate-400 group-hover:text-blue-500">
                            <Package size={14} />
                         </div>
                         <div className="truncate">
                            <p className="text-[11px] font-bold text-slate-700 leading-tight truncate">{item.product.name}</p>
                            <p className="text-[9px] text-slate-400 font-mono">{item.product.barcode || item.product.sku}</p>
                         </div>
                      </div>
                      <div className="flex items-center gap-3">
                         <input 
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateItemQty(item.product.id, parseInt(e.target.value) || 1)}
                            className="w-12 h-8 text-center text-xs font-black bg-slate-50 border-none rounded-lg focus:ring-1 focus:ring-blue-500"
                         />
                         <button onClick={() => removeItem(item.product.id)} className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg">
                            <X size={14} />
                         </button>
                      </div>
                   </div>
                ))}
                {printItems.length === 0 && (
                   <div className="py-8 text-center border-2 border-dashed border-slate-100 rounded-2xl">
                      <p className="text-[10px] font-bold text-slate-300 uppercase">Aucun produit sélectionné</p>
                   </div>
                )}
             </div>

             {/* Search to add more products (The requested feature: "ajouter un produit en bas") */}
             <div className="relative pt-2">
                <Search className="absolute left-3 top-[18px] text-slate-400" size={14} />
                <input 
                   type="text"
                   placeholder="Ajouter un produit à imprimer..."
                   value={searchTerm}
                   onChange={(e) => setSearchTerm(e.target.value)}
                   className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-1 focus:ring-blue-500 font-bold"
                />
                
                {filteredProducts.length > 0 && (
                   <div className="absolute bottom-full left-0 right-0 mb-2 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 overflow-hidden divide-y divide-slate-100">
                      {filteredProducts.map(p => (
                         <button 
                            key={p.id}
                            onClick={() => addItem(p)}
                            className="w-full p-2 text-left hover:bg-blue-50 flex items-center justify-between group"
                         >
                            <div className="flex items-center gap-2">
                               <Package size={14} className="text-slate-400 group-hover:text-blue-500" />
                               <span className="text-[11px] font-bold text-slate-700">{p.name}</span>
                            </div>
                            <span className="text-[9px] font-mono text-slate-400">{p.barcode || p.sku}</span>
                         </button>
                      ))}
                   </div>
                )}
             </div>
          </div>

          <div className="flex gap-3">
             <Button 
                size="lg" 
                className="flex-1 bg-slate-900 hover:bg-slate-800 h-14 uppercase font-black tracking-widest text-sm" 
                onClick={handlePrint}
                disabled={printItems.length === 0}
             >
               <Printer size={20} className="mr-2" /> Imprimer
             </Button>
             <Button variant="outline" className="px-6 h-14 font-black uppercase text-[10px]" onClick={() => setPrintItems([])}>
                RAZ
             </Button>
          </div>
          
          <p className="text-[10px] text-slate-400 italic text-center">
            Note: Pour l'impression par lot, un PDF consolidé sera généré.
          </p>
        </div>
      </div>
    </Modal>
  );
};

export default BarcodePrintModal;
