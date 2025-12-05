import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, 
  X, 
  Mic, 
  MicOff, 
  Clock, 
  TrendingUp,
  ArrowLeft,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';

interface SearchSuggestion {
  id: string;
  text: string;
  type: 'recent' | 'suggestion' | 'trending';
}

interface MobileSearchBarProps {
  placeholder?: string;
  value?: string;
  onSearch: (query: string) => void;
  onClear?: () => void;
  suggestions?: SearchSuggestion[];
  recentSearches?: string[];
  isLoading?: boolean;
  showVoiceInput?: boolean;
  autoFocus?: boolean;
  className?: string;
}

export function MobileSearchBar({
  placeholder = 'Search...',
  value = '',
  onSearch,
  onClear,
  suggestions = [],
  recentSearches = [],
  isLoading = false,
  showVoiceInput = true,
  autoFocus = false,
  className,
}: MobileSearchBarProps) {
  const [query, setQuery] = useState(value);
  const [isFocused, setIsFocused] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    setShowSuggestions(true);
    hapticPresets.selection();
  }, []);

  const handleBlur = useCallback(() => {
    setTimeout(() => {
      setIsFocused(false);
      setShowSuggestions(false);
    }, 200);
  }, []);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setQuery(newValue);
    setShowSuggestions(true);
  }, []);

  const handleSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault();
    if (query.trim()) {
      hapticPresets.buttonPress();
      onSearch(query.trim());
      setShowSuggestions(false);
      inputRef.current?.blur();
    }
  }, [query, onSearch]);

  const handleClear = useCallback(() => {
    hapticPresets.buttonPress();
    setQuery('');
    onClear?.();
    inputRef.current?.focus();
  }, [onClear]);

  const handleSuggestionClick = useCallback((text: string) => {
    hapticPresets.buttonPress();
    setQuery(text);
    onSearch(text);
    setShowSuggestions(false);
  }, [onSearch]);

  const startVoiceInput = useCallback(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      return;
    }

    hapticPresets.buttonPress();
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.continuous = false;
    recognitionRef.current.interimResults = true;

    recognitionRef.current.onstart = () => {
      setIsListening(true);
    };

    recognitionRef.current.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((result: any) => result[0].transcript)
        .join('');
      setQuery(transcript);
    };

    recognitionRef.current.onend = () => {
      setIsListening(false);
      if (query.trim()) {
        handleSubmit();
      }
    };

    recognitionRef.current.onerror = () => {
      setIsListening(false);
    };

    recognitionRef.current.start();
  }, [query, handleSubmit]);

  const stopVoiceInput = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
  }, []);

  const allSuggestions: SearchSuggestion[] = [
    ...recentSearches.slice(0, 3).map((text, i) => ({
      id: `recent-${i}`,
      text,
      type: 'recent' as const,
    })),
    ...suggestions,
  ];

  const filteredSuggestions = query
    ? allSuggestions.filter(s => 
        s.text.toLowerCase().includes(query.toLowerCase())
      )
    : allSuggestions;

  return (
    <div className={cn("relative", className)}>
      <form onSubmit={handleSubmit}>
        <div 
          className={cn(
            "flex items-center gap-2 h-12 px-4 rounded-full transition-all",
            "bg-black/5 dark:bg-white/5",
            isFocused && "bg-black/10 dark:bg-white/10 ring-2 ring-black/20 dark:ring-white/20"
          )}
        >
          {isFocused ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 -ml-1"
              onClick={() => {
                setIsFocused(false);
                setShowSuggestions(false);
                inputRef.current?.blur();
              }}
              data-testid="button-search-back"
            >
              <ArrowLeft className="h-5 w-5 text-black/60 dark:text-white/60" />
            </Button>
          ) : (
            <Search className="h-5 w-5 text-black/40 dark:text-white/40 flex-shrink-0" />
          )}

          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder={placeholder}
            className="flex-1 bg-transparent text-base text-black dark:text-white placeholder:text-black/40 dark:placeholder:text-white/40 outline-none"
            data-testid="input-search-query"
            aria-label="Search"
          />

          {isLoading && (
            <Loader2 className="h-5 w-5 text-black/40 dark:text-white/40 animate-spin" />
          )}

          {query && !isLoading && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleClear}
              data-testid="button-search-clear"
            >
              <X className="h-4 w-4 text-black/60 dark:text-white/60" />
            </Button>
          )}

          {showVoiceInput && !query && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "h-8 w-8",
                isListening && "bg-black dark:bg-white"
              )}
              onClick={isListening ? stopVoiceInput : startVoiceInput}
              data-testid="button-voice-search"
              aria-label={isListening ? "Stop voice input" : "Start voice input"}
            >
              {isListening ? (
                <MicOff className="h-4 w-4 text-white dark:text-black" />
              ) : (
                <Mic className="h-4 w-4 text-black/60 dark:text-white/60" />
              )}
            </Button>
          )}
        </div>
      </form>

      <AnimatePresence>
        {showSuggestions && filteredSuggestions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute left-0 right-0 top-full mt-2 bg-white dark:bg-neutral-900 rounded-2xl shadow-xl border border-black/10 dark:border-white/10 overflow-hidden z-50"
            data-testid="search-suggestions"
          >
            {filteredSuggestions.map((suggestion) => (
              <button
                key={suggestion.id}
                onClick={() => handleSuggestionClick(suggestion.text)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors touch-manipulation"
                data-testid={`suggestion-${suggestion.id}`}
              >
                {suggestion.type === 'recent' && (
                  <Clock className="h-4 w-4 text-black/40 dark:text-white/40" />
                )}
                {suggestion.type === 'trending' && (
                  <TrendingUp className="h-4 w-4 text-black/40 dark:text-white/40" />
                )}
                {suggestion.type === 'suggestion' && (
                  <Search className="h-4 w-4 text-black/40 dark:text-white/40" />
                )}
                <span className="text-sm text-black dark:text-white">
                  {suggestion.text}
                </span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isListening && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="absolute inset-0 flex items-center justify-center bg-white dark:bg-black rounded-full"
          >
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-12 h-12 rounded-full bg-black dark:bg-white flex items-center justify-center">
                  <Mic className="h-6 w-6 text-white dark:text-black" />
                </div>
                <motion.div
                  className="absolute inset-0 rounded-full border-2 border-black dark:border-white"
                  animate={{ scale: [1, 1.5, 1], opacity: [1, 0, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
              </div>
              <span className="text-sm font-medium text-black dark:text-white">
                Listening...
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface FullscreenSearchProps extends MobileSearchBarProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
}

export function FullscreenSearch({
  isOpen,
  onClose,
  title = 'Search',
  ...props
}: FullscreenSearchProps) {
  const handleSearch = useCallback((query: string) => {
    props.onSearch(query);
    onClose();
  }, [props.onSearch, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-white dark:bg-black"
          data-testid="fullscreen-search"
        >
          <div className="safe-area-top" />
          
          <div className="p-4">
            <div className="flex items-center gap-3 mb-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                data-testid="button-close-search"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <h2 className="text-lg font-bold text-black dark:text-white">
                {title}
              </h2>
            </div>

            <MobileSearchBar
              {...props}
              onSearch={handleSearch}
              autoFocus
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
