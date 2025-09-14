import { useEffect, useState } from "react";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { LeaderboardTable } from "@/components/dashboard/LeaderboardTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiService } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { 
  Activity, 
  Users, 
  FileText, 
  Target, 
  AlertTriangle,
  RefreshCw,
  TrendingUp,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

export default function Dashboard() {
  const [systemData, setSystemData] = useState(null);
  const [recentBatches, setRecentBatches] = useState([]);
  const [leaderboardData, setLeaderboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { toast } = useToast();

  const fetchDashboardData = async (showToast = false) => {
    try {
      setRefreshing(true);
      const response = await apiService.getSystemStatus();
      setSystemData(response.data);
      
      if (showToast) {
        toast({
          title: "Dashboard refreshed",
          description: "Data updated successfully",
        });
      }
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
      toast({
        title: "Error",
        description: "Failed to fetch dashboard data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      fetchDashboardData();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const stats = systemData?.statistics;
  const performance = systemData?.performance;

  // Create charts data
  const batchStatusData = stats?.batches ? [
    { name: 'Completed', value: stats.batches.completed, color: '#10b981' },
    { name: 'Processing', value: stats.batches.processing, color: '#f59e0b' },
    { name: 'Failed', value: stats.batches.failed, color: '#ef4444' },
    { name: 'Pending', value: stats.batches.pending, color: '#6b7280' },
  ] : [];

  const responseStatusData = stats?.responses ? [
    { name: 'Completed', value: stats.responses.completed },
    { name: 'Processing', value: stats.responses.processing },
    { name: 'Pending', value: stats.responses.pending },
    { name: 'Failed', value: stats.responses.failed },
  ] : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Monitor your AI agent evaluation system performance
          </p>
        </div>
        
        <Button 
          onClick={() => fetchDashboardData(true)}
          disabled={refreshing}
          variant="outline"
          className="hover:bg-primary/10 hover:text-primary hover:border-primary transition-smooth"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* System Status Alert */}
      {systemData?.system_status && (
        <Card className="bg-card/80 backdrop-blur-sm border-border shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className={`w-3 h-3 rounded-full ${
                  systemData.system_status.overall_health === 'healthy' ? 'bg-success animate-pulse' : 'bg-destructive'
                }`} />
                <span className="font-medium">
                  System Status: {systemData.system_status.overall_health === 'healthy' ? 'Healthy' : 'Issues Detected'}
                </span>
                <Badge variant={systemData.system_status.overall_health === 'healthy' ? 'default' : 'destructive'}>
                  {stats?.queue?.active_workers || 0} Workers Active
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                Uptime: {Math.floor((systemData.system_status.uptime_seconds || 0) / 60)} minutes
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard
          title="Total Batches"
          value={stats?.batches?.total || 0}
          description="Evaluation batches"
          icon={FileText}
          trend={stats?.batches?.completed > stats?.batches?.failed ? "up" : "down"}
          trendValue={`${stats?.batches?.completed || 0} completed`}
        />
        
        <StatsCard
          title="Total Responses"
          value={stats?.responses?.total || 0}
          description="Agent responses processed"
          icon={Users}
          trend="up"
          trendValue={`${stats?.responses?.completed || 0} processed`}
        />
        
        <StatsCard
          title="Success Rate"
          value={stats?.responses?.total > 0 ? 
            `${((stats.responses.completed / stats.responses.total) * 100).toFixed(1)}%` : "0%"}
          description="Completion rate"
          icon={Target}
          trend={stats?.responses?.failed === 0 ? "up" : "down"}
          valueColor={stats?.responses?.failed === 0 ? "text-success" : "text-warning"}
        />
        
        <StatsCard
          title="Active Queue"
          value={stats?.queue?.pending_tasks || 0}
          description="Tasks in queue"
          icon={Activity}
          trend={stats?.queue?.pending_tasks === 0 ? "down" : "up"}
          trendValue={`${stats?.queue?.active_workers || 0} workers`}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Batch Status Distribution */}
        <Card className="bg-card/80 backdrop-blur-sm border-border shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              <span>Batch Status Distribution</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={batchStatusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {batchStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-2 mt-4">
              {batchStatusData.map((item) => (
                <div key={item.name} className="flex items-center space-x-2">
                  <div 
                    className="w-3 h-3 rounded-sm" 
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-sm text-muted-foreground">{item.name}: {item.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Response Processing Chart */}
        <Card className="bg-card/80 backdrop-blur-sm border-border shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Activity className="w-5 h-5 text-primary" />
              <span>Response Processing</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={responseStatusData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis 
                  dataKey="name" 
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                />
                <YAxis 
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px"
                  }}
                />
                <Bar 
                  dataKey="value" 
                  fill="hsl(var(--primary))"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Performance Metrics */}
      {performance && (
        <Card className="bg-card/80 backdrop-blur-sm border-border shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Activity className="w-5 h-5 text-primary" />
              <span>System Performance</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">Memory Usage</div>
                <div className="text-2xl font-bold">
                  {(performance.memory_usage.heapUsed / 1024 / 1024).toFixed(1)} MB
                </div>
                <div className="text-xs text-muted-foreground">
                  of {(performance.memory_usage.heapTotal / 1024 / 1024).toFixed(1)} MB allocated
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">CPU Time</div>
                <div className="text-2xl font-bold">
                  {((performance.cpu_usage.user + performance.cpu_usage.system) / 1000).toFixed(1)}s
                </div>
                <div className="text-xs text-muted-foreground">
                  User: {(performance.cpu_usage.user / 1000).toFixed(1)}s | System: {(performance.cpu_usage.system / 1000).toFixed(1)}s
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">Buffer Usage</div>
                <div className="text-2xl font-bold">
                  {(performance.memory_usage.arrayBuffers / 1024 / 1024).toFixed(1)} MB
                </div>
                <div className="text-xs text-muted-foreground">
                  Array buffers allocated
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <Card className="bg-card/80 backdrop-blur-sm border-border shadow-card">
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button 
              variant="outline" 
              className="h-auto p-4 flex flex-col items-center space-y-2 hover:bg-primary/10 hover:text-primary hover:border-primary transition-smooth"
              onClick={() => window.location.href = '/upload'}
            >
              <FileText className="w-6 h-6" />
              <div className="text-center">
                <div className="font-medium">Upload Data</div>
                <div className="text-xs text-muted-foreground">Add new agent responses</div>
              </div>
            </Button>
            
            <Button 
              variant="outline" 
              className="h-auto p-4 flex flex-col items-center space-y-2 hover:bg-accent/10 hover:text-accent hover:border-accent transition-smooth"
              onClick={() => window.location.href = '/analytics'}
            >
              <TrendingUp className="w-6 h-6" />
              <div className="text-center">
                <div className="font-medium">View Analytics</div>
                <div className="text-xs text-muted-foreground">Explore trends & insights</div>
              </div>
            </Button>
            
            <Button 
              variant="outline" 
              className="h-auto p-4 flex flex-col items-center space-y-2 hover:bg-success/10 hover:text-success hover:border-success transition-smooth"
              onClick={() => window.location.href = '/status'}
            >
              <Activity className="w-6 h-6" />
              <div className="text-center">
                <div className="font-medium">System Status</div>
                <div className="text-xs text-muted-foreground">Monitor system health</div>
              </div>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}