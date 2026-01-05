import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { TrendingUp, MapPin, Edit3, Check, AlertCircle } from 'lucide-react';
import { type FallbackOption } from '@/services/exchangeRate.service';

interface FallbackOptionsSelectorProps {
  siteName: string;
  options: FallbackOption[];
  onSelect: (option: FallbackOption, manualAmount?: number, justification?: string) => void;
  selectedOptionId?: string;
  exchangeRate?: number;
}

export function FallbackOptionsSelector({
  siteName,
  options,
  onSelect,
  selectedOptionId,
  exchangeRate
}: FallbackOptionsSelectorProps) {
  const [selected, setSelected] = useState<string>(selectedOptionId || '');
  const [manualAmount, setManualAmount] = useState<number>(0);
  const [justification, setJustification] = useState<string>('');

  const handleSelect = (optionId: string) => {
    setSelected(optionId);
    const option = options.find(o => o.id === optionId);
    if (option) {
      if (optionId === 'manual') {
        if (manualAmount > 0 && justification.trim()) {
          onSelect(option, manualAmount, justification);
        }
      } else {
        onSelect(option);
      }
    }
  };

  const handleManualSubmit = () => {
    const option = options.find(o => o.id === 'manual');
    if (option && manualAmount > 0 && justification.trim()) {
      onSelect(option, manualAmount, justification);
    }
  };

  const getOptionIcon = (id: string) => {
    switch (id) {
      case 'algorithm_rate':
        return <TrendingUp className="h-5 w-5 text-amber-600" />;
      case 'locality_median':
        return <MapPin className="h-5 w-5 text-blue-600" />;
      case 'manual':
        return <Edit3 className="h-5 w-5 text-green-600" />;
      default:
        return null;
    }
  };

  const getConfidenceBadge = (confidence?: number) => {
    if (!confidence) return null;
    const variant = confidence >= 70 ? 'default' : confidence >= 50 ? 'secondary' : 'outline';
    return (
      <Badge variant={variant} className="text-xs">
        {confidence}% confidence
      </Badge>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <AlertCircle className="h-4 w-4 text-amber-500" />
        <span className="text-sm font-medium">
          No historical data for "{siteName}"
        </span>
      </div>
      
      <p className="text-xs text-muted-foreground">
        Select a method to estimate transportation cost:
      </p>

      <RadioGroup value={selected} onValueChange={handleSelect}>
        {options.map((option) => (
          <div key={option.id}>
            <Card 
              className={`cursor-pointer transition-all ${
                selected === option.id 
                  ? 'border-primary ring-2 ring-primary/20' 
                  : 'hover-elevate'
              }`}
              onClick={() => handleSelect(option.id)}
            >
              <CardContent className="p-3">
                <div className="flex items-start gap-3">
                  <RadioGroupItem value={option.id} id={option.id} className="mt-1" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {getOptionIcon(option.id)}
                      <Label htmlFor={option.id} className="font-medium cursor-pointer">
                        {option.label}
                      </Label>
                      {getConfidenceBadge(option.confidence)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {option.description}
                    </p>
                    {option.predicted_cost && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-lg font-bold text-primary">
                          {option.predicted_cost.toLocaleString()} SDG
                        </span>
                        {option.exchange_rate_used && (
                          <Badge variant="outline" className="text-xs">
                            @ {option.exchange_rate_used.toFixed(2)} SDG/USD
                          </Badge>
                        )}
                      </div>
                    )}
                    {option.source && option.id !== 'manual' && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Source: {option.source}
                      </div>
                    )}
                  </div>
                  {selected === option.id && option.id !== 'manual' && (
                    <Check className="h-5 w-5 text-primary flex-shrink-0" />
                  )}
                </div>

                {option.id === 'manual' && selected === 'manual' && (
                  <div className="mt-3 pt-3 border-t space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="manual-amount" className="text-xs">
                          Amount (SDG) *
                        </Label>
                        <Input
                          id="manual-amount"
                          type="number"
                          value={manualAmount || ''}
                          onChange={(e) => setManualAmount(parseFloat(e.target.value) || 0)}
                          placeholder="Enter amount"
                          data-testid="input-manual-cost-amount"
                        />
                      </div>
                      <div className="flex items-end">
                        {exchangeRate && (
                          <div className="text-xs text-muted-foreground">
                            ≈ ${(manualAmount / exchangeRate).toFixed(2)} USD
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="manual-justification" className="text-xs">
                        Justification (required for audit) *
                      </Label>
                      <Textarea
                        id="manual-justification"
                        value={justification}
                        onChange={(e) => setJustification(e.target.value)}
                        placeholder="Explain why this amount was chosen..."
                        rows={2}
                        data-testid="textarea-manual-justification"
                      />
                    </div>
                    <Button 
                      size="sm" 
                      onClick={handleManualSubmit}
                      disabled={!manualAmount || !justification.trim()}
                      data-testid="button-apply-manual-cost"
                    >
                      <Check className="h-4 w-4 mr-1" />
                      Apply Manual Cost
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ))}
      </RadioGroup>
    </div>
  );
}
