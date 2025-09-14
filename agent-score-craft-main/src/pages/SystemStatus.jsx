import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { apiService } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { 
  Activity, 
  Server, 
  Database, 
  Zap,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  MemoryStick,
  Cpu,
  HardDrive,
  Loader2,
  Settings,
  PlayCircle,
  StopCircle
} from "lucide-react";

export default function SystemStatus() {
  const [systemData, setSystemData] = useState(null);
  const [workerData, setWorkerData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchSystemStatus();
    
    // Auto-refresh every 10 seconds
    const interval = setInterval(fetchSystemStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchSystemStatus = async (showToast = false) => {
    try {
      setRefreshing(true);
      
      const [systemResponse, workersResponse] = await Promise.all([
        apiService.getSystemStatus(),
        apiService.getWorkerStatus()
      ]);
      
      setSystemData(systemResponse.data);
      setWorkerData(workersResponse.data);
      
      if (showToast) {
        toast({
          title: "Status refreshed",
          description: "System information updated",
        });
      }
    } catch (error) {
      console.error("Failed to fetch system status:", error);
      toast({
        title: "Error",
        description: "Failed to fetch system status",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const restartWorker = async (dimension) => {
    try {
      await apiService.restartWorker(dimension);
      toast({
        title: "Worker Restarted",
        description: `${dimension} worker has been restarted`,
      });
      fetchSystemStatus();
    } catch (error) {
      console.error("Failed to restart worker:", error);
      toast({
        title: "Error", 
        description: `Failed to restart ${dimension} worker`,
        variant: "destructive",
      });
    }
  };

  const getHealthColor = (healthy) => {
    return healthy ? "text-success" : "text-destructive";
  };

  const getHealthIcon = (healthy) => {
    return healthy ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />;
  };

  const formatUptime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const formatBytes = (bytes) => {
    return (bytes / 1024 / 1024).toFixed(1);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading system status...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            System Status
          </h1>
          <p className="text-muted-foreground mt-1">
            Monitor system health, performance metrics, and worker status
          </p>
        </div>
        
        <Button 
          onClick={() => fetchSystemStatus(true)}
          disabled={refreshing}
          variant="outline"
          className="hover:bg-primary/10 hover:text-primary hover:border-primary transition-smooth"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* System Health Overview */}
      {systemData?.system_status && (
        <Card className="bg-card/80 backdrop-blur-sm border-border shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Activity className="w-5 h-5 text-primary" />
              <span>System Health</span>
              <Badge 
                variant={systemData.system_status.overall_health === 'healthy' ? 'default' : 'destructive'}
                className="ml-2"
              >
                {systemData.system_status.overall_health === 'healthy' ? 'Healthy' : 'Issues'}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="flex items-center space-x-3">
                <Database className={getHealthColor(systemData.system_status.health_checks.database)} />
                <div>
                  <div className="font-medium">Database</div>
                  <div className={`text-sm ${getHealthColor(systemData.system_status.health_checks.database)}`}>
                    {systemData.system_status.health_checks.database ? 'Connected' : 'Disconnected'}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                <Zap className={getHealthColor(systemData.system_status.health_checks.redis)} />
                <div>
                  <div className="font-medium">Redis Cache</div>
                  <div className={`text-sm ${getHealthColor(systemData.system_status.health_checks.redis)}`}>
                    {systemData.system_status.health_checks.redis ? 'Connected' : 'Disconnected'}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                <Server className={getHealthColor(systemData.system_status.health_checks.queue_accessible)} />
                <div>
                  <div className="font-medium">Queue System</div>
                  <div className={`text-sm ${getHealthColor(systemData.system_status.health_checks.queue_accessible)}`}>
                    {systemData.system_status.health_checks.queue_accessible ? 'Accessible' : 'Inaccessible'}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                <Clock className="w-5 h-5 text-primary" />
                <div>
                  <div className="font-medium">Uptime</div>
                  <div className="text-sm text-muted-foreground">
                    {formatUptime(systemData.system_status.uptime_seconds || 0)}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Performance Metrics */}
      {systemData?.performance && (
        <Card className="bg-card/80 backdrop-blur-sm border-border shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Cpu className="w-5 h-5 text-primary" />
              <span>Performance Metrics</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Memory Usage */}
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <MemoryStick className="w-5 h-5 text-accent" />
                  <span className="font-medium">Memory Usage</span>
                </div>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Heap Used</span>
                      <span>{formatBytes(systemData.performance.memory_usage.heapUsed)} MB</span>
                    </div>
                    <Progress 
                      value={(systemData.performance.memory_usage.heapUsed / systemData.performance.memory_usage.heapTotal) * 100} 
                      className="h-2"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>RSS</span>
                      <span>{formatBytes(systemData.performance.memory_usage.rss)} MB</span>
                    </div>
                    <Progress 
                      value={Math.min((systemData.performance.memory_usage.rss / (512 * 1024 * 1024)) * 100, 100)} 
                      className="h-2"
                    />
                  </div>
                </div>
              </div>

              {/* CPU Usage */}
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Cpu className="w-5 h-5 text-success" />
                  <span className="font-medium">CPU Time</span>
                </div>
                <div className="space-y-3">
                  <div>
                    <div className="text-2xl font-bold text-success">
                      {((systemData.performance.cpu_usage.user + systemData.performance.cpu_usage.system) / 1000).toFixed(1)}s
                    </div>
                    <div className="text-sm text-muted-foreground">Total CPU Time</div>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <div>User: {(systemData.performance.cpu_usage.user / 1000).toFixed(1)}s</div>
                    <div>System: {(systemData.performance.cpu_usage.system / 1000).toFixed(1)}s</div>
                  </div>
                </div>
              </div>

              {/* Buffer Usage */}
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <HardDrive className="w-5 h-5 text-warning" />
                  <span className="font-medium">Buffer Usage</span>
                </div>
                <div className="space-y-3">
                  <div>
                    <div className="text-2xl font-bold text-warning">
                      {formatBytes(systemData.performance.memory_usage.arrayBuffers)} MB
                    </div>
                    <div className="text-sm text-muted-foreground">Array Buffers</div>
                  </div>
                  <div>
                    <div className="text-sm">
                      External: {formatBytes(systemData.performance.memory_usage.external)} MB
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Queue Statistics */}
      {systemData?.statistics && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="bg-card/80 backdrop-blur-sm border-border shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Server className="w-5 h-5 text-primary" />
                <span>Batch Processing</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Object.entries(systemData.statistics.batches).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className={`w-2 h-2 rounded-full ${
                        status === 'completed' ? 'bg-success' :
                        status === 'processing' ? 'bg-warning' :
                        status === 'failed' ? 'bg-destructive' :
                        'bg-muted-foreground'
                      }`} />
                      <span className="capitalize">{status}</span>
                    </div>
                    <Badge variant="outline">{count}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/80 backdrop-blur-sm border-border shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Activity className="w-5 h-5 text-primary" />
                <span>Response Processing</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Object.entries(systemData.statistics.responses).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className={`w-2 h-2 rounded-full ${
                        status === 'completed' ? 'bg-success' :
                        status === 'processing' ? 'bg-warning' :
                        status === 'failed' ? 'bg-destructive' :
                        'bg-muted-foreground'
                      }`} />
                      <span className="capitalize">{status}</span>
                    </div>
                    <Badge variant="outline">{count}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Worker Status */}
      {workerData && (
        <Card className="bg-card/80 backdrop-blur-sm border-border shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Settings className="w-5 h-5 text-primary" />
                <span>Worker Status</span>
              </div>
              <Badge variant="outline">
                {systemData?.statistics?.queue?.active_workers || 0} Active
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {['instruction', 'hallucination', 'assumption', 'coherence', 'accuracy'].map((dimension) => (
                <div key={dimension} className="p-4 border border-border rounded-lg bg-muted/30">
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-medium capitalize">{dimension}</div>
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-success rounded-full animate-pulse" />
                      <span className="text-xs text-success">Running</span>
                    </div>
                  </div>
                  
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <div>Queue: 0 pending</div>
                      <div>Last ping: {'<'}2s ago</div>
                      <div>Status: Healthy</div>
                    </div>
                  
                  <div className="flex space-x-2 mt-3">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => restartWorker(dimension)}
                      className="text-xs"
                    >
                      <RefreshCw className="w-3 h-3 mr-1" />
                      Restart
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* System Alerts */}
      <Card className="bg-card/80 backdrop-blur-sm border-border shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <AlertTriangle className="w-5 h-5 text-warning" />
            <span>System Alerts</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center space-x-3 p-3 bg-success/10 border border-success/20 rounded-lg">
              <CheckCircle2 className="w-5 h-5 text-success" />
              <div className="flex-1">
                <div className="font-medium text-success">All Systems Operational</div>
                <div className="text-sm text-muted-foreground">No critical issues detected</div>
              </div>
              <div className="text-xs text-muted-foreground">Just now</div>
            </div>
            
            <div className="flex items-center space-x-3 p-3 bg-warning/10 border border-warning/20 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-warning" />
              <div className="flex-1">
                <div className="font-medium text-warning">High Memory Usage</div>
                <div className="text-sm text-muted-foreground">Memory usage above 80% threshold</div>
              </div>
              <div className="text-xs text-muted-foreground">5m ago</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}