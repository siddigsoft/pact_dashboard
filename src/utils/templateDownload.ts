 import { saveAs } from 'file-saver';
 import * as XLSX from 'xlsx';

 export const downloadMMPTemplate = () => {
  // Create template headers data
  const headers = [
    'Hub Office',
    'State',
    'Locality',
    'Site Name',
    'CP Name',
    'Main Activity',
    'Activity at Site',
    'Visit Type',
    'Visit Date',
    'Comments'
  ];
  
  // Add sample rows for reference
  const sampleRows = [
    [
      'Khartoum',
      'Khartoum',
      'Bahri',
      'Example Health Center',
      'Partner Organization',
      'DM',
      'TSFP',
      'TPM',
      '2023-04-15',
      'Regular monitoring visit'
    ],
    [
      'Port Sudan',
      'Red Sea',
      'Suakin',
      'Example School',
      'Education Partner',
      'Education',
      'School Visit',
      'Regular',
      '2023-04-20',
      'Quarterly assessment'
    ]
  ];
  
  // Build Excel workbook from headers + sample rows
  const wsData = [headers, ...sampleRows];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, 'Template');

  // Generate .xlsx file and trigger download
  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blobData = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blobData, 'mmp_template.xlsx');

  return true;
};
