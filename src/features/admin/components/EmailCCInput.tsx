import { useState, useCallback } from 'react';
import { X, Plus, Mail, UserPlus, Users } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';

interface ContactOption {
  id: string;
  email: string;
  name: string;
  role?: string;
}

interface EmailCCInputProps {
  ccEmails: string[];
  onChange: (emails: string[]) => void;
  contacts?: ContactOption[];
  label?: string;
  labelAr?: string;
  placeholder?: string;
  maxEmails?: number;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function EmailCCInput({
  ccEmails,
  onChange,
  contacts = [],
  label = 'CC',
  labelAr = 'نسخة',
  placeholder = 'Enter email address',
  maxEmails = 20,
}: EmailCCInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState('');
  const [showContacts, setShowContacts] = useState(false);

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

  const toggleContact = useCallback((email: string) => {
    const emailLower = email.toLowerCase();
    if (ccEmails.includes(emailLower)) {
      onChange(ccEmails.filter(e => e !== emailLower));
    } else {
      if (ccEmails.length >= maxEmails) return;
      onChange([...ccEmails, emailLower]);
    }
  }, [ccEmails, onChange, maxEmails]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addEmail();
    }
  };

  const selectAllContacts = useCallback(() => {
    const allContactEmails = contacts.map(c => c.email.toLowerCase());
    const merged = Array.from(new Set([...ccEmails, ...allContactEmails])).slice(0, maxEmails);
    onChange(merged);
  }, [contacts, ccEmails, onChange, maxEmails]);

  const deselectAllContacts = useCallback(() => {
    const contactEmailSet = new Set(contacts.map(c => c.email.toLowerCase()));
    onChange(ccEmails.filter(e => !contactEmailSet.has(e)));
  }, [contacts, ccEmails, onChange]);

  const contactsInCC = contacts.filter(c => ccEmails.includes(c.email.toLowerCase())).length;
  const manualEmails = ccEmails.filter(e => !contacts.some(c => c.email.toLowerCase() === e));

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium flex items-center gap-1.5">
        <Mail className="h-3.5 w-3.5 text-muted-foreground" />
        {label}
        <span dir="rtl" className="text-xs text-muted-foreground">/ {labelAr}</span>
        <span className="text-xs text-muted-foreground ml-auto">({ccEmails.length})</span>
      </Label>

      {contacts.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowContacts(!showContacts)}
              className="text-xs text-primary hover:underline flex items-center gap-1"
              data-testid="button-toggle-cc-contacts"
            >
              <Users className="h-3 w-3" />
              {showContacts ? 'Hide contacts / إخفاء جهات الاتصال' : 'Select from contacts / اختر من جهات الاتصال'}
              {contactsInCC > 0 && <Badge variant="secondary" className="text-[10px] px-1 py-0 ml-1">{contactsInCC} selected</Badge>}
            </button>
            {showContacts && (
              <div className="flex gap-2">
                <button type="button" onClick={selectAllContacts} className="text-[11px] text-primary hover:underline" data-testid="button-cc-select-all">Select All</button>
                <button type="button" onClick={deselectAllContacts} className="text-[11px] text-muted-foreground hover:underline" data-testid="button-cc-deselect-all">Deselect All</button>
              </div>
            )}
          </div>

          {showContacts && (
            <div className="max-h-[140px] overflow-y-auto border rounded-md divide-y bg-background">
              {contacts.map((contact) => {
                const isSelected = ccEmails.includes(contact.email.toLowerCase());
                return (
                  <label
                    key={contact.id}
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/50 cursor-pointer transition-colors"
                    data-testid={`cc-contact-${contact.id}`}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleContact(contact.email)}
                      className="h-3.5 w-3.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{contact.name}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{contact.email}</div>
                    </div>
                    {contact.role && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">{contact.role}</Badge>
                    )}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-1.5">
        <UserPlus className="h-3 w-3 text-muted-foreground shrink-0" />
        <span className="text-[11px] text-muted-foreground">Add email manually / إضافة بريد يدوياً</span>
      </div>
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

      {manualEmails.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {manualEmails.map((email) => (
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
