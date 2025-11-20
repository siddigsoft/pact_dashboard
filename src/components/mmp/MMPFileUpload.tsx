import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMMP } from '@/context/mmp/MMPContext';
import { useProjectContext } from '@/context/project/ProjectContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Upload, CheckCircle, AlertCircle, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

export function MMPFileUpload() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const { uploadMMP } = useMMP();
  const { projects } = useProjectContext();
  const navigate = useNavigate();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setUploadComplete(false);
      setUploadProgress(0);
      setError(null);
    }
  };

  const simulateProgress = () => {
    setUploadProgress(0);
    const interval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 90) {
          clearInterval(interval);
          return 90;
        }
        return prev + 5;
      });
    }, 300);
    return interval;
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error('Please select a file to upload');
      return;
    }

    setIsUploading(true);
    setError(null);
    const progressInterval = simulateProgress();

    try {
      console.log('Starting upload for file:', selectedFile.name);
      
      const result = await uploadMMP(selectedFile, selectedProjectId);
      
      clearInterval(progressInterval);
      
      if (result) {
        setUploadProgress(100);
        setUploadComplete(true);
        toast.success('File uploaded successfully');
        
        setTimeout(() => {
          setSelectedFile(null);
          setSelectedProjectId('');
          const fileInput = document.getElementById('mmp-file') as HTMLInputElement;
          if (fileInput) fileInput.value = '';
          
          navigate('/mmp');
        }, 2000);
      } else {
        setUploadProgress(0);
        setError('Upload failed - please try again');
        toast.error('Upload failed');
      }
    } catch (error) {
      clearInterval(progressInterval);
      setUploadProgress(0);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setError(errorMessage);
      toast.error(`Upload error: ${errorMessage}`);
      console.error('Upload error:', error);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Upload MMP File
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Project</Label>
            <Select
              value={selectedProjectId}
              onValueChange={setSelectedProjectId}
              disabled={isUploading}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center space-x-2">
            <Input
              id="mmp-file"
              type="file"
              onChange={handleFileChange}
              accept=".csv,.xlsx,.xls"
              className="flex-grow"
              disabled={isUploading}
            />
          </div>
          
          {selectedFile && (
            <div className="text-sm text-muted-foreground">
              Selected file: <span className="font-medium">{selectedFile.name}</span> ({(selectedFile.size / 1024).toFixed(1)} KB)
            </div>
          )}
          
          {isUploading && (
            <div className="space-y-2">
              <Progress value={uploadProgress} className="h-2" />
              <p className="text-xs text-center text-muted-foreground">
                {uploadProgress < 100 ? 'Uploading...' : 'Processing...'}
              </p>
            </div>
          )}
          
          {uploadComplete && (
            <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 p-2 rounded">
              <CheckCircle className="h-4 w-4" />
              <span>Upload complete!</span>
            </div>
          )}
          
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-2 rounded">
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter>
        <Button
          onClick={handleUpload}
          disabled={!selectedFile || !selectedProjectId || isUploading}
          className="w-full flex items-center justify-center gap-2"
        >
          {isUploading ? (
            'Uploading...'
          ) : uploadComplete ? (
            <>
              <CheckCircle className="h-4 w-4" />
              Uploaded
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" />
              Upload MMP File
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}

export default MMPFileUpload;
