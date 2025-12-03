import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useUnifiedNavigation } from '@/hooks/use-unified-navigation';
import { cn } from '@/lib/utils';

interface MobileGlobalSearchProps {
  isOpen: boolean;
  onClose: () => void;
  className?: string;
}

const MobileGlobalSearch: React.FC<MobileGlobalSearchProps> = ({
  isOpen,
  onClose,
  className
}) => {
  const navigate = useNavigate();
  const { allItems } = useUnifiedNavigation();
  const [query, setQuery] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setIsExpanded(false);
    }
  }, [isOpen]);

  const filteredItems = allItems.filter(item =>
    item.label.toLowerCase().includes(query.toLowerCase()) ||
    item.description?.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 8); // Limit results for mobile

  const handleSearch = (searchQuery: string) => {
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      onClose();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch(query);
  };

  const handleItemClick = (path: string) => {
    navigate(path);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className={cn(
      "fixed inset-0 z-50 bg-background/95 backdrop-blur-sm",
      "flex flex-col",
      className
    )}>
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b bg-background/80">
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="shrink-0"
        >
          <X className="h-5 w-5" />
        </Button>

        <form onSubmit={handleSubmit} className="flex-1 relative">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              type="search"
              placeholder="Search anything..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setIsExpanded(e.target.value.length > 0);
              }}
              className="pl-10 pr-12 h-11 text-base"
              autoComplete="off"
            />
            {query && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => {
                  setQuery('');
                  setIsExpanded(false);
                  inputRef.current?.focus();
                }}
                className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </form>

        {query && (
          <Button
            type="submit"
            form="search-form"
            variant="ghost"
            size="icon"
            onClick={() => handleSearch(query)}
            className="shrink-0"
          >
            <ArrowRight className="h-5 w-5" />
          </Button>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {isExpanded && query ? (
          <div className="p-2">
            {filteredItems.length > 0 ? (
              <div className="space-y-1">
                {filteredItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleItemClick(item.path)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-accent active:bg-accent/80 transition-colors text-left touch-manipulation"
                    style={{
                      WebkitTapHighlightColor: 'transparent',
                      touchAction: 'manipulation'
                    }}
                  >
                    <div className="flex-shrink-0">
                      <item.icon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        {item.label}
                      </div>
                      {item.description && (
                        <div className="text-xs text-muted-foreground truncate">
                          {item.description}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Search className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-sm text-muted-foreground">
                  No results found for "{query}"
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => handleSearch(query)}
                >
                  Search all content
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-6">
            <Search className="h-16 w-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium mb-2">Search</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Search for pages, features, and content across the PACT platform
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default MobileGlobalSearch;