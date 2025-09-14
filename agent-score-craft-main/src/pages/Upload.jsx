import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { apiService } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { 
  Upload as UploadIcon, 
  FileText, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  Download,
  Info,
  Loader2,
  Eye
} from "lucide-react";

export default function Upload() {
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState(null);
  const [validationResult, setValidationResult] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [formats, setFormats] = useState(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  // Fetch supported formats on component mount
  useState(() => {
    const fetchFormats = async () => {
      try {
        const response = await apiService.getUploadFormats();
        setFormats(response.data);
      } catch (error) {
        console.error("Failed to fetch formats:", error);
      }
    };
    fetchFormats();
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      setFile(droppedFile);
      setValidationResult(null);
      setUploadResult(null);
    }
  }, []);

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setValidationResult(null);
      setUploadResult(null);
    }
  };

  const validateFile = async () => {
    if (!file) return;
    
    try {
      setValidating(true);
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await apiService.validateFile(formData);
      setValidationResult(response.data);
      
      toast({
        title: "Validation Complete",
        description: `Found ${response.data.validation.valid_rows} valid rows`,
      });
    } catch (error) {
      console.error("Validation failed:", error);
      toast({
        title: "Validation Failed",
        description: error.response?.data?.message || "Failed to validate file",
        variant: "destructive",
      });
    } finally {
      setValidating(false);
    }
  };

  const uploadFile = async () => {
    if (!file || !validationResult) return;
    
    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await apiService.uploadFile(formData);
      setUploadResult(response.data);
      
      // Store batch info locally for leaderboard access
      batchStorage.saveBatch({
        batch_id: response.data.batch_id,
        filename: file.name,
        summary: response.data.summary
      });
      
      toast({
        title: "Upload Successful",
        description: `Batch ${response.data.batch_id} created with ${response.data.summary.total_responses} responses`,
      });
      
      // Auto-navigate to batch status after 2 seconds
      setTimeout(() => {
        navigate(`/batch/${response.data.batch_id}`);
      }, 2000);
    } catch (error) {
      console.error("Upload failed:", error);
      toast({
        title: "Upload Failed",
        description: error.response?.data?.message || "Failed to upload file",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const generateSampleData = async () => {
    try {
      const response = await apiService.getSampleData();
      const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'sample-data.json';
      a.click();
      URL.revokeObjectURL(url);
      
      toast({
        title: "Sample Data Downloaded",
        description: "Use this as a template for your uploads",
      });
    } catch (error) {
      console.error("Failed to generate sample data:", error);
      toast({
        title: "Error",
        description: "Failed to generate sample data",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
          Upload Agent Data
        </h1>
        <p className="text-muted-foreground">
          Upload CSV or JSON files containing agent responses for evaluation
        </p>
      </div>

      {/* Upload Format Info */}
      {formats && (
        <Card className="bg-card/80 backdrop-blur-sm border-border shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Info className="w-5 h-5 text-primary" />
              <span>Supported Formats</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-medium mb-2">Required Fields</h3>
                <div className="space-y-1">
                  {formats.required_fields.map(field => (
                    <Badge key={field} variant="outline" className="mr-2">
                      {field}
                    </Badge>
                  ))}
                </div>
              </div>
              
              <div>
                <h3 className="font-medium mb-2">Optional Fields</h3>
                <div className="space-y-1">
                  {formats.optional_fields.map(field => (
                    <Badge key={field} variant="secondary" className="mr-2">
                      {field}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="mt-4 pt-4 border-t border-border">
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  Max file size: {formats.limits.max_file_size} | 
                  Max responses: {formats.limits.max_responses_per_batch.toLocaleString()}
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={generateSampleData}
                  className="hover:bg-primary/10 hover:text-primary transition-smooth"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download Sample
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* File Upload */}
      <Card className="bg-card/80 backdrop-blur-sm border-border shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <UploadIcon className="w-5 h-5 text-primary" />
            <span>Select File</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className={`
              border-2 border-dashed rounded-lg p-8 text-center transition-smooth cursor-pointer
              ${dragOver 
                ? "border-primary bg-primary/10" 
                : file 
                  ? "border-success bg-success/10" 
                  : "border-border hover:border-primary/50"
              }
            `}
            onDrop={handleDrop}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onClick={() => document.getElementById('file-input').click()}
          >
            <Input
              id="file-input"
              type="file"
              accept=".csv,.json,.txt"
              onChange={handleFileSelect}
              className="hidden"
            />
            
            {file ? (
              <div className="space-y-3">
                <CheckCircle2 className="w-12 h-12 text-success mx-auto" />
                <div>
                  <h3 className="font-medium text-lg">{file.name}</h3>
                  <p className="text-muted-foreground">
                    {(file.size / 1024 / 1024).toFixed(2)} MB • {file.type || "Unknown type"}
                  </p>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                    setValidationResult(null);
                    setUploadResult(null);
                  }}
                >
                  Choose Different File
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <FileText className="w-12 h-12 text-muted-foreground mx-auto" />
                <div>
                  <h3 className="font-medium text-lg">Drop your file here</h3>
                  <p className="text-muted-foreground">
                    or click to browse • CSV, JSON supported
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* File Actions */}
      {file && (
        <Card className="bg-card/80 backdrop-blur-sm border-border shadow-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-center space-x-4">
              <Button 
                onClick={validateFile}
                disabled={validating}
                variant="outline"
                className="hover:bg-primary/10 hover:text-primary transition-smooth"
              >
                {validating ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Eye className="w-4 h-4 mr-2" />
                )}
                {validating ? "Validating..." : "Validate File"}
              </Button>
              
              <Button 
                onClick={uploadFile}
                disabled={!validationResult || uploading || validationResult.validation.errors.length > 0}
                className="bg-gradient-primary hover:bg-gradient-primary/90 transition-smooth"
              >
                {uploading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <UploadIcon className="w-4 h-4 mr-2" />
                )}
                {uploading ? "Uploading..." : "Start Evaluation"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Validation Results */}
      {validationResult && (
        <Card className="bg-card/80 backdrop-blur-sm border-border shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              {validationResult.validation.errors.length === 0 ? (
                <CheckCircle2 className="w-5 h-5 text-success" />
              ) : (
                <XCircle className="w-5 h-5 text-destructive" />
              )}
              <span>Validation Results</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-success">
                  {validationResult.validation.valid_rows}
                </div>
                <div className="text-sm text-muted-foreground">Valid Rows</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">
                  {validationResult.validation.total_rows}
                </div>
                <div className="text-sm text-muted-foreground">Total Rows</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">
                  {Object.keys(validationResult.validation.agent_distribution || {}).length}
                </div>
                <div className="text-sm text-muted-foreground">Unique Agents</div>
              </div>
            </div>

            {validationResult.validation.errors.length > 0 && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 mb-4">
                <h4 className="font-medium text-destructive mb-2">Errors Found</h4>
                <ul className="space-y-1">
                  {validationResult.validation.errors.map((error, index) => (
                    <li key={index} className="text-sm text-destructive flex items-center">
                      <XCircle className="w-4 h-4 mr-2 flex-shrink-0" />
                      {error}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {validationResult.validation.warnings.length > 0 && (
              <div className="bg-warning/10 border border-warning/20 rounded-lg p-4 mb-4">
                <h4 className="font-medium text-warning mb-2">Warnings</h4>
                <ul className="space-y-1">
                  {validationResult.validation.warnings.map((warning, index) => (
                    <li key={index} className="text-sm text-warning flex items-center">
                      <AlertTriangle className="w-4 h-4 mr-2 flex-shrink-0" />
                      {warning}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {validationResult.validation.preview && (
              <div>
                <h4 className="font-medium mb-3">Data Preview</h4>
                <div className="bg-muted/50 rounded-lg p-4 overflow-x-auto">
                  <pre className="text-sm">
                    {JSON.stringify(validationResult.validation.preview.slice(0, 2), null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Upload Success */}
      {uploadResult && (
        <Card className="bg-card/80 backdrop-blur-sm border-border shadow-card animate-scale-in">
          <CardContent className="p-6">
            <div className="text-center space-y-4">
              <CheckCircle2 className="w-16 h-16 text-success mx-auto animate-glow" />
              <div>
                <h3 className="text-xl font-bold text-success">Upload Successful!</h3>
                <p className="text-muted-foreground">
                  Batch {uploadResult.batch_id} created with {uploadResult.summary.total_responses} responses
                </p>
              </div>
              <div className="flex items-center justify-center space-x-4">
                <Button 
                  variant="outline"
                  onClick={() => navigate(`/batch/${uploadResult.batch_id}`)}
                >
                  View Batch Status
                </Button>
                <Button onClick={() => navigate('/dashboard')}>
                  Back to Dashboard
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}