import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency } from '../lib/utils';

interface InvoiceItem {
  name: string;
  quantity: number;
  price: number;
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
    const tableData = data.items.map(item => [
      item.name,
      item.quantity.toString(),
      formatCurrency(item.price),
      formatCurrency(item.quantity * item.price)
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
        halign: 'left'
      },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { halign: 'center', cellWidth: 20 },
        2: { halign: 'right', cellWidth: 35 },
        3: { halign: 'right', cellWidth: 35 }
      },
      styles: {
        fontSize: 9,
        cellPadding: 3
      }
    });

    let finalY = (doc as any).lastAutoTable.finalY + 10;

    // Totals Area
    doc.setDrawColor(240);
    doc.setFillColor(250, 250, 250);
    doc.rect(pageWidth - 90, finalY - 5, 70, 35, 'F');

    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL NET À PAYER:', pageWidth - 85, finalY + 2);
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text(formatCurrency(data.totalAmount), pageWidth - 25, finalY + 2, { align: 'right' });

    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.setFont('helvetica', 'normal');
    finalY += 10;
    doc.text('Montant Reçu:', pageWidth - 85, finalY);
    doc.text(formatCurrency(data.receivedAmount || data.totalAmount), pageWidth - 25, finalY, { align: 'right' });

    if (data.change && data.change > 0) {
      finalY += 6;
      doc.setFont('helvetica', 'bold');
      doc.text('Rendu (Monnaie):', pageWidth - 85, finalY);
      doc.text(formatCurrency(data.change), pageWidth - 25, finalY, { align: 'right' });
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
  }
};
