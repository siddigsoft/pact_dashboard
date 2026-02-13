import { useState, useCallback } from 'react';
import { X, Plus, Mail } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';

interface EmailCCInputProps {
  ccEmails: string[];
  onChange: (emails: string[]) => void;
  label?: string;
  labelAr?: string;
  placeholder?: string;
  maxEmails?: number;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function EmailCCInput({
  ccEmails,
  onChange,
  label = 'CC',
  labelAr = 'نسخة',
  placeholder = 'Enter email address',
  maxEmails = 10,
}: EmailCCInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState('');

  const addEmail = useCallback(() => {
    const email = inputValue.trim().toLowerCase();
    if (!email) return;

    if (!EMAIL_REGEX.test(email)) {
      setError('Invalid email address / بريد إلكتروني غير صالح');
      return;
    }

    if (ccEmails.includes(email)) {
      setError('Email already added / تمت إضافة البريد مسبقاً');
      return;
    }

    if (ccEmails.length >= maxEmails) {
      setError(`Maximum ${maxEmails} CC recipients / الحد الأقصى ${maxEmails} مستلمين`);
      return;
    }

    setError('');
    onChange([...ccEmails, email]);
    setInputValue('');
  }, [inputValue, ccEmails, onChange, maxEmails]);

  const removeEmail = useCallback((email: string) => {
    onChange(ccEmails.filter(e => e !== email));
  }, [ccEmails, onChange]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addEmail();
    }
  };

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium flex items-center gap-1.5">
        <Mail className="h-3.5 w-3.5 text-muted-foreground" />
        {label}
        <span dir="rtl" className="text-xs text-muted-foreground">/ {labelAr}</span>
        <span className="text-xs text-muted-foreground ml-auto">({ccEmails.length})</span>
      </Label>

      <div className="flex gap-1.5">
        <Input
          type="email"
          value={inputValue}
          onChange={(e) => { setInputValue(e.target.value); setError(''); }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 h-8 text-sm"
          data-testid="input-cc-email"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={addEmail}
          disabled={!inputValue.trim()}
          className="h-8 px-2"
          data-testid="button-add-cc"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      {ccEmails.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {ccEmails.map((email) => (
            <Badge
              key={email}
              variant="secondary"
              className="text-xs py-0.5 px-2 flex items-center gap-1"
            >
              {email}
              <button
                type="button"
                onClick={() => removeEmail(email)}
                className="ml-0.5 hover:text-destructive transition-colors"
                data-testid={`button-remove-cc-${email}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
