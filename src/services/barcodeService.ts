import JsBarcode from 'jsbarcode';
import { jsPDF } from 'jspdf';

export interface BarcodePrintOptions {
  quantity: number;
  labelWidth: number; // mm
  labelHeight: number; // mm
  showText: boolean;
  fontSize: number;
  format: string; // CODE128, EAN13, etc.
}

export const barcodeService = {
  /**
   * Generates a data URL for a barcode image
   */
  generateBarcodeDataUrl: (code: string, options: Partial<BarcodePrintOptions> = {}): string => {
    const canvas = document.createElement('canvas');
    try {
      JsBarcode(canvas, code, {
        format: options.format || "CODE128",
        width: 2,
        height: 60,
        displayValue: options.showText ?? true,
        fontSize: options.fontSize || 14,
        margin: 10
      });
      return canvas.toDataURL('image/png');
    } catch (e) {
      console.error('Barcode generation failed:', e);
      throw new Error('Erreur de génération du code-barres. Vérifiez le format.');
    }
  },

  /**
   * Generates a PDF with multiple barcodes
   */
  generatePDF: (product: { name: string, barcode: string, sellingPrice: number }, options: BarcodePrintOptions): jsPDF => {
    const { quantity, labelWidth, labelHeight, showText } = options;
    const doc = new jsPDF({
      orientation: labelWidth > labelHeight ? 'landscape' : 'portrait',
      unit: 'mm',
      format: [labelWidth, labelHeight]
    });

    const barcodeUrl = barcodeService.generateBarcodeDataUrl(product.barcode, options);

    for (let i = 0; i < quantity; i++) {
        if (i > 0) doc.addPage([labelWidth, labelHeight]);

        // Add Product Name (Small)
        doc.setFontSize(8);
        doc.text(product.name.substring(0, 30), labelWidth / 2, 5, { align: 'center' });

        // Add Barcode Image
        doc.addImage(barcodeUrl, 'PNG', 5, 8, labelWidth - 10, labelHeight - 20);

        // Add Price
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(`${product.sellingPrice.toLocaleString()} DA`, labelWidth / 2, labelHeight - 5, { align: 'center' });
    }

    return doc;
  },

  /**
   * Generates a PDF with multiple products, each with its own quantity
   */
  generateBatchPDF: (items: { product: { name: string, barcode: string, sellingPrice: number }, quantity: number }[], options: Omit<BarcodePrintOptions, 'quantity'>): jsPDF => {
    const { labelWidth, labelHeight } = options;
    const doc = new jsPDF({
      orientation: labelWidth > labelHeight ? 'landscape' : 'portrait',
      unit: 'mm',
      format: [labelWidth, labelHeight]
    });

    let first = true;

    items.forEach(({ product, quantity }) => {
      const barcodeUrl = barcodeService.generateBarcodeDataUrl(product.barcode, options);
      
      for (let i = 0; i < quantity; i++) {
        if (!first) {
          doc.addPage([labelWidth, labelHeight]);
        }
        first = false;

        // Add Product Name (Small)
        doc.setFontSize(8);
        doc.text(product.name.substring(0, 30), labelWidth / 2, 5, { align: 'center' });

        // Add Barcode Image
        doc.addImage(barcodeUrl, 'PNG', 5, 8, labelWidth - 10, labelHeight - 20);

        // Add Price
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(`${product.sellingPrice.toLocaleString()} DA`, labelWidth / 2, labelHeight - 5, { align: 'center' });
      }
    });

    return doc;
  },

  /**
   * Prints a batch of products directly
   */
  printBatch: (items: { product: { name: string, barcode: string, sellingPrice: number }, quantity: number }[], options: Omit<BarcodePrintOptions, 'quantity'>) => {
    const doc = barcodeService.generateBatchPDF(items, options);
    doc.autoPrint();
    const hiddFrame = document.createElement('iframe');
    hiddFrame.style.position = 'fixed';
    hiddFrame.style.width = '1px';
    hiddFrame.style.height = '1px';
    hiddFrame.style.opacity = '0.01';
    document.body.appendChild(hiddFrame);
    hiddFrame.src = doc.output('bloburl').toString();
    
    setTimeout(() => {
        if (hiddFrame.parentNode) {
            document.body.removeChild(hiddFrame);
        }
    }, 2000);
  },

  /**
   * Prints barcodes directly
   */
  printDirect: (product: { name: string, barcode: string, sellingPrice: number }, options: BarcodePrintOptions) => {
    const doc = barcodeService.generatePDF(product, options);
    doc.autoPrint();
    const hiddFrame = document.createElement('iframe');
    hiddFrame.style.position = 'fixed';
    hiddFrame.style.width = '1px';
    hiddFrame.style.height = '1px';
    hiddFrame.style.opacity = '0.01';
    document.body.appendChild(hiddFrame);
    hiddFrame.src = doc.output('bloburl').toString();
    
    // Cleanup after some time
    setTimeout(() => {
        if (hiddFrame.parentNode) {
            document.body.removeChild(hiddFrame);
        }
    }, 2000);
  }
};
