import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiService } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { 
  TrendingUp, 
  BarChart3, 
  PieChart, 
  Activity,
  Brain,
  Target,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Filter,
  Calendar
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Area, AreaChart, PieChart as RechartsPieChart, Pie, Cell,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend
} from "recharts";

export default function Analytics() {
  const [systemData, setSystemData] = useState(null);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState("7d");
  const [selectedMetric, setSelectedMetric] = useState("all");
  const { toast } = useToast();

  useEffect(() => {
    fetchAnalyticsData();
  }, [timeRange]);

  const fetchAnalyticsData = async () => {
    try {
      setLoading(true);
      const response = await apiService.getSystemStatus();
      setSystemData(response.data);
      
      // Generate analytics data from system stats
      generateAnalyticsFromSystemData(response.data);
    } catch (error) {
      console.error("Failed to fetch analytics data:", error);
      toast({
        title: "Error",
        description: "Failed to load analytics data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const generateAnalyticsFromSystemData = (data) => {
    const stats = data.statistics;
    
    // Generate sample trends data
    const dimensionTrends = [
      { name: "Instruction", current: 85, previous: 82, trend: "up" },
      { name: "Hallucination", current: 78, previous: 80, trend: "down" },
      { name: "Assumption", current: 92, previous: 88, trend: "up" },
      { name: "Coherence", current: 76, previous: 74, trend: "up" },
      { name: "Accuracy", current: 88, previous: 85, trend: "up" },
    ];

    // Performance over time (sample data)
    const performanceOverTime = [
      { date: "2024-01-01", instruction: 82, hallucination: 75, assumption: 88, coherence: 72, accuracy: 85 },
      { date: "2024-01-02", instruction: 84, hallucination: 77, assumption: 90, coherence: 74, accuracy: 86 },
      { date: "2024-01-03", instruction: 83, hallucination: 76, assumption: 89, coherence: 75, accuracy: 87 },
      { date: "2024-01-04", instruction: 85, hallucination: 78, assumption: 92, coherence: 76, accuracy: 88 },
    ];

    // Agent distribution by performance
    const performanceDistribution = [
      { range: "90-100%", count: Math.floor(stats?.batches?.completed * 0.15) || 3, color: "#10b981" },
      { range: "80-89%", count: Math.floor(stats?.batches?.completed * 0.35) || 7, color: "#f59e0b" },
      { range: "70-79%", count: Math.floor(stats?.batches?.completed * 0.30) || 6, color: "#3b82f6" },
      { range: "60-69%", count: Math.floor(stats?.batches?.completed * 0.15) || 3, color: "#ef4444" },
      { range: "Below 60%", count: Math.floor(stats?.batches?.completed * 0.05) || 1, color: "#6b7280" },
    ];

    // Error patterns
    const errorPatterns = [
      { dimension: "Hallucination", frequency: 45, severity: "High" },
      { dimension: "Coherence", frequency: 32, severity: "Medium" },
      { dimension: "Instruction", frequency: 18, severity: "Low" },
      { dimension: "Accuracy", frequency: 25, severity: "Medium" },
      { dimension: "Assumption", frequency: 12, severity: "Low" },
    ];

    // Processing efficiency
    const processingEfficiency = [
      { hour: "00:00", processed: 45, failed: 2 },
      { hour: "04:00", processed: 38, failed: 1 },
      { hour: "08:00", processed: 72, failed: 3 },
      { hour: "12:00", processed: 89, failed: 4 },
      { hour: "16:00", processed: 95, failed: 2 },
      { hour: "20:00", processed: 67, failed: 1 },
    ];

    setAnalyticsData({
      dimensionTrends,
      performanceOverTime,
      performanceDistribution,
      errorPatterns,
      processingEfficiency,
      summary: {
        totalEvaluations: stats?.responses?.total || 0,
        successRate: stats?.responses?.total > 0 
          ? ((stats.responses.completed / stats.responses.total) * 100).toFixed(1)
          : 0,
        avgProcessingTime: "2.3s",
        topPerformer: "Agent_7891",
      }
    });
  };

  const colors = {
    instruction: "#3b82f6",
    hallucination: "#ef4444", 
    assumption: "#f59e0b",
    coherence: "#10b981",
    accuracy: "#8b5cf6"
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading analytics...</p>
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
            Analytics
          </h1>
          <p className="text-muted-foreground mt-1">
            Deep insights into agent performance and evaluation trends
          </p>
        </div>
        
        <div className="flex items-center space-x-4">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1d">Last Day</SelectItem>
              <SelectItem value="7d">Last Week</SelectItem>
              <SelectItem value="30d">Last Month</SelectItem>
              <SelectItem value="90d">Last Quarter</SelectItem>
            </SelectContent>
          </Select>
          
          <Button variant="outline" onClick={fetchAnalyticsData}>
            <Activity className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Key Metrics Summary */}
      {analyticsData?.summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card className="bg-card/80 backdrop-blur-sm border-border shadow-card">
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <Brain className="w-8 h-8 text-primary" />
                <div>
                  <div className="text-2xl font-bold">{analyticsData.summary.totalEvaluations}</div>
                  <div className="text-sm text-muted-foreground">Total Evaluations</div>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-card/80 backdrop-blur-sm border-border shadow-card">
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <CheckCircle2 className="w-8 h-8 text-success" />
                <div>
                  <div className="text-2xl font-bold text-success">{analyticsData.summary.successRate}%</div>
                  <div className="text-sm text-muted-foreground">Success Rate</div>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-card/80 backdrop-blur-sm border-border shadow-card">
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <Activity className="w-8 h-8 text-accent" />
                <div>
                  <div className="text-2xl font-bold">{analyticsData.summary.avgProcessingTime}</div>
                  <div className="text-sm text-muted-foreground">Avg Processing Time</div>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-card/80 backdrop-blur-sm border-border shadow-card">
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <Target className="w-8 h-8 text-warning" />
                <div>
                  <div className="text-2xl font-bold">{analyticsData.summary.topPerformer}</div>
                  <div className="text-sm text-muted-foreground">Top Performer</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Performance Trends */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-card/80 backdrop-blur-sm border-border shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              <span>Dimension Performance Trends</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={analyticsData?.performanceOverTime || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis 
                  dataKey="date" 
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px"
                  }}
                />
                <Legend />
                {Object.keys(colors).map(dimension => (
                  <Line
                    key={dimension}
                    type="monotone"
                    dataKey={dimension}
                    stroke={colors[dimension]}
                    strokeWidth={2}
                    dot={{ r: 4 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-card/80 backdrop-blur-sm border-border shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <PieChart className="w-5 h-5 text-primary" />
              <span>Performance Distribution</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <RechartsPieChart>
                <Pie
                  data={analyticsData?.performanceDistribution || []}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="count"
                >
                  {(analyticsData?.performanceDistribution || []).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </RechartsPieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Dimension Analysis */}
      <Card className="bg-card/80 backdrop-blur-sm border-border shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            <span>Dimension Analysis</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Dimension Trends */}
            <div className="space-y-4">
              <h3 className="font-medium">Current vs Previous Performance</h3>
              {(analyticsData?.dimensionTrends || []).map((dimension) => (
                <div key={dimension.name} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{dimension.name}</span>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-muted-foreground">
                        {dimension.previous}% → {dimension.current}%
                      </span>
                      <Badge 
                        variant={dimension.trend === "up" ? "default" : "destructive"}
                        className="text-xs"
                      >
                        {dimension.trend === "up" ? "↗" : "↘"} 
                        {Math.abs(dimension.current - dimension.previous)}%
                      </Badge>
                    </div>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div 
                      className="h-2 rounded-full bg-gradient-primary" 
                      style={{ width: `${dimension.current}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Error Patterns */}
            <div className="space-y-4">
              <h3 className="font-medium">Error Patterns</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={analyticsData?.errorPatterns || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="dimension" 
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                  />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip />
                  <Bar 
                    dataKey="frequency" 
                    fill="hsl(var(--destructive))"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Processing Efficiency */}
      <Card className="bg-card/80 backdrop-blur-sm border-border shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Activity className="w-5 h-5 text-primary" />
            <span>Processing Efficiency</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={analyticsData?.processingEfficiency || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis 
                dataKey="hour" 
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
              />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <Tooltip />
              <Area 
                type="monotone" 
                dataKey="processed" 
                stackId="1" 
                stroke="hsl(var(--success))" 
                fill="hsl(var(--success) / 0.3)" 
              />
              <Area 
                type="monotone" 
                dataKey="failed" 
                stackId="1" 
                stroke="hsl(var(--destructive))" 
                fill="hsl(var(--destructive) / 0.3)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Insights & Recommendations */}
      <Card className="bg-card/80 backdrop-blur-sm border-border shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Brain className="w-5 h-5 text-primary" />
            <span>AI-Generated Insights</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h3 className="font-medium text-success flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>Strengths</span>
              </h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>• Assumption control shows consistent improvement (+4% this week)</li>
                <li>• Processing efficiency peaked during business hours</li>
                <li>• 85% of agents maintain above-average coherence scores</li>
              </ul>
            </div>
            
            <div className="space-y-3">
              <h3 className="font-medium text-warning flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4" />
                <span>Areas for Improvement</span>
              </h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>• Hallucination detection needs attention (45 error instances)</li>
                <li>• Consider retraining agents with scores below 70%</li>
                <li>• Optimize processing pipeline for off-peak hours</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}