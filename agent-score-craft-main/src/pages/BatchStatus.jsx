import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { apiService } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { 
  ArrowLeft, 
  RefreshCw, 
  Clock, 
  CheckCircle2, 
  AlertTriangle,
  Activity,
  FileText,
  Users,
  Target,
  Loader2,
  Download,
  Eye
} from "lucide-react";

export default function BatchStatus() {
  const { batchId } = useParams();
  const navigate = useNavigate();
  const [batchStatus, setBatchStatus] = useState(null);
  const [batchResults, setBatchResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (batchId) {
      fetchBatchData();
      
      // Auto-refresh every 5 seconds if batch is processing
      const interval = setInterval(() => {
        if (batchStatus?.status?.current_status === 'processing') {
          fetchBatchData();
        }
      }, 5000);
      
      return () => clearInterval(interval);
    }
  }, [batchId, batchStatus?.status?.current_status]);

  const fetchBatchData = async () => {
    try {
      setRefreshing(true);
      
      const [statusResponse, resultsResponse] = await Promise.all([
        apiService.getBatchStatus(batchId),
        batchStatus?.status?.current_status === 'completed' 
          ? apiService.getBatchResults(batchId)
          : Promise.resolve({ data: null })
      ]);
      
      setBatchStatus(statusResponse.data);
      if (resultsResponse.data) {
        setBatchResults(resultsResponse.data);
      }
    } catch (error) {
      console.error("Failed to fetch batch data:", error);
      toast({
        title: "Error",
        description: "Failed to fetch batch information",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'text-success';
      case 'processing': return 'text-warning';
      case 'failed': return 'text-destructive';
      case 'pending': return 'text-muted-foreground';
      default: return 'text-muted-foreground';
    }
  };

  const getStatusBadgeVariant = (status) => {
    switch (status) {
      case 'completed': return 'default';
      case 'processing': return 'secondary';
      case 'failed': return 'destructive';
      default: return 'outline';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="w-5 h-5 text-success" />;
      case 'processing': return <Loader2 className="w-5 h-5 text-warning animate-spin" />;
      case 'failed': return <AlertTriangle className="w-5 h-5 text-destructive" />;
      default: return <Clock className="w-5 h-5 text-muted-foreground" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading batch status...</p>
        </div>
      </div>
    );
  }

  if (!batchStatus) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-2xl font-bold mb-2">Batch Not Found</h2>
        <p className="text-muted-foreground mb-6">
          The requested batch could not be found.
        </p>
        <Button onClick={() => navigate('/dashboard')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Button>
      </div>
    );
  }

  const progress = batchStatus.status.progress;
  const completionPercentage = progress.completion_percentage;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => navigate('/dashboard')}
            className="hover:bg-primary/10 hover:text-primary transition-smooth"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          
          <div>
            <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
              Batch Status
            </h1>
            <p className="text-muted-foreground mt-1">
              Batch ID: {batchId}
            </p>
          </div>
        </div>
        
        <div className="flex items-center space-x-4">
          <Button 
            onClick={fetchBatchData}
            disabled={refreshing}
            variant="outline"
            size="sm"
            className="hover:bg-primary/10 hover:text-primary transition-smooth"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          
          {batchStatus.status.current_status === 'completed' && (
            <Button
              onClick={() => navigate(`/leaderboard?batch=${batchId}`)}
              className="bg-gradient-primary hover:bg-gradient-primary/90"
            >
              <Eye className="w-4 h-4 mr-2" />
              View Results
            </Button>
          )}
        </div>
      </div>

      {/* Status Overview */}
      <Card className="bg-card/80 backdrop-blur-sm border-border shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {getStatusIcon(batchStatus.status.current_status)}
              <span>Processing Status</span>
            </div>
            <Badge variant={getStatusBadgeVariant(batchStatus.status.current_status)}>
              {batchStatus.status.current_status.charAt(0).toUpperCase() + batchStatus.status.current_status.slice(1)}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Progress Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Overall Progress</span>
                <span className={getStatusColor(batchStatus.status.current_status)}>
                  {completionPercentage}%
                </span>
              </div>
              <Progress value={completionPercentage} className="h-3" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{progress.completed} completed</span>
                <span>{progress.total} total responses</span>
              </div>
            </div>

            {/* Detailed Progress */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-success/10 rounded-lg border border-success/20">
                <div className="text-2xl font-bold text-success">{progress.completed}</div>
                <div className="text-sm text-muted-foreground">Completed</div>
              </div>
              
              <div className="text-center p-4 bg-warning/10 rounded-lg border border-warning/20">
                <div className="text-2xl font-bold text-warning">{progress.processing}</div>
                <div className="text-sm text-muted-foreground">Processing</div>
              </div>
              
              <div className="text-center p-4 bg-muted/10 rounded-lg border border-muted/20">
                <div className="text-2xl font-bold text-muted-foreground">{progress.pending}</div>
                <div className="text-sm text-muted-foreground">Pending</div>
              </div>
              
              <div className="text-center p-4 bg-destructive/10 rounded-lg border border-destructive/20">
                <div className="text-2xl font-bold text-destructive">{progress.failed}</div>
                <div className="text-sm text-muted-foreground">Failed</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Timing Information */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-card/80 backdrop-blur-sm border-border shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Clock className="w-5 h-5 text-primary" />
              <span>Timing Information</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created At</span>
                <span>{new Date(batchStatus.status.timing.created_at).toLocaleString()}</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last Updated</span>
                <span>{new Date(batchStatus.status.timing.updated_at).toLocaleString()}</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-muted-foreground">Started Processing</span>
                <span>
                  {batchStatus.status.timing.started_processing ? 'Yes' : 'No'}
                </span>
              </div>
              
              {batchStatus.status.timing.estimated_completion_minutes && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Est. Completion</span>
                  <span>{batchStatus.status.timing.estimated_completion_minutes}m</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/80 backdrop-blur-sm border-border shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Activity className="w-5 h-5 text-primary" />
              <span>Queue Information</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Queue Position</span>
                <span>{batchStatus.status.queue_info.position_in_queue}</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-muted-foreground">Active Workers</span>
                <span>{batchStatus.status.queue_info.active_workers}</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-muted-foreground">Batch Status</span>
                <Badge variant={getStatusBadgeVariant(batchStatus.status.current_status)}>
                  {batchStatus.status.current_status}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Results Preview */}
      {batchResults && (
        <Card className="bg-card/80 backdrop-blur-sm border-border shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Target className="w-5 h-5 text-primary" />
                <span>Results Summary</span>
              </div>
              <div className="flex items-center space-x-2">
                <Badge variant="outline">
                  {batchResults.results.length} results
                </Badge>
                <Button variant="outline" size="sm">
                  <Download className="w-4 h-4 mr-2" />
                  Export
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Quick Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center p-4 bg-muted/30 rounded-lg">
                  <div className="text-2xl font-bold text-primary">
                    {(batchResults.results.reduce((sum, r) => sum + r.final_score, 0) / batchResults.results.length * 100).toFixed(1)}%
                  </div>
                  <div className="text-sm text-muted-foreground">Average Score</div>
                </div>
                
                <div className="text-center p-4 bg-muted/30 rounded-lg">
                  <div className="text-2xl font-bold text-success">
                    {Math.max(...batchResults.results.map(r => r.final_score * 100)).toFixed(1)}%
                  </div>
                  <div className="text-sm text-muted-foreground">Best Score</div>
                </div>
                
                <div className="text-center p-4 bg-muted/30 rounded-lg">
                  <div className="text-2xl font-bold text-warning">
                    {(batchResults.results.reduce((sum, r) => sum + r.processing_time_ms, 0) / batchResults.results.length).toFixed(0)}ms
                  </div>
                  <div className="text-sm text-muted-foreground">Avg Processing Time</div>
                </div>
              </div>

              {/* Top Results Preview */}
              <div className="space-y-2">
                <h4 className="font-medium">Top Performing Responses</h4>
                <div className="space-y-2">
                  {batchResults.results
                    .sort((a, b) => b.final_score - a.final_score)
                    .slice(0, 3)
                    .map((result, index) => (
                    <div key={result._id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div className="text-sm font-bold text-muted-foreground">#{index + 1}</div>
                        <div>
                          <div className="text-sm font-medium">
                            Agent {result.agent_id.slice(-8)}
                          </div>
                          <div className="text-xs text-muted-foreground truncate max-w-md">
                            {result.prompt.substring(0, 60)}...
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-success">
                          {(result.final_score * 100).toFixed(1)}%
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {result.processing_time_ms}ms
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}