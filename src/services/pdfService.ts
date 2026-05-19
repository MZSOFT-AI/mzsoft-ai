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
  customCompanyInfo?: string;
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
  customCompanyInfo?: string;
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
  customCompanyInfo?: string;
}

export const pdfService = {
  generateReceipt(data: InvoiceData) {
    // Thermal receipt 80mm width is approx 80 / 25.4 * 72 = 226 pts
    // We'll use a dynamic height or a very tall page that auto-trims if possible
    // For jsPDF, we can estimate height based on items.
    const itemHeight = 10;
    const headerHeight = 80;
    const footerHeight = 40;
    const totalLines = data.items.length;
    const estimatedHeight = headerHeight + (totalLines * itemHeight) + footerHeight + 40;
    
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [80, Math.max(estimatedHeight, 150)]
    });

    const pageWidth = doc.internal.pageSize.width;
    const formatValue = (val: number) => formatCurrency(val).replace(/\s/g, ' ');

    const headerText = data.customCompanyInfo || companySettings?.customCompanyInfo || '';
    const splitHeader = headerText ? doc.splitTextToSize(headerText, pageWidth - 10) : [];
    const headerLinesHeight = splitHeader.length * 4;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(companySettings?.name || 'MZ SOFT POS', pageWidth / 2, 10, { align: 'center' });
    
    let currentY = 15;
    if (splitHeader.length > 0) {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(splitHeader, pageWidth / 2, currentY, { align: 'center' });
      currentY += headerLinesHeight + 2;
    } else {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(companySettings?.address || '', pageWidth / 2, currentY, { align: 'center', maxWidth: 70 });
      currentY += (doc.splitTextToSize(companySettings?.address || '', 70).length * 4);
      
      doc.text(`Tél: ${companySettings?.phone || ''}`, pageWidth / 2, currentY, { align: 'center' });
      currentY += 5;
      
      doc.setFontSize(7);
      let idsStr = [];
      if (companySettings?.rc) idsStr.push(`RC: ${companySettings.rc}`);
      if (companySettings?.nif) idsStr.push(`NIF: ${companySettings.nif}`);
      if (companySettings?.ai) idsStr.push(`AI: ${companySettings.ai}`);
      
      if (idsStr.length > 0) {
        doc.text(idsStr.join(' | '), pageWidth / 2, currentY, { align: 'center' });
        currentY += 4;
      }
    }
    
    doc.line(5, currentY, pageWidth - 5, currentY);
    currentY += 5;
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('TICKET DE CAISSE', pageWidth / 2, currentY, { align: 'center' });
    currentY += 6;
    
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(`N°: ${data.invoiceNumber}`, 5, currentY);
    currentY += 4;
    const receiptDate = (data.date instanceof Date) ? data.date : new Date();
    doc.text(`Date: ${receiptDate.toLocaleString()}`, 5, currentY);
    currentY += 4;
    doc.text(`Client: ${data.customerName || 'Passager'}`, 5, currentY);
    currentY += 4;
    doc.text(`Vendeur: ${data.userName}`, 5, currentY);
    currentY += 4;
    
    doc.line(5, currentY, pageWidth - 5, currentY);

    // Table
    const tableData = data.items.map(item => [
      item.name,
      item.quantity.toString(),
      formatValue(item.price),
      formatValue(item.total || (item.quantity * item.price))
    ]);

    autoTable(doc, {
      startY: currentY + 2,
      head: [['Art', 'Qt', 'Px', 'Tot']],
      body: tableData,
      theme: 'plain',
      styles: { fontSize: 7, cellPadding: 1 },
      headStyles: { fontStyle: 'bold', textColor: [0, 0, 0], lineWidth: 0.1, lineColor: [0,0,0] },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { halign: 'center', cellWidth: 8 },
        2: { halign: 'right', cellWidth: 15 },
        3: { halign: 'right', cellWidth: 18 }
      },
      margin: { left: 5, right: 5 }
    });

    let finalY = (doc as any).lastAutoTable.finalY + 5;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('TOTAL:', 5, finalY);
    doc.setFontSize(10);
    doc.text(formatValue(data.totalAmount), pageWidth - 5, finalY, { align: 'right' });
    
    finalY += 5;
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    if (data.receivedAmount) {
      doc.text('Versé:', 5, finalY);
      doc.text(formatValue(data.receivedAmount), pageWidth - 5, finalY, { align: 'right' });
      finalY += 4;
      doc.text('Rendu:', 5, finalY);
      doc.text(formatValue(data.change || 0), pageWidth - 5, finalY, { align: 'right' });
      finalY += 6;
    }

    doc.setFontSize(7);
    doc.setFont('helvetica', 'italic');
    doc.text(companySettings?.footerText || 'Merci de votre visite !', pageWidth / 2, finalY + 5, { align: 'center' });

    // Open
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  },

  generateInvoice(data: InvoiceData) {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const formatValue = (val: number) => formatCurrency(val).replace(/\s/g, ' ');

    // --- Elegant Header with Blue Accents ---
    doc.setFillColor(30, 64, 175); // blue-800
    doc.rect(0, 0, pageWidth, 40, 'F');
    
    doc.setFontSize(22);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text(companySettings?.name || 'VOTRE ENTREPRISE', 20, 20);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(companySettings?.slogan || '', 20, 27);

    // White box for Doc Info
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(pageWidth - 80, 10, 60, 20, 1, 1, 'F');
    doc.setTextColor(30, 64, 175);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    const title = data.invoiceNumber.includes('PROFORMA') ? 'FACTURE PROFORMA' : 'FACTURE';
    doc.text(title, pageWidth - 50, 20, { align: 'center' });
    doc.setFontSize(8);
    doc.text(`N° ${data.invoiceNumber}`, pageWidth - 50, 26, { align: 'center' });

    // Dates
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    const dateToPrint = (data.date instanceof Date) ? data.date : new Date();
    doc.text(`${dateToPrint.toLocaleDateString()}`, pageWidth - 20, 35, { align: 'right' });
    
    // --- Body ---
    const columnWidth = (pageWidth - 40) / 2;
    const detailsY = 55;

    // LEFT: EMETTEUR
    doc.setFontSize(10);
    doc.setTextColor(30, 64, 175);
    doc.setFont('helvetica', 'bold');
    doc.text('DE :', 20, detailsY);
    
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(companySettings?.name || '', 20, detailsY + 7);
    
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    
    const headerText = data.customCompanyInfo || companySettings?.customCompanyInfo || '';
    if (headerText) {
      const splitHeader = doc.splitTextToSize(headerText, columnWidth);
      doc.text(splitHeader, 20, detailsY + 12);
    } else {
      let supplierY = detailsY + 12;
      if (companySettings?.phone) { doc.text(`Tél: ${companySettings.phone}`, 20, supplierY); supplierY += 5; }
      if (companySettings?.email) { doc.text(`${companySettings.email}`, 20, supplierY); supplierY += 5; }
      if (companySettings?.address) { doc.text(companySettings.address, 20, supplierY, { maxWidth: columnWidth }); supplierY += (doc.splitTextToSize(companySettings.address, columnWidth).length * 5); }
      
      // Add Company Identifiers if not in custom text
      doc.setFontSize(8);
      if (companySettings?.rc) { doc.text(`RC: ${companySettings.rc}`, 20, supplierY); supplierY += 4; }
      if (companySettings?.nif) { doc.text(`NIF: ${companySettings.nif}`, 20, supplierY); supplierY += 4; }
      if (companySettings?.ai) { doc.text(`AI: ${companySettings.ai}`, 20, supplierY); supplierY += 4; }
      if (companySettings?.nis) { doc.text(`NIS: ${companySettings.nis}`, 20, supplierY); supplierY += 4; }
    }
    
    // RIGHT: CLIENT
    doc.setFontSize(10);
    doc.setTextColor(30, 64, 175);
    doc.setFont('helvetica', 'bold');
    doc.text('FACTURER À :', pageWidth - 20, detailsY, { align: 'right' });
    
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
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
    
    // Add Customer Identifiers
    doc.setFontSize(8);
    if (data.customerRC) { doc.text(`RC: ${data.customerRC}`, pageWidth - 20, customerY, { align: 'right' }); customerY += 4; }
    if (data.customerNIF) { doc.text(`NIF: ${data.customerNIF}`, pageWidth - 20, customerY, { align: 'right' }); customerY += 4; }
    if (data.customerAI) { doc.text(`AI: ${data.customerAI}`, pageWidth - 20, customerY, { align: 'right' }); customerY += 4; }

    // --- Table ---
    const tableData = data.items.map(item => [
      item.name,
      item.quantity.toString(),
      formatValue(item.price),
      formatValue(item.total || (item.quantity * item.price))
    ]);

    autoTable(doc, {
      startY: detailsY + 40,
      head: [['DÉSIGNATION', 'QUANTITÉ', 'P. UNITAIRE', 'TOTAL']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [30, 64, 175], textColor: 255 },
      styles: { fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { halign: 'center', cellWidth: 25 },
        2: { halign: 'right', cellWidth: 40 },
        3: { halign: 'right', cellWidth: 45 }
      }
    });

    let finalY = (doc as any).lastAutoTable.finalY + 10;

    // Totals Grid
    doc.setFillColor(248, 250, 252);
    doc.rect(pageWidth - 90, finalY - 5, 70, 35, 'F');
    
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text('Total HT:', pageWidth - 85, finalY + 5);
    doc.text(formatValue(data.subtotal || 0), pageWidth - 25, finalY + 5, { align: 'right' });
    
    if (data.discount) {
      finalY += 7;
      doc.text('Remise:', pageWidth - 85, finalY + 5);
      doc.text(`-${formatValue(data.discount)}`, pageWidth - 25, finalY + 5, { align: 'right' });
    }

    if (data.taxAmount) {
      finalY += 7;
      doc.text(`TVA (${(data.taxRate || 0) * 100}%):`, pageWidth - 85, finalY + 5);
      doc.text(formatValue(data.taxAmount), pageWidth - 25, finalY + 5, { align: 'right' });
    }

    finalY += 10;
    doc.setFontSize(11);
    doc.setTextColor(30, 64, 175);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL TTC:', pageWidth - 85, finalY + 5);
    doc.text(formatValue(data.totalAmount), pageWidth - 25, finalY + 5, { align: 'right' });

    // Bottom official notice
    finalY += 30;
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.setFont('helvetica', 'italic');
    doc.text(`Arrêtée la présente facture à la somme de: ${data.totalAmount.toLocaleString('fr-FR')} ${companySettings?.currency || 'Dinars Algériens'}`, 20, finalY);

    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text(companySettings?.footerText || 'MERCI DE VOTRE CONFIANCE !', pageWidth / 2, 280, { align: 'center' });

    // Open
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  },

  generateQuote(data: QuoteData) {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const formatValue = (val: number) => formatCurrency(val).replace(/\s/g, ' ');

    // --- Clean Modern Header with Green Accents ---
    doc.setDrawColor(22, 163, 74); // emerald-600
    doc.setLineWidth(2);
    doc.line(0, 0, pageWidth, 0);
    
    doc.setFontSize(24);
    doc.setTextColor(22, 163, 74);
    doc.setFont('helvetica', 'bold');
    doc.text(companySettings?.name || 'VOTRE ENTREPRISE', 20, 25);
    
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.setFont('helvetica', 'normal');
    
    const headerText = data.customCompanyInfo || companySettings?.customCompanyInfo || '';
    if (headerText) {
      const splitHeader = doc.splitTextToSize(headerText, 100);
      doc.text(splitHeader, 20, 32);
    } else {
      let suppY = 32;
      doc.text(companySettings?.address || '', 20, suppY, { maxWidth: 100 });
      suppY += (doc.splitTextToSize(companySettings?.address || '', 100).length * 5);
      
      doc.setFontSize(8);
      if (companySettings?.rc) { doc.text(`RC: ${companySettings.rc}`, 20, suppY); suppY += 4; }
      if (companySettings?.nif) { doc.text(`NIF: ${companySettings.nif}`, 20, suppY); suppY += 4; }
      if (companySettings?.ai) { doc.text(`AI: ${companySettings.ai}`, 20, suppY); suppY += 4; }
    }

    // Quote Info Section
    doc.setFontSize(40);
    doc.setTextColor(230);
    doc.setFont('helvetica', 'bold');
    doc.text('DEVIS', pageWidth - 20, 40, { align: 'right' });
    
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(`NUMÉRO : ${data.quoteNumber}`, pageWidth - 20, 50, { align: 'right' });
    const qDate = (data.date instanceof Date) ? data.date : new Date();
    doc.text(`DATE : ${qDate.toLocaleDateString()}`, pageWidth - 20, 55, { align: 'right' });
    if (data.expiryDate) {
      doc.setTextColor(220, 38, 38);
      const eDate = (data.expiryDate instanceof Date) ? data.expiryDate : new Date();
      doc.text(`VALIDE JUSQU'AU : ${eDate.toLocaleDateString()}`, pageWidth - 20, 60, { align: 'right' });
    }

    doc.setDrawColor(240);
    doc.setLineWidth(0.5);
    doc.line(20, 70, pageWidth - 20, 70);

    // Client Info
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text('CLIENT :', 20, 85);
    doc.setFontSize(12);
    doc.text(data.customerName || 'Client', 20, 93);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    let qClientY = 98;
    if (data.customerEmail) { doc.text(data.customerEmail, 20, qClientY); qClientY += 5; }
    if (data.customerPhone) { doc.text(`Tél: ${data.customerPhone}`, 20, qClientY); qClientY += 5; }
    if (data.customerAddress) {
      doc.text(data.customerAddress, 20, qClientY, { maxWidth: 100 });
      qClientY += (doc.splitTextToSize(data.customerAddress, 100).length * 5);
    }
    
    doc.setFontSize(8);
    if (data.customerRC) { doc.text(`RC: ${data.customerRC}`, 20, qClientY); qClientY += 4; }
    if (data.customerNIF) { doc.text(`NIF: ${data.customerNIF}`, 20, qClientY); qClientY += 4; }
    if (data.customerAI) { doc.text(`AI: ${data.customerAI}`, 20, qClientY); qClientY += 4; }

    // Table
    const tableData = data.items.map(item => [
      item.name,
      item.quantity.toString(),
      formatValue(item.price),
      formatValue(item.total || (item.quantity * item.price))
    ]);

    autoTable(doc, {
      startY: 110,
      head: [['DÉSIGNATION', 'QTÉ', 'P. UNITAIRE', 'MONTANT']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [240, 240, 240], textColor: [0,0,0], fontStyle: 'bold' },
      styles: { fontSize: 9 },
      columnStyles: {
        3: { halign: 'right', fontStyle: 'bold' }
      }
    });

    let finalY = (doc as any).lastAutoTable.finalY + 15;

    // Total estimation box
    doc.setFillColor(236, 253, 245); // emerald-50
    doc.rect(pageWidth - 90, finalY - 10, 70, 25, 'F');
    
    doc.setFontSize(10);
    doc.setTextColor(22, 163, 74);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL ESTIMÉ HT:', pageWidth - 85, finalY);
    doc.setFontSize(14);
    doc.text(formatValue(data.totalAmount), pageWidth - 25, finalY + 10, { align: 'right' });

    // Footer note
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.setFont('helvetica', 'normal');
    doc.text('Ce devis est une estimation et ne constitue pas une facture officielle.', 20, 270);
    doc.text('Validité de l\'offre sous réserve de disponibilité des stocks.', 20, 274);

    // Open
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  },

  generateReturnSlip(data: ReturnSlipData) {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const formatValue = (val: number) => formatCurrency(val).replace(/\s/g, ' ');

    // --- Soft Rose/Red Header ---
    doc.setFillColor(255, 241, 242); // rose-50
    doc.rect(0, 0, pageWidth, 45, 'F');
    
    doc.setFontSize(22);
    doc.setTextColor(225, 29, 72); // rose-600
    doc.setFont('helvetica', 'bold');
    doc.text(companySettings?.name || 'VOTRE ENTREPRISE', 20, 20);
    
    doc.setFontSize(18);
    doc.text('BON DE RETOUR', pageWidth - 20, 20, { align: 'right' });
    
    doc.setFontSize(9);
    doc.setTextColor(150);
    doc.setFont('helvetica', 'normal');
    doc.text(`DOC N°: RET-${Date.now().toString().slice(-6)}`, pageWidth - 20, 28, { align: 'right' });
    doc.text(`VENTE BLOQUÉE N°: ${data.invoiceNumber}`, pageWidth - 20, 33, { align: 'right' });

    doc.setFontSize(9);
    doc.setTextColor(150);
    doc.setFont('helvetica', 'normal');
    const headerText = data.customCompanyInfo || companySettings?.customCompanyInfo || '';
    if (headerText) {
      const splitHeader = doc.splitTextToSize(headerText, 100);
      doc.text(splitHeader, 20, 28);
    } else {
      doc.text(companySettings?.address || '', 20, 28);
    }

    // Info area
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text('CLIENT :', 20, 60);
    doc.setFontSize(12);
    doc.text(data.customerName || 'Client de passage', 20, 68);
    
    doc.setFontSize(10);
    const rDate = (data.date instanceof Date) ? data.date : new Date();
    doc.text(`Remboursé le : ${rDate.toLocaleString()}`, pageWidth - 20, 68, { align: 'right' });

    // Table
    const tableData = data.items
      .filter(item => (item.returnedQuantity || 0) > 0)
      .map(item => [
        item.name,
        (item.returnedQuantity || 0).toString(),
        formatValue(item.price),
        formatValue((item.returnedQuantity || 0) * item.price)
      ]);

    autoTable(doc, {
      startY: 80,
      head: [['DÉSIGNATION', 'QTÉ RETOURNÉE', 'P. UNITAIRE', 'REMBOURSEMENT']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [225, 29, 72], textColor: 255 },
      styles: { fontSize: 9 }
    });

    let finalY = (doc as any).lastAutoTable.finalY + 15;

    // Total refund
    doc.setFontSize(12);
    doc.setTextColor(225, 29, 72);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL REMBOURSÉ:', pageWidth - 90, finalY);
    doc.setFontSize(16);
    doc.text(formatValue(data.refundAmount), pageWidth - 25, finalY + 10, { align: 'right' });

    // Signature Area
    finalY += 40;
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text('Signature Client', 40, finalY);
    doc.text('Cachet de l\'Établissement', pageWidth - 80, finalY);
    
    doc.setDrawColor(200);
    doc.line(20, finalY + 5, 80, finalY + 5);
    doc.line(pageWidth - 100, finalY + 5, pageWidth - 20, finalY + 5);

    // Open
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  }
};
