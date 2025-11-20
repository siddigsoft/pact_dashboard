import React, { useState } from 'react';
import { useArchive } from '@/context/archive/ArchiveContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Download, Eye, Trash2, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { ArchiveDocument } from '@/types';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const ArchiveDocumentList: React.FC = () => {
  const { documents, loading, uploadDocument, deleteDocument } = useArchive();
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [docCategory, setDocCategory] = useState<string>('mmp');
  const [docRelatedId, setDocRelatedId] = useState('');
  const [docDescription, setDocDescription] = useState('');
  const [docRelatedType, setDocRelatedType] = useState<'mmp' | 'siteVisit'>('mmp');
  const [previewDoc, setPreviewDoc] = useState<ArchiveDocument | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };
  
  const handleUpload = async () => {
    if (!selectedFile) return;
    
    const newDoc: Omit<ArchiveDocument, 'id'> = {
      fileName: selectedFile.name,
      fileUrl: URL.createObjectURL(selectedFile),
      fileType: selectedFile.type,
      fileSize: selectedFile.size,
      uploadedBy: 'current-user',
      uploadedAt: new Date().toISOString(),
      category: docCategory as any,
      relatedEntityId: docRelatedId,
      relatedEntityType: docRelatedType,
      description: docDescription
    };
    
    const docId = await uploadDocument(newDoc);
    if (docId) {
      setIsUploadDialogOpen(false);
      resetUploadForm();
    }
  };
  
  const resetUploadForm = () => {
    setSelectedFile(null);
    setDocCategory('mmp');
    setDocRelatedId('');
    setDocDescription('');
    setDocRelatedType('mmp');
  };
  
  const handlePreviewDoc = (doc: ArchiveDocument) => {
    setPreviewDoc(doc);
    setIsPreviewOpen(true);
  };
  
  const handleDeleteDoc = async (docId: string) => {
    if (window.confirm('Are you sure you want to delete this document?')) {
      await deleteDocument(docId);
    }
  };
  
  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-1/3" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-24 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Archive Documents</h3>
        <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Upload Document
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload New Document</DialogTitle>
              <DialogDescription>
                Add a new document to the archive. Select a file and provide additional information.
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="file">Document File</Label>
                <Input 
                  id="file" 
                  type="file" 
                  onChange={handleFileChange}
                  className="cursor-pointer"
                />
                {selectedFile && (
                  <p className="text-xs text-muted-foreground">
                    Selected: {selectedFile.name} ({formatBytes(selectedFile.size)})
                  </p>
                )}
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="category">Category</Label>
                <Select 
                  value={docCategory} 
                  onValueChange={setDocCategory}
                >
                  <SelectTrigger id="category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mmp">MMP File</SelectItem>
                    <SelectItem value="siteVisit">Site Visit</SelectItem>
                    <SelectItem value="permit">Permit</SelectItem>
                    <SelectItem value="verification">Verification</SelectItem>
                    <SelectItem value="report">Report</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="relatedType">Related To</Label>
                <Select 
                  value={docRelatedType} 
                  onValueChange={(value) => setDocRelatedType(value as 'mmp' | 'siteVisit')}
                >
                  <SelectTrigger id="relatedType">
                    <SelectValue placeholder="Select related type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mmp">MMP File</SelectItem>
                    <SelectItem value="siteVisit">Site Visit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="relatedId">Related ID</Label>
                <Input 
                  id="relatedId" 
                  placeholder="Enter related MMP or Site Visit ID" 
                  value={docRelatedId}
                  onChange={(e) => setDocRelatedId(e.target.value)}
                />
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea 
                  id="description" 
                  placeholder="Enter document description"
                  value={docDescription}
                  onChange={(e) => setDocDescription(e.target.value)}
                />
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsUploadDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleUpload}
                disabled={!selectedFile}
              >
                Upload
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      
      {/* Document list */}
      {documents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-10">
            <FileText className="h-16 w-16 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground text-center">No documents found in the archive</p>
            <Button 
              variant="outline" 
              className="mt-4"
              onClick={() => setIsUploadDialogOpen(true)}
            >
              Upload Your First Document
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {documents.map((doc) => (
            <Card key={doc.id} className="overflow-hidden">
              <CardHeader className="bg-muted/30 p-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3">
                    <div 
                      className={cn(
                        "p-2 rounded-md",
                        doc.category === 'mmp' ? 'bg-blue-100 text-blue-600' : 
                        doc.category === 'siteVisit' ? 'bg-green-100 text-green-600' : 
                        'bg-gray-100 text-gray-600'
                      )}
                    >
                      <FileText className="h-6 w-6" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{doc.fileName}</CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(doc.uploadedAt), 'MMM dd, yyyy')} · {formatBytes(doc.fileSize)}
                      </p>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-3">
                <div className="text-xs text-muted-foreground mb-2">
                  {doc.description || 'No description provided'}
                </div>
                
                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center">
                    <Badge 
                      variant="outline" 
                      className={cn(
                        "capitalize",
                        doc.category === 'mmp' && "text-blue-600 bg-blue-50",
                        doc.category === 'siteVisit' && "text-green-600 bg-green-50",
                        doc.category === 'permit' && "text-amber-600 bg-amber-50",
                        doc.category === 'verification' && "text-purple-600 bg-purple-50",
                        doc.category === 'report' && "text-indigo-600 bg-indigo-50"
                      )}
                    >
                      {doc.category}
                    </Badge>
                    <span className="text-xs text-muted-foreground ml-2">
                      ID: {doc.relatedEntityId.substring(0, 8)}
                    </span>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => handlePreviewDoc(doc)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon">
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDeleteDoc(doc.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      
      {/* Document preview dialog */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{previewDoc?.fileName}</DialogTitle>
            <DialogDescription>
              Uploaded on {previewDoc && format(new Date(previewDoc.uploadedAt), 'MMMM dd, yyyy')}
            </DialogDescription>
          </DialogHeader>
          
          <div className="min-h-[400px] border rounded-md p-4">
            {/* This would be a PDF or document viewer in a real app */}
            <div className="flex items-center justify-center h-full">
              {previewDoc?.fileType.includes('image') ? (
                <img 
                  src={previewDoc?.fileUrl} 
                  alt={previewDoc?.fileName} 
                  className="max-h-[350px] object-contain"
                />
              ) : (
                <div className="text-center">
                  <FileText className="h-16 w-16 mx-auto text-muted-foreground/40 mb-4" />
                  <p>Document preview not available</p>
                  <p className="text-sm text-muted-foreground">Download the file to view its contents</p>
                </div>
              )}
            </div>
          </div>
          
          <div className="mt-2">
            <h4 className="font-medium text-sm">Document Details</h4>
            <div className="grid grid-cols-2 gap-2 text-sm mt-2">
              <div className="text-muted-foreground">Category:</div>
              <div className="capitalize">{previewDoc?.category}</div>
              <div className="text-muted-foreground">Related To:</div>
              <div className="capitalize">{previewDoc?.relatedEntityType}</div>
              <div className="text-muted-foreground">Related ID:</div>
              <div>{previewDoc?.relatedEntityId}</div>
              <div className="text-muted-foreground">File Size:</div>
              <div>{previewDoc && formatBytes(previewDoc.fileSize)}</div>
              <div className="text-muted-foreground">Uploaded By:</div>
              <div>{previewDoc?.uploadedBy}</div>
            </div>
            {previewDoc?.description && (
              <>
                <h4 className="font-medium text-sm mt-4">Description</h4>
                <p className="text-sm mt-1">{previewDoc.description}</p>
              </>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPreviewOpen(false)}>Close</Button>
            <Button>
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ArchiveDocumentList;
