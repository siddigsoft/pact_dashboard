import { useState } from 'react';
import { DollarSign, TrendingUp, TrendingDown, ChevronDown, RotateCcw, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { SUPPORTED_CURRENCIES, getCurrencyByCode, DEFAULT_CURRENCY_PREFERENCE } from '@/utils/currencyUtils';
import { useCurrencyPreference } from '@/hooks/useCurrencyPreference';

interface CurrencySwitcherProps {
  /** If provided, shows only a single combined currency selector */
  mode?: 'split' | 'single';
  /** Label shown in the trigger badge */
  label?: string;
  /** Called after preference changes */
  onChange?: (incomeCurrency: string, expenseCurrency: string) => void;
}

export function CurrencySwitcher({ mode = 'split', label, onChange }: CurrencySwitcherProps) {
  const { preference, setIncomeCurrency, setExpenseCurrency, resetToDefault } = useCurrencyPreference();
  const [open, setOpen] = useState(false);

  const incomeCurrency = getCurrencyByCode(preference.incomeCurrency);
  const expenseCurrency = getCurrencyByCode(preference.expenseCurrency);

  const isDefault =
    preference.incomeCurrency === DEFAULT_CURRENCY_PREFERENCE.incomeCurrency &&
    preference.expenseCurrency === DEFAULT_CURRENCY_PREFERENCE.expenseCurrency;

  const handleIncomeChange = (code: string) => {
    setIncomeCurrency(code);
    onChange?.(code, preference.expenseCurrency);
  };

  const handleExpenseChange = (code: string) => {
    setExpenseCurrency(code);
    onChange?.(preference.incomeCurrency, code);
  };

  const handleReset = () => {
    resetToDefault();
    onChange?.(DEFAULT_CURRENCY_PREFERENCE.incomeCurrency, DEFAULT_CURRENCY_PREFERENCE.expenseCurrency);
  };

  const triggerLabel =
    label ??
    (mode === 'single'
      ? preference.incomeCurrency
      : preference.incomeCurrency === preference.expenseCurrency
      ? preference.incomeCurrency
      : `${preference.incomeCurrency} / ${preference.expenseCurrency}`);

  return (
    <TooltipProvider>
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs font-medium px-2.5"
                data-testid="button-currency-switcher"
              >
                <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{triggerLabel}</span>
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
                {!isDefault && (
                  <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-amber-500" />
                )}
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="text-xs">Change display currency for income and expenses</p>
          </TooltipContent>
        </Tooltip>

        <PopoverContent className="w-72 p-4" align="end" data-testid="popover-currency-switcher">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Currency Display</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Choose how amounts are shown
                </p>
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-52">
                    <p className="text-xs">
                      Amounts are converted using approximate exchange rates. For accurate
                      rates, see the Exchange Rates page.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            <Separator />

            {mode === 'split' ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5 text-green-600" />
                    <label className="text-xs font-medium text-green-700 dark:text-green-400">
                      Income / Budget Currency
                    </label>
                  </div>
                  <Select value={preference.incomeCurrency} onValueChange={handleIncomeChange}>
                    <SelectTrigger
                      className="h-8 text-xs"
                      data-testid="select-income-currency"
                    >
                      <SelectValue>
                        <span className="flex items-center gap-1.5">
                          <span>{incomeCurrency?.flag}</span>
                          <span>
                            {incomeCurrency?.code} – {incomeCurrency?.name}
                          </span>
                        </span>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPORTED_CURRENCIES.map(c => (
                        <SelectItem key={c.code} value={c.code} className="text-xs">
                          <span className="flex items-center gap-1.5">
                            <span>{c.flag}</span>
                            <span className="font-mono font-medium w-9">{c.code}</span>
                            <span className="text-muted-foreground">{c.name}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <TrendingDown className="h-3.5 w-3.5 text-rose-600" />
                    <label className="text-xs font-medium text-rose-700 dark:text-rose-400">
                      Expense Currency
                    </label>
                  </div>
                  <Select value={preference.expenseCurrency} onValueChange={handleExpenseChange}>
                    <SelectTrigger
                      className="h-8 text-xs"
                      data-testid="select-expense-currency"
                    >
                      <SelectValue>
                        <span className="flex items-center gap-1.5">
                          <span>{expenseCurrency?.flag}</span>
                          <span>
                            {expenseCurrency?.code} – {expenseCurrency?.name}
                          </span>
                        </span>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPORTED_CURRENCIES.map(c => (
                        <SelectItem key={c.code} value={c.code} className="text-xs">
                          <span className="flex items-center gap-1.5">
                            <span>{c.flag}</span>
                            <span className="font-mono font-medium w-9">{c.code}</span>
                            <span className="text-muted-foreground">{c.name}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Display Currency</label>
                <Select value={preference.incomeCurrency} onValueChange={c => { handleIncomeChange(c); handleExpenseChange(c); }}>
                  <SelectTrigger className="h-8 text-xs" data-testid="select-display-currency">
                    <SelectValue>
                      <span className="flex items-center gap-1.5">
                        <span>{incomeCurrency?.flag}</span>
                        <span>{incomeCurrency?.code} – {incomeCurrency?.name}</span>
                      </span>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_CURRENCIES.map(c => (
                      <SelectItem key={c.code} value={c.code} className="text-xs">
                        <span className="flex items-center gap-1.5">
                          <span>{c.flag}</span>
                          <span className="font-mono font-medium w-9">{c.code}</span>
                          <span className="text-muted-foreground">{c.name}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <Separator />

            <div className="flex items-center justify-between">
              <div className="flex flex-wrap gap-1">
                {preference.incomeCurrency !== preference.expenseCurrency && mode === 'split' ? (
                  <>
                    <Badge variant="outline" className="text-[10px] py-0 px-1.5 text-green-700 border-green-300">
                      In: {preference.incomeCurrency}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] py-0 px-1.5 text-rose-700 border-rose-300">
                      Ex: {preference.expenseCurrency}
                    </Badge>
                  </>
                ) : (
                  <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                    {preference.incomeCurrency}
                  </Badge>
                )}
              </div>
              {!isDefault && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs gap-1 text-muted-foreground"
                  onClick={handleReset}
                  data-testid="button-currency-reset"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset
                </Button>
              )}
            </div>

            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Rates are approximate. The system uses live bank rates for SDG ↔ USD where available.
            </p>
          </div>
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}
