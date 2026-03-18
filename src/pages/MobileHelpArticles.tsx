import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { 
  BookOpen, 
  Plus, 
  Edit, 
  Trash2, 
  Search,
  Eye,
  EyeOff,
  Globe,
  Smartphone,
  FileText,
  Layers,
  ArrowUpDown,
  GripVertical,
  Languages,
  CheckCircle,
  XCircle,
  Copy,
  ExternalLink,
  RefreshCw
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
  { id: 'getting_started', label: 'Getting Started', icon: BookOpen, color: 'bg-blue-500' },
  { id: 'site_visits', label: 'Site Visits', icon: Globe, color: 'bg-green-500' },
  { id: 'data_collection', label: 'Data Collection', icon: FileText, color: 'bg-purple-500' },
  { id: 'troubleshooting', label: 'Troubleshooting', icon: XCircle, color: 'bg-red-500' },
  { id: 'account', label: 'Account', icon: Smartphone, color: 'bg-orange-500' },
  { id: 'offline_mode', label: 'Offline Mode', icon: Globe, color: 'bg-cyan-500' },
  { id: 'signatures', label: 'Signatures', icon: Edit, color: 'bg-pink-500' },
  { id: 'documents', label: 'Documents', icon: FileText, color: 'bg-indigo-500' },
  { id: 'calls', label: 'Calls', icon: Smartphone, color: 'bg-teal-500' },
  { id: 'chat', label: 'Chat', icon: BookOpen, color: 'bg-amber-500' },
];

export default function MobileHelpArticles() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<HelpArticle | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [previewLang, setPreviewLang] = useState<'en' | 'ar'>('en');
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

  const { data: articles = [], isLoading, refetch } = useQuery({
    queryKey: ['help-articles', categoryFilter, platformFilter],
    queryFn: async () => {
      let query = supabase
        .from('help_articles')
        .select('*')
        .order('category', { ascending: true })
        .order('order_index', { ascending: true });

      if (categoryFilter !== 'all') {
        query = query.eq('category', categoryFilter);
      }
      if (platformFilter !== 'all') {
        query = query.eq('target_platform', platformFilter);
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
      toast({ title: 'Article created', description: 'Help article has been created successfully.' });
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
      toast({ title: 'Article updated', description: 'Help article has been updated successfully.' });
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

  const togglePublishMutation = useMutation({
    mutationFn: async ({ id, is_published }: { id: string; is_published: boolean }) => {
      const { error } = await supabase
        .from('help_articles')
        .update({ is_published, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['help-articles'] });
      toast({ title: 'Status updated', description: 'Article visibility has been updated.' });
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

  const getCategoryConfig = (categoryId: string) => {
    return CATEGORIES.find(c => c.id === categoryId) || CATEGORIES[0];
  };

  const stats = {
    total: articles.length,
    published: articles.filter((a: HelpArticle) => a.is_published).length,
    draft: articles.filter((a: HelpArticle) => !a.is_published).length,
    mobile: articles.filter((a: HelpArticle) => a.target_platform === 'mobile' || a.target_platform === 'all').length,
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20" data-testid="mobile-help-articles-page">
      <div className="bg-gradient-to-r from-emerald-600 via-emerald-700 to-teal-800 text-white">
        <div className="container mx-auto px-6 py-8">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-white/10 rounded-lg backdrop-blur-sm">
                  <BookOpen className="w-6 h-6" />
                </div>
                <h1 className="text-3xl font-bold" data-testid="text-page-title">Mobile Help Articles</h1>
              </div>
              <p className="text-emerald-100">Create and manage bilingual help content for mobile app users</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => refetch()} variant="secondary" className="bg-white/10 hover:bg-white/20 text-white border-0">
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
              <Dialog open={isDialogOpen} onOpenChange={(open) => {
                setIsDialogOpen(open);
                if (!open) {
                  setEditingArticle(null);
                  resetForm();
                }
              }}>
                <DialogTrigger asChild>
                  <Button className="bg-white text-emerald-700 hover:bg-white/90" data-testid="button-create-article">
                    <Plus className="w-4 h-4 mr-2" />
                    New Article
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Languages className="w-5 h-5" />
                      {editingArticle ? 'Edit Article' : 'Create New Article'}
                    </DialogTitle>
                    <DialogDescription>
                      Create bilingual help content that will be displayed in the mobile app
                    </DialogDescription>
                  </DialogHeader>
                  
                  <Tabs defaultValue="english" className="mt-4">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="english">English Content</TabsTrigger>
                      <TabsTrigger value="arabic">Arabic Content</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="english" className="space-y-4 mt-4">
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
                        <Label>Content (English)</Label>
                        <Textarea
                          value={formData.content_en}
                          onChange={(e) => setFormData({ ...formData, content_en: e.target.value })}
                          placeholder="Enter article content in English. You can use markdown formatting..."
                          rows={10}
                          className="font-mono text-sm"
                          data-testid="textarea-content-en"
                        />
                      </div>
                    </TabsContent>
                    
                    <TabsContent value="arabic" className="space-y-4 mt-4">
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
                      <div className="space-y-2">
                        <Label>Content (Arabic)</Label>
                        <Textarea
                          value={formData.content_ar}
                          onChange={(e) => setFormData({ ...formData, content_ar: e.target.value })}
                          placeholder="أدخل محتوى المقال بالعربية..."
                          rows={10}
                          dir="rtl"
                          className="font-mono text-sm"
                          data-testid="textarea-content-ar"
                        />
                      </div>
                    </TabsContent>
                  </Tabs>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 p-4 bg-muted/50 rounded-lg">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Category</Label>
                      <Select
                        value={formData.category}
                        onValueChange={(value) => setFormData({ ...formData, category: value })}
                      >
                        <SelectTrigger data-testid="select-category">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.map((cat) => (
                            <SelectItem key={cat.id} value={cat.id}>
                              <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${cat.color}`} />
                                {cat.label}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Platform</Label>
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
                      <Label className="text-xs text-muted-foreground">Display Order</Label>
                      <Input
                        type="number"
                        value={formData.order_index}
                        onChange={(e) => setFormData({ ...formData, order_index: parseInt(e.target.value) || 0 })}
                        data-testid="input-order"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Visibility</Label>
                      <div className="flex items-center gap-2 h-10">
                        <Switch
                          checked={formData.is_published}
                          onCheckedChange={(checked) => setFormData({ ...formData, is_published: checked })}
                          data-testid="switch-published"
                        />
                        <span className="text-sm">{formData.is_published ? 'Published' : 'Draft'}</span>
                      </div>
                    </div>
                  </div>

                  <DialogFooter className="mt-6">
                    <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSubmit}
                      disabled={!formData.title_en || !formData.content_en || createMutation.isPending || updateMutation.isPending}
                      data-testid="button-save-article"
                    >
                      {createMutation.isPending || updateMutation.isPending ? (
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      ) : null}
                      {editingArticle ? 'Update Article' : 'Create Article'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/10 rounded-lg">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.total}</p>
                  <p className="text-sm text-emerald-100">Total Articles</p>
                </div>
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-400/20 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-emerald-300" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.published}</p>
                  <p className="text-sm text-emerald-100">Published</p>
                </div>
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/20 rounded-lg">
                  <EyeOff className="w-5 h-5 text-amber-300" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.draft}</p>
                  <p className="text-sm text-emerald-100">Drafts</p>
                </div>
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/20 rounded-lg">
                  <Smartphone className="w-5 h-5 text-blue-300" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.mobile}</p>
                  <p className="text-sm text-emerald-100">Mobile Available</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-6">
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="flex-1 min-w-[280px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search articles by title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-11"
                data-testid="input-search"
              />
            </div>
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[180px] h-11" data-testid="select-category-filter">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {CATEGORIES.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${cat.color}`} />
                    {cat.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={platformFilter} onValueChange={setPlatformFilter}>
            <SelectTrigger className="w-[150px] h-11">
              <SelectValue placeholder="Platform" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Platforms</SelectItem>
              <SelectItem value="mobile">Mobile Only</SelectItem>
              <SelectItem value="web">Web Only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i} className="p-4">
                <div className="space-y-3">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-16 w-full" />
                  <div className="flex gap-2">
                    <Skeleton className="h-6 w-20" />
                    <Skeleton className="h-6 w-16" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : Object.keys(groupedArticles).length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-16 text-center text-muted-foreground">
              <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
                <BookOpen className="w-8 h-8 opacity-50" />
              </div>
              <p className="font-medium mb-1">No help articles found</p>
              <p className="text-sm mb-4">Create your first article to get started</p>
              <Button onClick={() => setIsDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Article
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            {Object.entries(groupedArticles).map(([category, categoryArticles]) => {
              const categoryConfig = getCategoryConfig(category);
              const CategoryIcon = categoryConfig.icon;
              
              return (
                <div key={category}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-8 h-8 rounded-lg ${categoryConfig.color} flex items-center justify-center`}>
                      <CategoryIcon className="w-4 h-4 text-white" />
                    </div>
                    <h2 className="text-lg font-semibold">{categoryConfig.label}</h2>
                    <Badge variant="secondary" className="ml-auto">
                      {(categoryArticles as HelpArticle[]).length} articles
                    </Badge>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {(categoryArticles as HelpArticle[]).map((article) => (
                      <Card key={article.id} className="group hover:shadow-md transition-all" data-testid={`card-article-${article.id}`}>
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <CardTitle className="text-base line-clamp-1">{article.title_en}</CardTitle>
                              <CardDescription className="text-xs mt-1 line-clamp-1" dir="rtl">
                                {article.title_ar || 'No Arabic title'}
                              </CardDescription>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8"
                              onClick={() => togglePublishMutation.mutate({ id: article.id, is_published: !article.is_published })}
                            >
                              {article.is_published ? (
                                <Eye className="w-4 h-4 text-emerald-500" />
                              ) : (
                                <EyeOff className="w-4 h-4 text-muted-foreground" />
                              )}
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <p className="text-sm text-muted-foreground line-clamp-3 min-h-[60px]">
                            {article.content_en.substring(0, 150)}...
                          </p>
                          
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant={article.is_published ? "default" : "secondary"} className={article.is_published ? "bg-emerald-500" : ""}>
                              {article.is_published ? 'Published' : 'Draft'}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {article.target_platform === 'mobile' ? (
                                <><Smartphone className="w-3 h-3 mr-1" />Mobile</>
                              ) : article.target_platform === 'web' ? (
                                <><Globe className="w-3 h-3 mr-1" />Web</>
                              ) : (
                                'All Platforms'
                              )}
                            </Badge>
                            <Badge variant="outline" className="text-xs ml-auto">
                              #{article.order_index}
                            </Badge>
                          </div>
                          
                          <div className="flex items-center gap-2 pt-2 border-t">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openEditDialog(article)}
                              className="flex-1"
                              data-testid={`button-edit-${article.id}`}
                            >
                              <Edit className="w-3 h-3 mr-1" />
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                navigator.clipboard.writeText(article.id);
                                toast({ title: 'Copied', description: 'Article ID copied to clipboard' });
                              }}
                            >
                              <Copy className="w-3 h-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => {
                                toast({
                                  title: 'Delete this article?',
                                  description: 'This action cannot be undone.',
                                  variant: 'destructive',
                                  action: <ToastAction altText="Confirm deletion" onClick={() => deleteMutation.mutate(article.id)}>Delete</ToastAction>,
                                });
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
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
