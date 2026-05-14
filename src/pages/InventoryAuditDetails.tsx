import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { dbService } from '../firebase/db';
import { db } from '../firebase/config';
import { doc, onSnapshot, updateDoc, serverTimestamp, arrayUnion, query, collection, orderBy, getDocs } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../firebase/errorHandler';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { 
  ArrowLeft, 
  Search, 
  CheckCircle2, 
  AlertTriangle, 
  Package, 
  Save, 
  Check,
  X,
  History,
  Barcode,
  RefreshCw,
  Box,
  LayoutGrid,
  User,
  Clock
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn, formatCurrency } from '../lib/utils';
import { useNotification } from '../context/NotificationContext';
import { useCollection } from '../hooks/useCollection';
import { Product, Category } from '../types';

interface AuditItem {
  productId: string;
  productName: string;
  theoreticalStock: number;
  actualStock: number;
  unit: string;
  purchasePrice: number;
  isCounted: boolean;
  notes?: string;
}

const InventoryAuditDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const { showToast } = useNotification();
  
  const [audit, setAudit] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [filterMode, setFilterMode] = useState<'all' | 'counted' | 'uncounted' | 'discrepancy'>('all');
  const [isFinishing, setIsFinishing] = useState(false);

  const { data: products } = useCollection<Product>('products', [orderBy('name')]);
  const { data: categories } = useCollection<Category>('categories', [orderBy('name')]);

  const [auditItems, setAuditItems] = useState<AuditItem[]>([]);

  useEffect(() => {
    if (!id) return;

    const unsubscribe = onSnapshot(
      doc(db, 'inventory_audits', id),
      (snapshot) => {
        if (snapshot.exists()) {
          const data = { id: snapshot.id, ...snapshot.data() } as any;
          setAudit(data);
          if (data?.items) {
             setAuditItems(data.items);
          }
        }
        setLoading(false);
      },
      (error) => handleFirestoreError(error, OperationType.GET, `inventory_audits/${id}`)
    );

    return () => unsubscribe();
  }, [id]);

  const handleUpdateItem = (productId: string, actualStock: number) => {
    setAuditItems(prev => prev.map(item => 
      item.productId === productId 
        ? { ...item, actualStock, isCounted: true } 
        : item
    ));
  };

  const handleSaveDraft = async () => {
    if (!id) return;
    try {
      setLoading(true);
      await updateDoc(doc(db, 'inventory_audits', id), {
        items: auditItems,
        updatedAt: serverTimestamp()
      });
      showToast("Brouillon enregistré", "success");
    } catch (error) {
      console.error("Error saving draft:", error);
      showToast("Erreur lors de l'enregistrement", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteAudit = async () => {
    if (!id || !audit) return;
    
    const uncounted = auditItems.filter(i => !i.isCounted).length;
    if (uncounted > 0) {
      if (!window.confirm(`${uncounted} produits ne sont pas encore comptés. Voulez-vous terminer l'inventaire ? (Les produits non comptés seront considérés comme ayant le stock actuel)`)) {
        return;
      }
    } else if (!window.confirm("Voulez-vous clôturer cet inventaire ? Les stocks seront mis à jour en fonction des écarts constatés.")) {
      return;
    }

    setIsFinishing(true);
    try {
      // Calculate total discrepancy value
      const totalDiscrepancyValue = auditItems.reduce((acc, item) => {
        const diff = item.actualStock - item.theoreticalStock;
        return acc + (diff * item.purchasePrice);
      }, 0);

      // 1. Update products stock and create movements for discrepancies
      const batchWrites = auditItems.filter(item => item.actualStock !== item.theoreticalStock);
      
      for (const item of batchWrites) {
        const diff = item.actualStock - item.theoreticalStock;
        
        // Update product
        await dbService.updateDocument('products', item.productId, {
          stockQuantity: item.actualStock,
          updatedAt: new Date()
        });

        // Add movement
        await dbService.addDocument('stock_movements', {
          productId: item.productId,
          productName: item.productName,
          type: diff > 0 ? 'adjustment_in' : 'adjustment_out',
          quantity: Math.abs(diff),
          previousStock: item.theoreticalStock,
          newStock: item.actualStock,
          reason: `Inventaire ${audit.type} (#${id.substring(0, 5)})`,
          createdAt: new Date(),
          userId: user?.uid,
          userName: user?.displayName || 'Admin'
        });
      }

      // 2. Mark audit as completed
      await updateDoc(doc(db, 'inventory_audits', id), {
        status: 'completed',
        items: auditItems,
        totalDiscrepancyValue,
        completedAt: serverTimestamp()
      });

      showToast("Inventaire clôturé avec succès. Stocks mis à jour.", "success");
      navigate('/inventory/audits');
    } catch (error) {
      console.error("Error completing audit:", error);
      showToast("Erreur lors de la clôture de l'inventaire", "error");
    } finally {
      setIsFinishing(false);
    }
  };

  const filteredItems = useMemo(() => {
    return auditItems.filter(item => {
      const product = products.find(p => p.id === item.productId);
      const matchesSearch = item.productName.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'all' || (product && product.categoryId === selectedCategory);
      
      let matchesFilter = true;
      if (filterMode === 'counted') matchesFilter = item.isCounted;
      if (filterMode === 'uncounted') matchesFilter = !item.isCounted;
      if (filterMode === 'discrepancy') matchesFilter = item.actualStock !== item.theoreticalStock;

      return matchesSearch && matchesCategory && matchesFilter;
    });
  }, [auditItems, products, searchQuery, selectedCategory, filterMode]);

  const stats = useMemo(() => {
    const total = auditItems.length;
    const counted = auditItems.filter(i => i.isCounted).length;
    const discrepancies = auditItems.filter(i => i.actualStock !== i.theoreticalStock).length;
    const totalVal = auditItems.reduce((acc, item) => {
      const diff = item.actualStock - item.theoreticalStock;
      return acc + (diff * item.purchasePrice);
    }, 0);

    return { total, counted, discrepancies, totalVal };
  }, [auditItems]);

  if (loading) return <div className="p-8 text-center">Chargement de l'inventaire...</div>;
  if (!audit) return <div className="p-8 text-center text-rose-500 font-bold">Inventaire non trouvé.</div>;

  const isCompleted = audit.status === 'completed';

  return (
    <div className="space-y-6">
       {/* Header */}
       <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-white border border-slate-200">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => navigate('/inventory/audits')}
            className="h-10 w-10 p-0 rounded-full hover:bg-slate-100"
          >
            <ArrowLeft className="text-slate-400" size={20} />
          </Button>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className={cn(
                "w-8 h-8 flex items-center justify-center text-white font-black text-xs",
                audit.type === 'annual' ? "bg-slate-900" : "bg-indigo-600"
              )}>INV</div>
              <h1 className="text-xl font-black uppercase tracking-tighter text-slate-800">
                Inventaire {audit.type === 'annual' ? 'Annuel' : audit.type === 'monthly' ? 'Mensuel' : 'Hebdomadaire'}
              </h1>
            </div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <User size={10} /> Par {audit.userName} • {format(audit.createdAt.toDate(), 'dd/MM/yyyy HH:mm')}
            </p>
          </div>
        </div>

        {!isCompleted && isAdmin && (
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleSaveDraft}
              className="text-xs h-10 font-black uppercase tracking-widest border-slate-200"
            >
              <Save size={16} className="mr-2" /> Sauvegarder
            </Button>
            <Button 
              size="sm" 
              onClick={handleCompleteAudit}
              disabled={isFinishing}
              className="text-xs h-10 font-black uppercase tracking-widest bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-100"
            >
              <CheckCircle2 size={16} className="mr-2" /> Clôturer
            </Button>
          </div>
        )}
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-slate-200">
          <CardContent className="p-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Progression</p>
            <div className="flex items-end justify-between">
              <span className="text-2xl font-black text-slate-900">{Math.round((stats.counted / stats.total) * 100 || 0)}%</span>
              <span className="text-xs font-bold text-slate-500 uppercase">{stats.counted} / {stats.total}</span>
            </div>
            <div className="w-full h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden">
              <div 
                className="h-full bg-blue-600 transition-all duration-500" 
                style={{ width: `${(stats.counted / stats.total) * 100}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <Card className={cn("border-l-4", stats.discrepancies > 0 ? "border-l-amber-500" : "border-l-slate-200")}>
          <CardContent className="p-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Écarts Constatés</p>
            <div className="flex items-end justify-between">
              <span className={cn("text-2xl font-black", stats.discrepancies > 0 ? "text-amber-600" : "text-slate-900")}>
                {stats.discrepancies}
              </span>
              <span className="text-xs font-bold text-slate-500 uppercase">Produits</span>
            </div>
          </CardContent>
        </Card>

        <Card className={cn("border-l-4 col-span-2", stats.totalVal >= 0 ? "border-l-emerald-500" : "border-l-rose-500")}>
          <CardContent className="p-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Valeur Nette des Écarts</p>
            <div className="flex items-end justify-between">
              <span className={cn("text-2xl font-black", stats.totalVal > 0 ? "text-emerald-600" : stats.totalVal < 0 ? "text-rose-600" : "text-slate-900")}>
                {formatCurrency(stats.totalVal)}
              </span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest italic">Valorisation au PUMP</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters & Search */}
      <div className="bg-white border border-slate-200 p-4 sticky top-[64px] z-30 shadow-sm">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Chercher un produit ou scanner code-barre..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-blue-500 transition-all"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <select 
              value={selectedCategory} 
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-blue-500"
            >
              <option value="all">Toutes catégories</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                onClick={() => setFilterMode('all')}
                className={cn(
                  "px-3 py-1 rounded-lg text-[10px] font-black uppercase transition-all",
                  filterMode === 'all' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                )}
              >
                Tout
              </button>
              <button
                onClick={() => setFilterMode('uncounted')}
                className={cn(
                  "px-3 py-1 rounded-lg text-[10px] font-black uppercase transition-all",
                  filterMode === 'uncounted' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500"
                )}
              >
                À Compter
              </button>
              <button
                onClick={() => setFilterMode('discrepancy')}
                className={cn(
                  "px-3 py-1 rounded-lg text-[10px] font-black uppercase transition-all",
                  filterMode === 'discrepancy' ? "bg-white text-amber-600 shadow-sm" : "text-slate-500"
                )}
              >
                Écarts
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Audit Table */}
      <div className="bg-white border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="dolisoft-table">
            <thead>
              <tr>
                <th>Produit</th>
                <th className="text-center">Théorique</th>
                <th className="text-center">Réel (Compté)</th>
                <th className="text-center">Écart</th>
                <th className="text-right">Valeur Écart</th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => {
                const diff = item.actualStock - item.theoreticalStock;
                const discrepancyVal = diff * item.purchasePrice;
                
                return (
                  <tr key={item.productId} className={cn(
                    "hover:bg-slate-50 transition-colors",
                    !item.isCounted && "bg-blue-50/20"
                  )}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center border",
                          item.isCounted ? "bg-emerald-50 text-emerald-500 border-emerald-100" : "bg-slate-50 text-slate-400 border-slate-200"
                        )}>
                          <Package size={14} />
                        </div>
                        <div>
                          <p className="font-bold text-slate-800 text-sm leading-tight">{item.productName}</p>
                          <p className="text-[10px] text-slate-400 font-mono italic">
                            {products.find(p => p.id === item.productId)?.barcode || 'N/A'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="text-center font-mono text-xs text-slate-500">
                      {item.theoreticalStock} {item.unit}
                    </td>
                    <td className="text-center">
                      <div className="inline-flex items-center gap-2">
                        {isCompleted ? (
                           <span className="font-black text-slate-900 border-b-2 border-slate-100 px-2 min-w-[3rem]">
                             {item.actualStock}
                           </span>
                        ) : (
                          <input 
                            type="number"
                            value={item.actualStock}
                            onChange={(e) => handleUpdateItem(item.productId, Number(e.target.value))}
                            className={cn(
                              "w-20 px-2 py-1 text-center font-black text-sm border-2 rounded-lg outline-none transition-all",
                              item.isCounted 
                                ? "bg-white border-blue-500 text-blue-600 focus:border-blue-600 shadow-sm" 
                                : "bg-slate-50 border-transparent text-slate-400 focus:bg-white focus:border-blue-500"
                            )}
                          />
                        )}
                        <span className="text-[10px] font-bold text-slate-400 uppercase">{item.unit}</span>
                      </div>
                    </td>
                    <td className="text-center">
                      <div className={cn(
                        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-black",
                        diff > 0 ? "bg-emerald-50 text-emerald-600" : 
                        diff < 0 ? "bg-rose-50 text-rose-600" : "bg-slate-100 text-slate-400"
                      )}>
                        {diff > 0 ? `+${diff}` : diff}
                      </div>
                    </td>
                    <td className="text-right">
                      <span className={cn(
                        "font-mono text-[11px] font-bold",
                        discrepancyVal > 0 ? "text-emerald-500" : 
                        discrepancyVal < 0 ? "text-rose-500" : "text-slate-300"
                      )}>
                        {discrepancyVal !== 0 ? formatCurrency(discrepancyVal) : '—'}
                      </span>
                    </td>
                    <td className="text-center">
                      {item.isCounted ? (
                        <div className="w-5 h-5 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                          <Check size={12} />
                        </div>
                      ) : (
                        <div className="w-5 h-5 bg-slate-100 text-slate-300 rounded-full flex items-center justify-center mx-auto">
                          <Clock size={12} />
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-12">
                     <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                       <Search size={24} className="text-slate-200" />
                     </div>
                     <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Aucun produit ne correspond aux filtres</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {auditItems.length > 0 && !isCompleted && (
        <div className="flex justify-center pb-8 pt-4">
           <Button 
             size="lg" 
             onClick={handleCompleteAudit}
             disabled={isFinishing}
             className={cn(
               "h-16 px-12 rounded-2xl font-black uppercase tracking-widest text-sm shadow-2xl transition-all active:scale-95",
               stats.counted === stats.total ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200" : "bg-slate-900 border-2 border-slate-800"
             )}
           >
             {isFinishing ? <RefreshCw className="animate-spin mr-2" size={20} /> : <CheckCircle2 size={24} className="mr-3" />}
             Terminer l'Inventaire {audit.type}
           </Button>
        </div>
      )}

      {/* Tips */}
      {!isCompleted && (
        <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-xl">
           <div className="flex gap-3">
             <AlertTriangle className="text-amber-500 flex-shrink-0" size={18} />
             <div>
               <h4 className="text-xs font-black uppercase text-amber-900 mb-1">Conseil d'audit</h4>
               <p className="text-[11px] leading-relaxed text-amber-800 font-bold italic">
                 "Pensez à utiliser un lecteur de code-barre pour accélérer la saisie. Si vous tapez le stock réel manuellement, le système marquera l'article comme compté automatiquement."
               </p>
             </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default InventoryAuditDetails;
