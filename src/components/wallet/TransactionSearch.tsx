import { useState, useEffect } from 'react';
import { Search, X, Filter, Calendar, DollarSign } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

interface TransactionSearchProps {
  onSearch: (filters: SearchFilters) => void;
  onClear: () => void;
  filters?: SearchFilters;
}

export interface SearchFilters {
  searchTerm?: string;
  type?: string;
  minAmount?: number;
  maxAmount?: number;
  startDate?: string;
  endDate?: string;
}

export default function TransactionSearch({ onSearch, onClear, filters }: TransactionSearchProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [type, setType] = useState('all');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    if (filters && Object.keys(filters).length === 0) {
      setSearchTerm('');
      setType('all');
      setMinAmount('');
      setMaxAmount('');
      setStartDate('');
      setEndDate('');
    }
  }, [filters]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleSearch = () => {
    const filters: SearchFilters = {};
    if (searchTerm) filters.searchTerm = searchTerm;
    if (type !== 'all') filters.type = type;
    if (minAmount) filters.minAmount = parseFloat(minAmount);
    if (maxAmount) filters.maxAmount = parseFloat(maxAmount);
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    onSearch(filters);
  };

  const handleClear = () => {
    setSearchTerm('');
    setType('all');
    setMinAmount('');
    setMaxAmount('');
    setStartDate('');
    setEndDate('');
    onClear();
  };

  const activeFiltersCount = [searchTerm, type !== 'all', minAmount, maxAmount, startDate, endDate].filter(Boolean).length;

  return (
    <Card className="bg-gradient-to-br from-slate-900/80 to-blue-900/80 border-blue-500/30 backdrop-blur-xl shadow-[0_0_20px_rgba(59,130,246,0.2)]">
      <div className="p-4 space-y-4">
        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by description, reference, or site visit..."
            className="pl-10 bg-slate-900/50 border-blue-500/30 text-blue-100 placeholder:text-blue-300/40 focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20"
            data-testid="input-transaction-search"
          />
        </div>

        {/* Quick Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="px-3 py-1.5 text-sm rounded-md bg-gradient-to-r from-blue-600/20 to-purple-600/20 hover:from-blue-600/30 hover:to-purple-600/30 text-blue-300 border border-blue-500/30 inline-flex items-center gap-2 transition"
            data-testid="button-toggle-advanced"
          >
            <Filter className="w-3 h-3" />
            Advanced
            {activeFiltersCount > 0 && (
              <Badge className="bg-blue-500 text-white text-xs px-1.5 py-0.5">
                {activeFiltersCount}
              </Badge>
            )}
          </button>

          {activeFiltersCount > 0 && (
            <button
              type="button"
              onClick={handleClear}
              className="px-3 py-1.5 text-sm rounded-md bg-red-900/20 hover:bg-red-900/30 text-red-300 border border-red-500/30 inline-flex items-center gap-2 transition"
              data-testid="button-clear-filters"
            >
              <X className="w-3 h-3" />
              Clear
            </button>
          )}

          <button
            type="button"
            onClick={handleSearch}
            className="px-4 py-1.5 text-sm rounded-md bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white border border-blue-400/50 shadow-[0_0_15px_rgba(59,130,246,0.3)] transition inline-flex items-center gap-2"
            data-testid="button-apply-search"
          >
            <Search className="w-3 h-3" />
            Search
          </button>
        </div>

        {/* Advanced Filters */}
        {showAdvanced && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-blue-500/20 animate-in slide-in-from-top-2">
            <div className="space-y-2">
              <Label className="text-blue-300 text-sm">Transaction Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="bg-slate-900/50 border-blue-500/30 text-blue-100" data-testid="select-transaction-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="site_visit_fee">Site Visit Fee</SelectItem>
                  <SelectItem value="withdrawal">Withdrawal</SelectItem>
                  <SelectItem value="bonus">Bonus</SelectItem>
                  <SelectItem value="penalty">Penalty</SelectItem>
                  <SelectItem value="adjustment">Adjustment</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-blue-300 text-sm flex items-center gap-2">
                <DollarSign className="w-3 h-3" />
                Amount Range
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  placeholder="Min"
                  value={minAmount}
                  onChange={(e) => setMinAmount(e.target.value)}
                  className="bg-slate-900/50 border-blue-500/30 text-blue-100 placeholder:text-blue-300/40"
                  data-testid="input-min-amount"
                />
                <Input
                  type="number"
                  placeholder="Max"
                  value={maxAmount}
                  onChange={(e) => setMaxAmount(e.target.value)}
                  className="bg-slate-900/50 border-blue-500/30 text-blue-100 placeholder:text-blue-300/40"
                  data-testid="input-max-amount"
                />
              </div>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label className="text-blue-300 text-sm flex items-center gap-2">
                <Calendar className="w-3 h-3" />
                Date Range
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-slate-900/50 border-blue-500/30 text-blue-100"
                  data-testid="input-start-date"
                />
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-slate-900/50 border-blue-500/30 text-blue-100"
                  data-testid="input-end-date"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
