import React, { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Edit2, X, Download, FileText, FileSpreadsheet } from "lucide-react";
import EditSiteEntryForm from "./site-visit/EditSiteEntryForm";
import { exportSiteEntriesToExcel, exportSiteEntriesToPDF } from "@/utils/exportUtils";
import { useToast } from "@/hooks/use-toast";

interface SiteEntry {
  id: string;
  siteCode: string;
  siteName: string;
  inMoDa: boolean;
  visitedBy: string;
  mainActivity: string;
  visitDate: string;
  status: string;
  isFlagged?: boolean;
  flagReason?: string;
  flaggedBy?: string;
  flaggedAt?: string;
  locality?: string;
  state?: string;
  address?: string;
  coordinates?: {
    latitude?: number;
    longitude?: number;
  };
  description?: string;
  notes?: string;
  permitDetails?: {
    federal: boolean;
    state: boolean;
    local: boolean;
    lastVerified?: string;
    verifiedBy?: string;
  };
}

interface SiteEntriesTableProps {
  sites: SiteEntry[];
  onUpdateSite?: (siteId: string, updatedData: Partial<SiteEntry>) => void;
  onExport?: (format: 'excel' | 'pdf') => void;
  showExportButtons?: boolean;
}

const SiteEntriesTable: React.FC<SiteEntriesTableProps> = ({ 
  sites, 
  onUpdateSite,
  onExport,
  showExportButtons = false
}) => {
  const [editingSiteId, setEditingSiteId] = useState<string | null>(null);
  const { toast } = useToast();

  const handleEditClick = (siteId: string) => {
    setEditingSiteId(siteId);
  };

  const handleCancelEdit = () => {
    setEditingSiteId(null);
  };

  const handleSaveSite = (siteId: string, updatedData: Partial<SiteEntry>) => {
    if (onUpdateSite) {
      onUpdateSite(siteId, updatedData);
    }
    setEditingSiteId(null);
  };

  const handleExportExcel = () => {
    try {
      exportSiteEntriesToExcel(sites);
      if (onExport) {
        onExport('excel');
      }
    } catch (error) {
      console.error('Excel export error:', error);
      toast({
        title: "Export Failed",
        description: "There was an error exporting the Excel file.",
        variant: "destructive"
      });
    }
  };

  const handleExportPDF = () => {
    try {
      exportSiteEntriesToPDF(sites);
      if (onExport) {
        onExport('pdf');
      }
    } catch (error) {
      console.error('PDF export error:', error);
      toast({
        title: "Export Failed",
        description: "There was an error exporting the PDF file.",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="border rounded-md">
      {showExportButtons && (
        <div className="flex justify-end gap-2 p-4 border-b">
          <Button 
            variant="outline" 
            size="sm" 
            className="flex items-center gap-1"
            onClick={handleExportExcel}
          >
            <FileSpreadsheet className="h-4 w-4" />
            Export Excel
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            className="flex items-center gap-1"
            onClick={handleExportPDF}
          >
            <FileText className="h-4 w-4" />
            Export PDF
          </Button>
        </div>
      )}
      
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Site Code</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Main Activity</TableHead>
            <TableHead>Visit Date</TableHead>
            <TableHead>Visited By</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>MoDa Status</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sites.map((site) => (
            <TableRow key={site.id}>
              {editingSiteId === site.id ? (
                <TableCell colSpan={9}>
                  <EditSiteEntryForm
                    siteEntry={site}
                    onSave={handleSaveSite}
                    onCancel={handleCancelEdit}
                  />
                </TableCell>
              ) : (
                <>
                  <TableCell className="font-medium">{site.siteCode}</TableCell>
                  <TableCell>{site.siteName}</TableCell>
                  <TableCell>{site.mainActivity}</TableCell>
                  <TableCell>{site.visitDate}</TableCell>
                  <TableCell>{site.visitedBy}</TableCell>
                  <TableCell>
                    {site.locality && site.state 
                      ? `${site.locality}, ${site.state}`
                      : 'N/A'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={site.inMoDa ? "success" : "warning"}>
                      {site.inMoDa ? "In MoDa" : "Not in MoDa"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={site.status === "Completed" ? "default" : "secondary"}>
                      {site.status}
                    </Badge>
                    {site.isFlagged && (
                      <Badge variant="destructive" className="ml-2">Flagged</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEditClick(site.id)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default SiteEntriesTable;
