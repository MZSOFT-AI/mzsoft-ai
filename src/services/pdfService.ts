import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency } from '../lib/utils';
import { CompanySettings } from '../types';

let companySettings: CompanySettings | null = null;

export const setPdfSettings = (settings: CompanySettings) => {
  companySettings = settings;
};

interface InvoiceItem {
  name: string;
  quantity: number;
  price: number;
  total?: number;
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
  customerEmail?: string;
  customerNIF?: string;
  customerRC?: string;
  customerAI?: string;
  items: InvoiceItem[];
  subtotal?: number;
  taxAmount?: number;
  taxRate?: number;
  discount?: number;
  totalAmount: number;
  receivedAmount?: number;
  change?: number;
  paymentMethod: string;
  userName: string;
  dueDate?: Date;
  notes?: string;
}

interface QuoteData {
  quoteNumber: string;
  date: Date;
  expiryDate?: Date;
  customerName: string;
  customerPhone?: string;
  customerAddress?: string;
  customerEmail?: string;
  customerNIF?: string;
  customerRC?: string;
  customerAI?: string;
  items: InvoiceItem[];
  subtotal: number;
  taxAmount: number;
  taxRate: number;
  discount: number;
  totalAmount: number;
  userName: string;
  notes?: string;
}

export const pdfService = {
  generateInvoice(data: InvoiceData) {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const formatValue = (val: number) => formatCurrency(val).replace(/\s/g, ' ');

    // --- Header Supplier ---
    doc.setFontSize(22);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.setFont('helvetica', 'bold');
    doc.text(companySettings?.name || 'VOTRE ENTREPRISE', 20, 25);
    
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.setFont('helvetica', 'normal');
    doc.text(companySettings?.slogan || '', 20, 31);

    // --- Document Title (Big bold FACTURE on the right) ---
    doc.setFontSize(48);
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.text('FACTURE', pageWidth - 20, 35, { align: 'right' });
    
    // --- Dates and Numbers Area ---
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text(`DATE : ${data.date.toLocaleDateString()}`, 20, 50);
    if (data.dueDate) {
        doc.text(`ÉCHÉANCE : ${data.dueDate.toLocaleDateString()}`, 20, 54);
    }
    
    doc.text(`FACTURE N° : ${data.invoiceNumber}`, pageWidth - 20, 50, { align: 'right' });

    // Separator line
    doc.setLineWidth(0.5);
    doc.setDrawColor(15, 23, 42);
    doc.line(20, 55, pageWidth - 20, 55);

    // --- Parties: Emetteur & Destinataire ---
    const columnWidth = (pageWidth - 40) / 2;
    const detailsY = 65;

    // LEFT: EMETTEUR
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text('ÉMETTEUR :', 20, detailsY);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(companySettings?.name || '', 20, detailsY + 7);
    
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    let supplierY = detailsY + 12;
    if (companySettings?.phone) { doc.text(`Tél: ${companySettings.phone}`, 20, supplierY); supplierY += 5; }
    if (companySettings?.email) { doc.text(`${companySettings.email}`, 20, supplierY); supplierY += 5; }
    if (companySettings?.address) { doc.text(companySettings.address, 20, supplierY, { maxWidth: columnWidth }); }
    
    // Official IDs Supplier
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(150);
    const idY = detailsY + 30;
    doc.text(`NIF: ${companySettings?.nif || '/'}  RC: ${companySettings?.rc || '/'}`, 20, idY);
    doc.text(`AI: ${companySettings?.ai || '/'}  NIS: ${companySettings?.nis || '/'}`, 20, idY + 4);

    // RIGHT: DESTINATAIRE
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text('DESTINATAIRE :', pageWidth - 20, detailsY, { align: 'right' });
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(data.customerName || 'CLIENT DE PASSAGE', pageWidth - 20, detailsY + 7, { align: 'right' });
    
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    let customerY = detailsY + 12;
    if (data.customerEmail) { doc.text(data.customerEmail, pageWidth - 20, customerY, { align: 'right' }); customerY += 5; }
    if (data.customerPhone) { doc.text(`Tél: ${data.customerPhone}`, pageWidth - 20, customerY, { align: 'right' }); customerY += 5; }
    if (data.customerAddress) { 
        const splitAddress = doc.splitTextToSize(data.customerAddress, columnWidth);
        doc.text(splitAddress, pageWidth - 20, customerY, { align: 'right' }); 
        customerY += (splitAddress.length * 5);
    }

    // Client IDs
    if (data.customerNIF || data.customerRC || data.customerAI) {
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(150);
        doc.text(`${data.customerNIF ? `NIF: ${data.customerNIF}` : ''} ${data.customerRC ? `RC: ${data.customerRC}` : ''}`, pageWidth - 20, idY, { align: 'right' });
        doc.text(`${data.customerAI ? `AI: ${data.customerAI}` : ''}`, pageWidth - 20, idY + 4, { align: 'right' });
    }

    // --- Table ---
    const tableData = data.items.map(item => [
      item.name,
      item.quantity.toString(),
      formatValue(item.price),
      formatValue(item.total || (item.quantity * item.price))
    ]);

    autoTable(doc, {
      startY: detailsY + 45,
      head: [[
        'DESCRIPTION', 
        'QUANTITÉ', 
        `P.U (${companySettings?.currencySymbol || 'DA'})`, 
        `TOTAL (${companySettings?.currencySymbol || 'DA'})`
      ]],
      body: tableData,
      theme: 'grid',
      headStyles: { 
          fillColor: [255, 255, 255], 
          textColor: [15, 23, 42], 
          fontSize: 8, 
          fontStyle: 'bold',
          lineWidth: 0.1,
          lineColor: [200, 200, 200]
      },
      styles: { fontSize: 8, cellPadding: 4, lineColor: [230, 230, 230] },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { halign: 'center', cellWidth: 25 },
        2: { halign: 'right', cellWidth: 40 },
        3: { halign: 'right', cellWidth: 45 }
      }
    });

    let finalY = (doc as any).lastAutoTable.finalY + 10;

    // --- Summary Area ---
    doc.setDrawColor(240);
    doc.setFillColor(252, 252, 253);
    doc.rect(pageWidth - 95, finalY - 5, 75, 45, 'F');

    doc.setFontSize(8);
    doc.setTextColor(100);
    
    doc.text('Sous-total HT:', pageWidth - 90, finalY + 2);
    doc.text(formatValue(data.subtotal || 0), pageWidth - 25, finalY + 2, { align: 'right' });
    finalY += 7;

    if (data.discount && data.discount > 0) {
      doc.text('Remise:', pageWidth - 90, finalY + 2);
      doc.text(`-${formatValue(data.discount)}`, pageWidth - 25, finalY + 2, { align: 'right' });
      finalY += 7;
    }

    if (data.taxAmount && data.taxAmount > 0) {
      doc.text(`TVA (${(data.taxRate || 0) * 100}%):`, pageWidth - 90, finalY + 2);
      doc.text(formatValue(data.taxAmount), pageWidth - 25, finalY + 2, { align: 'right' });
      finalY += 7;
    }

    doc.setFontSize(10);
    doc.setTextColor(30, 64, 175);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL TTC:', pageWidth - 90, finalY + 5);
    doc.setFontSize(12);
    doc.text(formatValue(data.totalAmount), pageWidth - 25, finalY + 5, { align: 'right' });
    finalY += 10;

    // Optional: Payment Status on Invoice
    if (data.receivedAmount !== undefined || (data.totalAmount - (data.change || 0)) > 0) {
        doc.setFontSize(8);
        doc.setTextColor(15, 23, 42);
        doc.setFont('helvetica', 'bold');
        
        const amountPaid = data.receivedAmount !== undefined ? (data.receivedAmount - (data.change || 0)) : data.totalAmount;
        const balance = data.totalAmount - amountPaid;

        doc.text('Montant Versé:', pageWidth - 90, finalY);
        doc.text(formatValue(amountPaid), pageWidth - 25, finalY, { align: 'right' });
        finalY += 5;

        if (balance > 0) {
            doc.setTextColor(225, 29, 72); // rose-600 for debt
            doc.text('Reste à Payer:', pageWidth - 90, finalY);
            doc.text(formatValue(balance), pageWidth - 25, finalY, { align: 'right' });
            finalY += 5;
        }
    }

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.setFont('helvetica', 'italic');
    doc.text(`Arrêtée la présente facture à la somme de: ${data.totalAmount.toLocaleString('fr-FR')} ${companySettings?.currency || 'Dinars Algériens'}`, 20, finalY + 25);

    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.setFont('helvetica', 'bold');
    doc.text(companySettings?.footerText || 'Merci de votre confiance !', pageWidth / 2, 280, { align: 'center' });

    // Open
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  },

  generateQuote(data: QuoteData) {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const formatValue = (val: number) => formatCurrency(val).replace(/\s/g, ' ');

    // Header Supplier
    doc.setFontSize(20);
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.text(companySettings?.name || 'ENTREPRISE', 20, 25);
    
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(companySettings?.address || 'Alger, Algérie', 20, 31);
    doc.text(`Tél: ${companySettings?.phone || '/'}`, 20, 35);

    // Official Meta
    doc.setFontSize(22);
    doc.setTextColor(22, 163, 74); // emerald-600
    doc.text('DEVIS', pageWidth - 20, 25, { align: 'right' });
    
    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59);
    doc.text(`Devis N°: ${data.quoteNumber}`, pageWidth - 20, 32, { align: 'right' });
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Date: ${data.date.toLocaleDateString()}`, pageWidth - 20, 37, { align: 'right' });

    doc.setDrawColor(220);
    doc.line(20, 50, pageWidth - 20, 50);

    // Info Section
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text('PARTENAIRE:', 20, 60);
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text(data.customerName || 'Client', 20, 66);
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    if (data.customerAddress) doc.text(data.customerAddress, 20, 71, { maxWidth: 80 });

    // Table
    const tableData = data.items.map(item => [
      item.name,
      item.quantity.toString(),
      formatValue(item.price),
      formatValue(item.total || (item.quantity * item.price))
    ]);

    autoTable(doc, {
      startY: 85,
      head: [['Description', 'Qté', 'P.U (DA)', 'Total (DA)']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [22, 163, 74] }
    });

    let finalY = (doc as any).lastAutoTable.finalY + 10;

    // Summary
    doc.setFontSize(10);
    doc.setTextColor(22, 163, 74);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL ESTIMÉ:', pageWidth - 90, finalY);
    doc.setFontSize(12);
    doc.text(formatValue(data.totalAmount), pageWidth - 25, finalY, { align: 'right' });

    // Open
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
    doc.text(companySettings?.name || 'MZ SOFT POS', 20, 25);
    
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.setFont('helvetica', 'bold');
    doc.text(companySettings?.slogan || 'Système de Gestion Commerciale', 20, 31);
    
    doc.setFont('helvetica', 'normal');
    doc.text(companySettings?.address || 'Alger centre, Algérie', 20, 38);
    doc.text(`Email: ${companySettings?.email || 'contact@mzsoft.dz'}`, 20, 43);

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
    const formatValue = (val: number) => formatCurrency(val).replace(/\s/g, ' ');

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
      head: [[
        'Désignation Article', 
        'Qté Retour', 
        `P.U (${companySettings?.currencySymbol || 'DA'})`, 
        `Montant (${companySettings?.currencySymbol || 'DA'})`
      ]],
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
        1: { halign: 'center', cellWidth: 25 },
        2: { halign: 'right', cellWidth: 40 },
        3: { halign: 'right', cellWidth: 45 }
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
    doc.text(companySettings?.footerText || 'Bon de retour officiel', pageWidth / 2, 275, { align: 'center' });
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(`${companySettings?.name || 'MZ SOFT'} - Document Officiel`, pageWidth / 2, 280, { align: 'center' });

    // Open in new window
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  }
};
