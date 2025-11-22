
import React, { useState } from 'react';
import { Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MMPSiteEntry } from '@/types/mmp/site';
import { 
  Pagination, 
  PaginationContent, 
  PaginationItem, 
  PaginationLink, 
  PaginationNext, 
  PaginationPrevious 
} from '@/components/ui/pagination';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface MMPSiteEntriesTableProps {
  siteEntries: MMPSiteEntry[];
  onPreviewDocument: (site: MMPSiteEntry) => void;
  itemsPerPage?: number;
}

const MMPSiteEntriesTable: React.FC<MMPSiteEntriesTableProps> = ({ 
  siteEntries, 
  onPreviewDocument,
  itemsPerPage = 5
}) => {
  const [currentPage, setCurrentPage] = useState(1);

  // Calculate total pages
  const totalPages = Math.ceil(siteEntries.length / itemsPerPage);
  
  // Get current items
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = siteEntries.slice(indexOfFirstItem, indexOfLastItem);
  
  // Change page
  const paginate = (pageNumber: number) => setCurrentPage(pageNumber);
  
  // Go to next page
  const nextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };
  
  // Go to previous page
  const prevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  // Generate page numbers for pagination
  const pageNumbers = [];
  const maxPageButtons = 5;
  
  let startPage = Math.max(1, currentPage - Math.floor(maxPageButtons / 2));
  let endPage = Math.min(totalPages, startPage + maxPageButtons - 1);
  
  // Adjust start if we're near the end
  if (endPage - startPage + 1 < maxPageButtons) {
    startPage = Math.max(1, endPage - maxPageButtons + 1);
  }
  
  for (let i = startPage; i <= endPage; i++) {
    pageNumbers.push(i);
  }

  return (
    <div className="mt-8 border rounded-xl p-6">
      <h4 className="text-lg font-semibold mb-4">Site Entries</h4>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Site Code</TableHead>
              <TableHead>MMP Name</TableHead>
              <TableHead>Site Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Main Activity</TableHead>
              <TableHead className="text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {currentItems.map((site, index) => (
              <TableRow key={site.id || index} className={index % 2 === 0 ? "bg-white" : "bg-muted/20"}>
                <TableCell>{site.siteCode}</TableCell>
                <TableCell>{site.mmpName || site.mmp_name || (site as any).mmpFiles?.name || '—'}</TableCell>
                <TableCell>{site.siteName}</TableCell>
                <TableCell>{site.status || 'Pending'}</TableCell>
                <TableCell>{site.state || 'N/A'}</TableCell>
                <TableCell>{site.mainActivity || site.siteActivity || 'N/A'}</TableCell>
                <TableCell className="text-center">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => onPreviewDocument(site)}
                    className="h-8 px-2"
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    Preview
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {currentItems.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-4 text-muted-foreground">
                  No site entries available
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        
        {totalPages > 1 && (
          <div className="mt-4">
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious 
                    onClick={prevPage} 
                    className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>
                
                {pageNumbers.map(number => (
                  <PaginationItem key={number}>
                    <PaginationLink
                      onClick={() => paginate(number)}
                      isActive={currentPage === number}
                      className="cursor-pointer"
                    >
                      {number}
                    </PaginationLink>
                  </PaginationItem>
                ))}
                
                <PaginationItem>
                  <PaginationNext 
                    onClick={nextPage} 
                    className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
            <div className="text-center text-sm text-muted-foreground mt-2">
              Showing {indexOfFirstItem + 1}-{Math.min(indexOfLastItem, siteEntries.length)} of {siteEntries.length} entries
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MMPSiteEntriesTable;
