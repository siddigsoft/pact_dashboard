import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useAppContext } from "@/context/AppContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Phone,
  Mail,
  MessageCircle,
  UserPlus,
  Users,
  RefreshCw,
  Shield,
} from "lucide-react";

interface SupportContact {
  id: string;
  name: string;
  name_ar: string | null;
  role: string | null;
  role_ar: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  avatar_url: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

interface ContactFormData {
  name: string;
  name_ar: string;
  role: string;
  role_ar: string;
  email: string;
  phone: string;
  whatsapp: string;
  is_active: boolean;
}

export default function SupportContacts() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentUser, hasRole, roles } = useAppContext();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<SupportContact | null>(null);
  const [formData, setFormData] = useState<ContactFormData>({
    name: "",
    name_ar: "",
    role: "",
    role_ar: "",
    email: "",
    phone: "",
    whatsapp: "",
    is_active: true,
  });

  const isAdmin = hasRole("admin") || hasRole("super_admin");

  const { data: contacts = [], isLoading, refetch } = useQuery({
    queryKey: ["support-contacts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_contacts")
        .select("*")
        .order("sort_order", { ascending: true });

      if (error) throw error;
      return data as SupportContact[];
    },
    enabled: !!currentUser,
  });

  const addContactMutation = useMutation({
    mutationFn: async (data: ContactFormData) => {
      if (!isAdmin) throw new Error("Unauthorized: Admin access required");
      const { error } = await supabase.from("support_contacts").insert({
        name: data.name,
        name_ar: data.name_ar || null,
        role: data.role || null,
        role_ar: data.role_ar || null,
        email: data.email || null,
        phone: data.phone || null,
        whatsapp: data.whatsapp || null,
        is_active: data.is_active,
        sort_order: contacts.length + 1,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["support-contacts"] });
      toast({ title: "Contact added successfully" });
      setIsAddDialogOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: "Error adding contact", description: error.message, variant: "destructive" });
    },
  });

  const updateContactMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ContactFormData }) => {
      if (!isAdmin) throw new Error("Unauthorized: Admin access required");
      const { error } = await supabase
        .from("support_contacts")
        .update({
          name: data.name,
          name_ar: data.name_ar || null,
          role: data.role || null,
          role_ar: data.role_ar || null,
          email: data.email || null,
          phone: data.phone || null,
          whatsapp: data.whatsapp || null,
          is_active: data.is_active,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["support-contacts"] });
      toast({ title: "Contact updated successfully" });
      setEditingContact(null);
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: "Error updating contact", description: error.message, variant: "destructive" });
    },
  });

  const deleteContactMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!isAdmin) throw new Error("Unauthorized: Admin access required");
      const { error } = await supabase.from("support_contacts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["support-contacts"] });
      toast({ title: "Contact deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error deleting contact", description: error.message, variant: "destructive" });
    },
  });

  const toggleActiveStatus = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      if (!isAdmin) throw new Error("Unauthorized: Admin access required");
      const { error } = await supabase
        .from("support_contacts")
        .update({ is_active: isActive, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["support-contacts"] });
      toast({ title: "Contact status updated" });
    },
  });

  if (!currentUser) {
    return (
      <div className="container mx-auto py-6 flex justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="container mx-auto py-6">
        <Alert>
          <Shield className="h-4 w-4" />
          <AlertDescription>
            You don't have permission to access support contact management. This page is restricted to administrators.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const resetForm = () => {
    setFormData({
      name: "",
      name_ar: "",
      role: "",
      role_ar: "",
      email: "",
      phone: "",
      whatsapp: "",
      is_active: true,
    });
  };

  const handleEdit = (contact: SupportContact) => {
    setEditingContact(contact);
    setFormData({
      name: contact.name,
      name_ar: contact.name_ar || "",
      role: contact.role || "",
      role_ar: contact.role_ar || "",
      email: contact.email || "",
      phone: contact.phone || "",
      whatsapp: contact.whatsapp || "",
      is_active: contact.is_active,
    });
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }

    if (editingContact) {
      updateContactMutation.mutate({ id: editingContact.id, data: formData });
    } else {
      addContactMutation.mutate(formData);
    }
  };

  const activeContacts = contacts.filter((c) => c.is_active).length;
  const totalContacts = contacts.length;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="page-title">Support Contacts</h1>
          <p className="text-muted-foreground">
            Manage support contacts for web and mobile applications
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-contact">
                <Plus className="h-4 w-4 mr-2" />
                Add Contact
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add Support Contact</DialogTitle>
              </DialogHeader>
              <ContactForm
                formData={formData}
                setFormData={setFormData}
                onSubmit={handleSubmit}
                isSubmitting={addContactMutation.isPending}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="stat-total">{totalContacts}</p>
                <p className="text-sm text-muted-foreground">Total Contacts</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-100 dark:bg-green-900 rounded-lg">
                <UserPlus className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="stat-active">{activeContacts}</p>
                <p className="text-sm text-muted-foreground">Active Contacts</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-orange-100 dark:bg-orange-900 rounded-lg">
                <Phone className="h-6 w-6 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="stat-inactive">{totalContacts - activeContacts}</p>
                <p className="text-sm text-muted-foreground">Inactive Contacts</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Support Team</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : contacts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No support contacts yet</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setIsAddDialogOpen(true)}
                data-testid="button-add-first-contact"
              >
                Add your first contact
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Contact Info</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((contact) => (
                  <TableRow key={contact.id} data-testid={`contact-row-${contact.id}`}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{contact.name}</p>
                        {contact.name_ar && (
                          <p className="text-sm text-muted-foreground" dir="rtl">
                            {contact.name_ar}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p>{contact.role || "-"}</p>
                        {contact.role_ar && (
                          <p className="text-sm text-muted-foreground" dir="rtl">
                            {contact.role_ar}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {contact.email && (
                          <div className="flex items-center gap-1 text-sm">
                            <Mail className="h-3 w-3" />
                            <span>{contact.email}</span>
                          </div>
                        )}
                        {contact.phone && (
                          <div className="flex items-center gap-1 text-sm">
                            <Phone className="h-3 w-3" />
                            <span>{contact.phone}</span>
                          </div>
                        )}
                        {contact.whatsapp && (
                          <div className="flex items-center gap-1 text-sm text-green-600">
                            <MessageCircle className="h-3 w-3" />
                            <span>{contact.whatsapp}</span>
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={contact.is_active}
                          onCheckedChange={(checked) =>
                            toggleActiveStatus.mutate({ id: contact.id, isActive: checked })
                          }
                          data-testid={`toggle-active-${contact.id}`}
                        />
                        <Badge variant={contact.is_active ? "default" : "secondary"}>
                          {contact.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" data-testid={`menu-${contact.id}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(contact)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => {
                              if (confirm("Are you sure you want to delete this contact?")) {
                                deleteContactMutation.mutate(contact.id);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editingContact} onOpenChange={(open) => !open && setEditingContact(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Support Contact</DialogTitle>
          </DialogHeader>
          <ContactForm
            formData={formData}
            setFormData={setFormData}
            onSubmit={handleSubmit}
            isSubmitting={updateContactMutation.isPending}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ContactForm({
  formData,
  setFormData,
  onSubmit,
  isSubmitting,
}: {
  formData: ContactFormData;
  setFormData: (data: ContactFormData) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">Name (English) *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g., Technical Support"
            data-testid="input-name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="name_ar">Name (Arabic)</Label>
          <Input
            id="name_ar"
            value={formData.name_ar}
            onChange={(e) => setFormData({ ...formData, name_ar: e.target.value })}
            placeholder="الدعم الفني"
            dir="rtl"
            data-testid="input-name-ar"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="role">Role (English)</Label>
          <Input
            id="role"
            value={formData.role}
            onChange={(e) => setFormData({ ...formData, role: e.target.value })}
            placeholder="e.g., IT Support Team"
            data-testid="input-role"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="role_ar">Role (Arabic)</Label>
          <Input
            id="role_ar"
            value={formData.role_ar}
            onChange={(e) => setFormData({ ...formData, role_ar: e.target.value })}
            placeholder="فريق الدعم التقني"
            dir="rtl"
            data-testid="input-role-ar"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          placeholder="support@example.com"
          data-testid="input-email"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Phone</Label>
        <Input
          id="phone"
          type="tel"
          value={formData.phone}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          placeholder="+249123456789"
          data-testid="input-phone"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="whatsapp">WhatsApp Number</Label>
        <Input
          id="whatsapp"
          type="tel"
          value={formData.whatsapp}
          onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
          placeholder="+249123456789"
          data-testid="input-whatsapp"
        />
      </div>

      <div className="flex items-center space-x-2">
        <Switch
          id="is_active"
          checked={formData.is_active}
          onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
          data-testid="switch-active"
        />
        <Label htmlFor="is_active">Active</Label>
      </div>

      <Button
        onClick={onSubmit}
        disabled={isSubmitting}
        className="w-full"
        data-testid="button-submit"
      >
        {isSubmitting ? "Saving..." : "Save Contact"}
      </Button>
    </div>
  );
}
