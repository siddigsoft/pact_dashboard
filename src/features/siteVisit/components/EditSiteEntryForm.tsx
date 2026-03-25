
import React from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface SiteEntry {
  id: string;
  siteCode: string;
  siteName: string;
  inMoDa: boolean;
  visitedBy: string;
  mainActivity: string;
  visitDate: string;
  status: string;
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

interface EditSiteEntryFormProps {
  siteEntry: SiteEntry;
  onSave: (siteId: string, updatedData: Partial<SiteEntry>) => void;
  onCancel: () => void;
}

const EditSiteEntryForm: React.FC<EditSiteEntryFormProps> = ({
  siteEntry,
  onSave,
  onCancel
}) => {
  const [formData, setFormData] = React.useState<SiteEntry>({
    ...siteEntry,
    permitDetails: siteEntry.permitDetails || {
      federal: false,
      state: false,
      local: false
    }
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handlePermitChange = (permitType: 'federal' | 'state' | 'local', checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      permitDetails: {
        ...prev.permitDetails!,
        [permitType]: checked,
        lastVerified: checked ? new Date().toISOString() : prev.permitDetails?.lastVerified,
        verifiedBy: checked ? 'current-user' : prev.permitDetails?.verifiedBy
      }
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(siteEntry.id, formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4 border rounded-md bg-background">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="siteCode">Site Code</Label>
          <Input
            id="siteCode"
            name="siteCode"
            value={formData.siteCode}
            onChange={handleInputChange}
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="siteName">Site Name</Label>
          <Input
            id="siteName"
            name="siteName"
            value={formData.siteName}
            onChange={handleInputChange}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="mainActivity">Main Activity</Label>
          <Input
            id="mainActivity"
            name="mainActivity"
            value={formData.mainActivity}
            onChange={handleInputChange}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="visitDate">Visit Date</Label>
          <Input
            id="visitDate"
            name="visitDate"
            type="date"
            value={formData.visitDate}
            onChange={handleInputChange}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="visitedBy">Visited By</Label>
          <Input
            id="visitedBy"
            name="visitedBy"
            value={formData.visitedBy}
            onChange={handleInputChange}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <Input
            id="status"
            name="status"
            value={formData.status}
            onChange={handleInputChange}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Permit Status</Label>
        <div className="grid grid-cols-3 gap-4 mt-2">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="federalPermit"
              checked={formData.permitDetails?.federal}
              onCheckedChange={(checked) => handlePermitChange('federal', checked as boolean)}
            />
            <Label htmlFor="federalPermit">Federal</Label>
          </div>
          
          <div className="flex items-center space-x-2">
            <Checkbox
              id="statePermit"
              checked={formData.permitDetails?.state}
              onCheckedChange={(checked) => handlePermitChange('state', checked as boolean)}
            />
            <Label htmlFor="statePermit">State</Label>
          </div>
          
          <div className="flex items-center space-x-2">
            <Checkbox
              id="localPermit"
              checked={formData.permitDetails?.local}
              onCheckedChange={(checked) => handlePermitChange('local', checked as boolean)}
            />
            <Label htmlFor="localPermit">Local</Label>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          value={formData.description || ''}
          onChange={handleInputChange}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          name="notes"
          value={formData.notes || ''}
          onChange={handleInputChange}
        />
      </div>

      <div className="flex justify-end space-x-2 mt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">
          Save Changes
        </Button>
      </div>
    </form>
  );
};

export default EditSiteEntryForm;
