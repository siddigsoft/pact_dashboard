
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';

interface ExportFields {
  includeDistributionByCP: boolean;
  includeVisitStatus: boolean;
  includeSubmissionStatus: boolean;
  includeQuestions: boolean;
  includeFindings: boolean;
  includeFlagged: boolean;
  includeComments: boolean;
}

export const downloadMMP = (siteData: any[], fields: ExportFields, name: string = 'mmp-export') => {
  try {
    // Filter and transform data based on included fields
    const exportData = siteData.map(site => {
      const row: any = {
        'Site Code': site.siteCode || '',
        'Site Name': site.siteName || '',
        'Hub Office': site.hubOffice || '',
        'State': site.state || '',
        'Locality': site.locality || '',
        'Visit Type': site.visitType || '',
        'Main Activity': site.mainActivity || '',
        'Visit Date': site.visitDate || '',
      };

      if (fields.includeDistributionByCP) {
        row['Distribution By CP'] = site.distributionByCP ? 'Yes' : 'No';
      }

      if (fields.includeVisitStatus) {
        row['Site Visited'] = site.siteVisited ? 'Yes' : 'No';
      }

      if (fields.includeSubmissionStatus) {
        row['Submitted to MoDa'] = site.submittedToMoDa ? 'Yes' : 'No';
      }

      if (fields.includeQuestions) {
        row['Questions Submitted'] = site.questionsSubmitted || 0;
      }

      if (fields.includeFindings) {
        row['Findings'] = site.findings || '';
      }

      if (fields.includeFlagged) {
        row['Flagged Issues'] = site.flaggedIssues || '';
      }

      if (fields.includeComments) {
        row['Additional Comments'] = site.comments || '';
      }

      return row;
    });

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Sites');

    // Generate buffer
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blobData = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    
    // Download file
    const fileName = `${name}-${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
    saveAs(blobData, fileName);

    return true;
  } catch (error) {
    console.error('Error exporting MMP:', error);
    return false;
  }
};
