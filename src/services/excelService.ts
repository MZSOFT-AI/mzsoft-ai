import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { format } from 'date-fns';

interface ExcelReportOptions {
  filename: string;
  title: string;
  subtitle?: string;
  columns: { header: string; key: string; width: number }[];
  data: any[];
}

export const excelService = {
  async generateProfessionalReport(options: ExcelReportOptions) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(options.title);

    // Add Title
    const titleRow = worksheet.addRow([options.title.toUpperCase()]);
    titleRow.font = { name: 'Arial Black', size: 16, color: { argb: 'FF1E40AF' } }; // Blue-900 equivalent
    worksheet.mergeCells(`A1:${String.fromCharCode(64 + options.columns.length)}1`);
    titleRow.alignment = { vertical: 'middle', horizontal: 'center' };
    titleRow.height = 30;

    // Add Subtitle
    if (options.subtitle) {
      const subtitleRow = worksheet.addRow([options.subtitle]);
      subtitleRow.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF64748B' } }; // Slate-500
      worksheet.mergeCells(`A2:${String.fromCharCode(64 + options.columns.length)}2`);
      subtitleRow.alignment = { vertical: 'middle', horizontal: 'center' };
    }

    // Add Date
    const dateRow = worksheet.addRow([`Généré le : ${format(new Date(), 'dd/MM/yyyy HH:mm')}`]);
    dateRow.font = { name: 'Arial', size: 8 };
    worksheet.mergeCells(`A${worksheet.rowCount}:${String.fromCharCode(64 + options.columns.length)}${worksheet.rowCount}`);
    dateRow.alignment = { vertical: 'middle', horizontal: 'right' };

    worksheet.addRow([]); // Spacer

    // Add Headers
    const headerRow = worksheet.addRow(options.columns.map(col => col.header));
    headerRow.height = 20;
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF334155' } // Slate-700
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });

    // Add Data
    options.data.forEach((item, index) => {
      const rowData = options.columns.map(col => item[col.key]);
      const row = worksheet.addRow(rowData);
      
      // Stripe effect
      if (index % 2 === 1) {
        row.eachCell((cell) => {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF8FAFC' } // Slate-50
          };
        });
      }

      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };
        cell.font = { name: 'Arial', size: 9 };
      });
    });

    // Set Column Widths
    worksheet.columns = options.columns.map(col => ({
      header: col.header,
      key: col.key,
      width: col.width
    }));

    // Generate Buffer
    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `${options.filename}_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
  }
};
