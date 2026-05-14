import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency } from '../lib/utils';

interface InvoiceItem {
  name: string;
  quantity: number;
  price: number;
  returnedQuantity?: number;
}

interface ReturnSlipData {
  invoiceNumber: string;
  date: Date;
  originalSaleDate: Date;
  customerName: string;
  items: InvoiceItem[];
  refundAmount: number;
  paymentMethod: string;
  userName: string;
}

interface InvoiceData {
  invoiceNumber: string;
  date: Date;
  customerName: string;
  customerPhone?: string;
  customerAddress?: string;
  items: InvoiceItem[];
  totalAmount: number;
  receivedAmount?: number;
  change?: number;
  paymentMethod: string;
  userName: string;
}

export const pdfService = {
  generateInvoice(data: InvoiceData) {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;

    // Header - Professional Brand
    doc.setFontSize(24);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.setFont('helvetica', 'bold');
    doc.text('MZ SOFT POS', 20, 25);
    
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.setFont('helvetica', 'bold');
    doc.text('Système de Gestion Commerciale', 20, 31);
    
    doc.setFont('helvetica', 'normal');
    doc.text('Alger centre, Algérie', 20, 38);
    doc.text('Email: contact@mzsoft.dz', 20, 43);

    // Invoice Meta
    doc.setFontSize(16);
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.text('TICKET DE CAISSE', pageWidth - 20, 25, { align: 'right' });
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Réf: ${data.invoiceNumber}`, pageWidth - 20, 32, { align: 'right' });
    doc.text(`Date: ${data.date.toLocaleDateString()}`, pageWidth - 20, 37, { align: 'right' });
    doc.text(`Heure: ${data.date.toLocaleTimeString()}`, pageWidth - 20, 42, { align: 'right' });

    // Separator line
    doc.setDrawColor(200);
    doc.line(20, 50, pageWidth - 20, 50);

    // Info Section
    doc.setFontSize(10);
    doc.setTextColor(80);
    doc.text('PARTENAIRE:', 20, 60);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(data.customerName || 'Client de passage', 20, 66);
    
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text('OPÉRATEUR:', pageWidth - 80, 60);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(data.userName, pageWidth - 80, 66);

    // Table
    const formatValue = (val: number) => formatCurrency(val).replace(/\s/g, ' ').replace(/[^\x00-\x7F]/g, ' ');

    const tableData = data.items.map(item => [
      item.name,
      item.quantity.toString(),
      formatValue(item.price),
      formatValue(item.quantity * item.price)
    ]);

    autoTable(doc, {
      startY: 75,
      head: [['Désignation Article', 'Qté', 'P.U (DA)', 'Montant (DA)']],
      body: tableData,
      theme: 'grid',
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: 255,
        fontSize: 9,
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 'auto', halign: 'left' },
        1: { halign: 'center', cellWidth: 20 },
        2: { halign: 'right', cellWidth: 35 },
        3: { halign: 'right', cellWidth: 40 }
      },
      styles: {
        fontSize: 8,
        cellPadding: 2
      }
    });

    let finalY = (doc as any).lastAutoTable.finalY + 10;

    // Totals Area
    doc.setDrawColor(240);
    doc.setFillColor(250, 250, 250);
    doc.rect(pageWidth - 100, finalY - 5, 80, 40, 'F');

    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL NET À PAYER:', pageWidth - 95, finalY + 2);
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(formatValue(data.totalAmount), pageWidth - 25, finalY + 2, { align: 'right' });

    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.setFont('helvetica', 'normal');
    finalY += 10;
    doc.text('Montant Reçu:', pageWidth - 95, finalY);
    doc.text(formatValue(data.receivedAmount || data.totalAmount), pageWidth - 25, finalY, { align: 'right' });

    if (data.change && data.change > 0) {
      finalY += 8;
      doc.setFont('helvetica', 'bold');
      doc.text('Rendu (Monnaie):', pageWidth - 95, finalY);
      doc.text(formatValue(data.change), pageWidth - 25, finalY, { align: 'right' });
    }

    finalY += 12;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(150);
    doc.text(`Paiement effectué par: ${data.paymentMethod === 'cash' ? 'ESPÈCES' : 'CARTE BANCAIRE'}`, 20, finalY);

    // Footer
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.setFont('helvetica', 'bold');
    doc.text('Merci de votre visite !', pageWidth / 2, 275, { align: 'center' });
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text('Logiciel MZ SOFT v1.2 - Licence Professionnelle', pageWidth / 2, 280, { align: 'center' });

    // Open in new window
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  },

  generateReturnSlip(data: ReturnSlipData) {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;

    // Header - Professional Brand
    doc.setFontSize(24);
    doc.setTextColor(225, 29, 72); // rose-600
    doc.setFont('helvetica', 'bold');
    doc.text('MZ SOFT POS', 20, 25);
    
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.setFont('helvetica', 'bold');
    doc.text('Système de Gestion Commerciale', 20, 31);
    
    doc.setFont('helvetica', 'normal');
    doc.text('Alger centre, Algérie', 20, 38);
    doc.text('Email: contact@mzsoft.dz', 20, 43);

    // Document Meta
    doc.setFontSize(16);
    doc.setTextColor(225, 29, 72);
    doc.setFont('helvetica', 'bold');
    doc.text('BON DE RETOUR', pageWidth - 20, 25, { align: 'right' });
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 41, 59);
    doc.text(`Réf Vente: ${data.invoiceNumber}`, pageWidth - 20, 32, { align: 'right' });
    doc.text(`Vente du: ${data.originalSaleDate.toLocaleDateString()}`, pageWidth - 20, 37, { align: 'right' });
    doc.text(`Date Retour: ${data.date.toLocaleDateString()}`, pageWidth - 20, 42, { align: 'right' });
    doc.text(`Heure: ${data.date.toLocaleTimeString()}`, pageWidth - 20, 47, { align: 'right' });

    // Separator line
    doc.setDrawColor(225, 29, 72);
    doc.line(20, 50, pageWidth - 20, 50);

    // Info Section
    doc.setFontSize(10);
    doc.setTextColor(80);
    doc.text('PATIENT / CLIENT:', 20, 60);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(data.customerName || 'Client de passage', 20, 66);
    
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text('ÉMIS PAR:', pageWidth - 80, 60);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(data.userName, pageWidth - 80, 66);

    // Table
    const formatValue = (val: number) => formatCurrency(val).replace(/\s/g, ' ').replace(/[^\x00-\x7F]/g, ' ');

    const tableData = data.items
      .filter(item => (item.returnedQuantity || 0) > 0)
      .map(item => [
        item.name,
        (item.returnedQuantity || 0).toString(),
        formatValue(item.price),
        formatValue((item.returnedQuantity || 0) * item.price)
      ]);

    autoTable(doc, {
      startY: 75,
      head: [['Désignation Article', 'Qté Retour', 'P.U (DA)', 'Montant Remboursé']],
      body: tableData,
      theme: 'grid',
      headStyles: {
        fillColor: [225, 29, 72],
        textColor: 255,
        fontSize: 9,
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 'auto', halign: 'left' },
        1: { halign: 'center', cellWidth: 30 },
        2: { halign: 'right', cellWidth: 35 },
        3: { halign: 'right', cellWidth: 40 }
      },
      styles: {
        fontSize: 8,
        cellPadding: 2
      }
    });

    let finalY = (doc as any).lastAutoTable.finalY + 10;

    // Totals Area
    doc.setDrawColor(240);
    doc.setFillColor(254, 242, 242); // rose-50
    doc.rect(pageWidth - 100, finalY - 5, 80, 25, 'F');

    doc.setFontSize(10);
    doc.setTextColor(225, 29, 72);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL REMBOURSÉ:', pageWidth - 95, finalY + 5);
    doc.setFontSize(12);
    doc.text(formatValue(data.refundAmount), pageWidth - 25, finalY + 5, { align: 'right' });

    finalY += 15;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(100);
    doc.text(`Justification: Retour d'articles sur la vente ${data.invoiceNumber}`, 20, finalY);

    // Footer
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.setFont('helvetica', 'bold');
    doc.text('Bon de retour officiel - MZ SOFT', pageWidth / 2, 275, { align: 'center' });
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(`Document généré le ${new Date().toLocaleString()}`, pageWidth / 2, 280, { align: 'center' });

    // Open in new window
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  }
};
