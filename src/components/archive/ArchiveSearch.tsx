
import React, { useState } from 'react';
import { useArchive } from '@/context/archive/ArchiveContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SearchIcon, X, Loader2 } from 'lucide-react';
import { ArchiveDocument, ArchivedMMPFile, ArchivedSiteVisit } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

interface ArchiveSearchProps {
  onResultSelect?: (
    type: 'mmp' | 'siteVisit' | 'document',
    id: string
  ) => void;
}

const ArchiveSearch: React.FC<ArchiveSearchProps> = ({ onResultSelect }) => {
  const { searchArchives } = useArchive();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchPerformed, setSearchPerformed] = useState(false);
  const [searchResults, setSearchResults] = useState<{
    mmps: ArchivedMMPFile[];
    siteVisits: ArchivedSiteVisit[];
    documents: ArchiveDocument[];
  }>({ mmps: [], siteVisits: [], documents: [] });

  const handleSearch = async () => {
    if (!query.trim()) {
      toast({
        title: "Empty search",
        description: "Please enter a search term",
        variant: "destructive",
      });
      return;
    }

    setSearching(true);
    try {
      const results = await searchArchives(query);
      setSearchResults(results);
      setSearchPerformed(true);
      
      const totalResults = results.mmps.length + results.siteVisits.length + results.documents.length;
      if (totalResults === 0) {
        toast({
          title: "No results found",
          description: `No matches found for "${query}"`,
        });
      } else {
        toast({
          title: "Search complete",
          description: `Found ${totalResults} result${totalResults !== 1 ? 's' : ''}`,
        });
      }
    } catch (error) {
      console.error('Search error:', error);
      toast({
        title: "Search error",
        description: "An error occurred while searching",
        variant: "destructive",
      });
    } finally {
      setSearching(false);
    }
  };

  const handleReset = () => {
    setQuery("");
    setSearchResults({ mmps: [], siteVisits: [], documents: [] });
    setSearchPerformed(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleResultClick = (type: 'mmp' | 'siteVisit' | 'document', id: string) => {
    if (onResultSelect) {
      onResultSelect(type, id);
    }
  };

  return (
    <div className="w-full space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search archives by name, ID, status, region..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="pl-10 w-full bg-background/70 backdrop-blur-sm"
          />
          {query && (
            <button
              onClick={handleReset}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Button 
          onClick={handleSearch} 
          disabled={searching || !query.trim()}
          className="bg-primary/90"
        >
          {searching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <SearchIcon className="h-4 w-4" />
          )}
          <span className="ml-2">Search</span>
        </Button>
      </div>

      {searchPerformed && (
        <div className="space-y-6">
          {searchResults.mmps.length === 0 && 
           searchResults.siteVisits.length === 0 && 
           searchResults.documents.length === 0 && (
            <div className="text-center py-10">
              <p className="text-muted-foreground">No results found for "{query}"</p>
            </div>
          )}

          {searchResults.mmps.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium flex items-center">
                MMP Files 
                <span className="ml-2 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                  {searchResults.mmps.length}
                </span>
              </h3>
              <div className="space-y-2">
                {searchResults.mmps.map((mmp) => (
                  <Card 
                    key={mmp.id} 
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => handleResultClick('mmp', mmp.id)}
                  >
                    <CardContent className="p-3 flex justify-between items-center">
                      <div>
                        <p className="font-medium">{mmp.name}</p>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                          <span>{mmp.id}</span>
                          <span>{format(new Date(mmp.uploadedAt), 'MMM d, yyyy')}</span>
                          <span>{mmp.region || 'No region'}</span>
                        </div>
                      </div>
                      <Badge variant={mmp.status === 'approved' ? 'default' : mmp.status === 'rejected' ? 'destructive' : 'outline'}>
                        {mmp.status}
                      </Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {searchResults.siteVisits.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium flex items-center">
                Site Visits
                <span className="ml-2 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                  {searchResults.siteVisits.length}
                </span>
              </h3>
              <div className="space-y-2">
                {searchResults.siteVisits.map((visit) => (
                  <Card 
                    key={visit.id} 
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => handleResultClick('siteVisit', visit.id)}
                  >
                    <CardContent className="p-3 flex justify-between items-center">
                      <div>
                        <p className="font-medium">{visit.siteName}</p>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                          <span>{visit.siteCode}</span>
                          <span>{visit.state}, {visit.locality}</span>
                          <span>{format(new Date(visit.scheduledDate), 'MMM d, yyyy')}</span>
                        </div>
                      </div>
                      <Badge variant={
                        visit.status === 'completed' ? 'default' : 
                        visit.status === 'cancelled' || visit.status === 'canceled' ? 'destructive' : 
                        'outline'
                      }>
                        {visit.status}
                      </Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {searchResults.documents.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium flex items-center">
                Documents
                <span className="ml-2 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                  {searchResults.documents.length}
                </span>
              </h3>
              <div className="space-y-2">
                {searchResults.documents.map((doc) => (
                  <Card 
                    key={doc.id} 
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => handleResultClick('document', doc.id)}
                  >
                    <CardContent className="p-3 flex justify-between items-center">
                      <div>
                        <p className="font-medium">{doc.fileName}</p>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                          <span>{doc.fileType.toUpperCase()}</span>
                          <span>{format(new Date(doc.uploadedAt), 'MMM d, yyyy')}</span>
                          <span>{(doc.fileSize / (1024 * 1024)).toFixed(2)} MB</span>
                        </div>
                      </div>
                      <Badge variant="outline">
                        {doc.category}
                      </Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ArchiveSearch;
