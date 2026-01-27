import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { 
  BookOpen, 
  Plus, 
  Edit, 
  Trash2, 
  Search,
  Eye,
  EyeOff,
  Globe,
  Smartphone
} from 'lucide-react';

interface HelpArticle {
  id: string;
  title_en: string;
  title_ar: string;
  content_en: string;
  content_ar: string;
  category: string;
  order_index: number;
  is_published: boolean;
  target_platform: 'all' | 'mobile' | 'web';
  created_at: string;
  updated_at: string;
}

const CATEGORIES = [
  'getting_started',
  'site_visits',
  'data_collection',
  'troubleshooting',
  'account',
  'offline_mode',
  'signatures',
  'documents',
  'calls',
  'chat'
];

export default function MobileHelpArticles() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<HelpArticle | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    title_en: '',
    title_ar: '',
    content_en: '',
    content_ar: '',
    category: 'getting_started',
    order_index: 0,
    is_published: false,
    target_platform: 'all' as 'all' | 'mobile' | 'web',
  });

  const { data: articles = [], isLoading } = useQuery({
    queryKey: ['help-articles', categoryFilter],
    queryFn: async () => {
      let query = supabase
        .from('help_articles')
        .select('*')
        .order('category', { ascending: true })
        .order('order_index', { ascending: true });

      if (categoryFilter !== 'all') {
        query = query.eq('category', categoryFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase.from('help_articles').insert([data]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['help-articles'] });
      setIsDialogOpen(false);
      resetForm();
      toast({ title: 'Article created', description: 'Help article has been created.' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const { error } = await supabase
        .from('help_articles')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['help-articles'] });
      setIsDialogOpen(false);
      setEditingArticle(null);
      resetForm();
      toast({ title: 'Article updated', description: 'Help article has been updated.' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('help_articles').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['help-articles'] });
      toast({ title: 'Article deleted', description: 'Help article has been deleted.' });
    },
  });

  const resetForm = () => {
    setFormData({
      title_en: '',
      title_ar: '',
      content_en: '',
      content_ar: '',
      category: 'getting_started',
      order_index: 0,
      is_published: false,
      target_platform: 'all',
    });
  };

  const openEditDialog = (article: HelpArticle) => {
    setEditingArticle(article);
    setFormData({
      title_en: article.title_en,
      title_ar: article.title_ar,
      content_en: article.content_en,
      content_ar: article.content_ar,
      category: article.category,
      order_index: article.order_index,
      is_published: article.is_published,
      target_platform: article.target_platform,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (editingArticle) {
      updateMutation.mutate({ id: editingArticle.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const filteredArticles = articles.filter((a: HelpArticle) =>
    a.title_en.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.title_ar.includes(searchQuery)
  );

  const groupedArticles = filteredArticles.reduce((acc: Record<string, HelpArticle[]>, article: HelpArticle) => {
    if (!acc[article.category]) acc[article.category] = [];
    acc[article.category].push(article);
    return acc;
  }, {});

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="mobile-help-articles-page">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Mobile Help Articles</h1>
          <p className="text-muted-foreground">Manage help content for mobile app users</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) {
            setEditingArticle(null);
            resetForm();
          }
        }}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-article">
              <Plus className="w-4 h-4 mr-2" />
              New Article
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingArticle ? 'Edit Article' : 'Create New Article'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Title (English)</Label>
                  <Input
                    value={formData.title_en}
                    onChange={(e) => setFormData({ ...formData, title_en: e.target.value })}
                    placeholder="Enter English title"
                    data-testid="input-title-en"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Title (Arabic)</Label>
                  <Input
                    value={formData.title_ar}
                    onChange={(e) => setFormData({ ...formData, title_ar: e.target.value })}
                    placeholder="أدخل العنوان بالعربية"
                    dir="rtl"
                    data-testid="input-title-ar"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Content (English)</Label>
                <Textarea
                  value={formData.content_en}
                  onChange={(e) => setFormData({ ...formData, content_en: e.target.value })}
                  placeholder="Enter article content in English..."
                  rows={6}
                  data-testid="textarea-content-en"
                />
              </div>
              <div className="space-y-2">
                <Label>Content (Arabic)</Label>
                <Textarea
                  value={formData.content_ar}
                  onChange={(e) => setFormData({ ...formData, content_ar: e.target.value })}
                  placeholder="أدخل محتوى المقال بالعربية..."
                  rows={6}
                  dir="rtl"
                  data-testid="textarea-content-ar"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value) => setFormData({ ...formData, category: value })}
                  >
                    <SelectTrigger data-testid="select-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Target Platform</Label>
                  <Select
                    value={formData.target_platform}
                    onValueChange={(value: 'all' | 'mobile' | 'web') => setFormData({ ...formData, target_platform: value })}
                  >
                    <SelectTrigger data-testid="select-platform">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Platforms</SelectItem>
                      <SelectItem value="mobile">Mobile Only</SelectItem>
                      <SelectItem value="web">Web Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Order Index</Label>
                  <Input
                    type="number"
                    value={formData.order_index}
                    onChange={(e) => setFormData({ ...formData, order_index: parseInt(e.target.value) || 0 })}
                    data-testid="input-order"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.is_published}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_published: checked })}
                  data-testid="switch-published"
                />
                <Label>Published (visible to users)</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!formData.title_en || !formData.content_en || createMutation.isPending || updateMutation.isPending}
                data-testid="button-save-article"
              >
                {editingArticle ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="Search articles..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-search"
            />
          </div>
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-category-filter">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <p>Loading articles...</p>
      ) : Object.keys(groupedArticles).length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No help articles found</p>
            <p className="text-sm">Create your first article to get started</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedArticles).map(([category, categoryArticles]) => (
            <div key={category}>
              <h2 className="text-lg font-semibold mb-3 capitalize">
                {category.replace(/_/g, ' ')}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {(categoryArticles as HelpArticle[]).map((article) => (
                  <Card key={article.id} data-testid={`card-article-${article.id}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base">{article.title_en}</CardTitle>
                        <div className="flex items-center gap-1">
                          {article.is_published ? (
                            <Eye className="w-4 h-4 text-green-500" />
                          ) : (
                            <EyeOff className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                      <CardDescription className="text-xs" dir="rtl">
                        {article.title_ar}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {article.content_en.substring(0, 100)}...
                      </p>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          {article.target_platform === 'mobile' ? (
                            <><Smartphone className="w-3 h-3 mr-1" />Mobile</>
                          ) : article.target_platform === 'web' ? (
                            <><Globe className="w-3 h-3 mr-1" />Web</>
                          ) : (
                            'All'
                          )}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          Order: {article.order_index}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 pt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEditDialog(article)}
                          data-testid={`button-edit-${article.id}`}
                        >
                          <Edit className="w-3 h-3 mr-1" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            if (confirm('Are you sure you want to delete this article?')) {
                              deleteMutation.mutate(article.id);
                            }
                          }}
                          data-testid={`button-delete-${article.id}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
