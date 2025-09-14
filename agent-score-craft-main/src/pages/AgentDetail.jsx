import { useState, useEffect } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { apiService } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { 
  ArrowLeft, 
  Brain, 
  Target, 
  TrendingUp,
  FileText,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Copy,
  Eye,
  Loader2,
  Download,
  BarChart3
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar
} from "recharts";

export default function AgentDetail() {
  const { agentId } = useParams();
  const [searchParams] = useSearchParams();
  const batchId = searchParams.get('batchId');
  const navigate = useNavigate();
  
  const [agentData, setAgentData] = useState(null);
  const [responses, setResponses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedResponse, setSelectedResponse] = useState(null);
  const { toast } = useToast();

  useEffect(() => {
    if (agentId && batchId) {
      fetchAgentData();
    }
  }, [agentId, batchId]);

  const fetchAgentData = async () => {
    try {
      setLoading(true);
      
      // Get agent specific results from the batch results
      const batchResponse = await apiService.getBatchResults(batchId);
      const agentResponses = batchResponse.data.results.filter(
        result => result.agent_id === agentId
      );
      
      setResponses(agentResponses);
      
      // Calculate agent summary
      if (agentResponses.length > 0) {
        const avgScores = agentResponses.reduce((acc, response) => {
          Object.keys(response.scores).forEach(dimension => {
            acc[dimension] = (acc[dimension] || 0) + response.scores[dimension];
          });
          return acc;
        }, {});
        
        Object.keys(avgScores).forEach(dimension => {
          avgScores[dimension] = avgScores[dimension] / agentResponses.length;
        });
        
        const avgFinalScore = agentResponses.reduce((sum, r) => sum + r.final_score, 0) / agentResponses.length;
        const avgProcessingTime = agentResponses.reduce((sum, r) => sum + r.processing_time_ms, 0) / agentResponses.length;
        
        setAgentData({
          agent_id: agentId,
          total_responses: agentResponses.length,
          avg_scores: avgScores,
          avg_final_score: avgFinalScore,
          avg_processing_time: avgProcessingTime,
          best_score: Math.max(...agentResponses.map(r => r.final_score)),
          worst_score: Math.min(...agentResponses.map(r => r.final_score)),
        });
      }
    } catch (error) {
      console.error("Failed to fetch agent data:", error);
      toast({
        title: "Error",
        description: "Failed to fetch agent details",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getDimensionColor = (dimension) => {
    const colors = {
      instruction: "#3b82f6",
      hallucination: "#ef4444", 
      assumption: "#f59e0b",
      coherence: "#10b981",
      accuracy: "#8b5cf6"
    };
    return colors[dimension] || "#6b7280";
  };

  const getScoreColor = (score) => {
    if (score >= 0.8) return "text-success";
    if (score >= 0.6) return "text-warning";
    return "text-destructive";
  };

  const getScoreBadgeVariant = (score) => {
    if (score >= 0.8) return "default";
    if (score >= 0.6) return "secondary";
    return "destructive";
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "Text copied to clipboard",
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading agent details...</p>
        </div>
      </div>
    );
  }

  if (!agentData) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-2xl font-bold mb-2">Agent Not Found</h2>
        <p className="text-muted-foreground mb-6">
          No data found for this agent in the selected batch.
        </p>
        <Button onClick={() => navigate('/leaderboard')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Leaderboard
        </Button>
      </div>
    );
  }

  // Prepare radar chart data
  const radarData = Object.entries(agentData.avg_scores).map(([dimension, score]) => ({
    dimension: dimension.charAt(0).toUpperCase() + dimension.slice(1),
    score: score * 100
  }));

  // Prepare bar chart data for response scores
  const responseScoresData = responses.map((response, index) => ({
    response: `R${index + 1}`,
    score: response.final_score * 100,
    ...Object.fromEntries(
      Object.entries(response.scores).map(([dim, score]) => [dim, score * 100])
    )
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => navigate('/leaderboard')}
            className="hover:bg-primary/10 hover:text-primary transition-smooth"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          
          <div>
            <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
              Agent Details
            </h1>
            <p className="text-muted-foreground mt-1">
              Agent ID: {agentId}
            </p>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Export Data
          </Button>
        </div>
      </div>

      {/* Agent Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="bg-card/80 backdrop-blur-sm border-border shadow-card">
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <Brain className="w-8 h-8 text-primary" />
              <div>
                <div className="text-2xl font-bold">{agentData.total_responses}</div>
                <div className="text-sm text-muted-foreground">Total Responses</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/80 backdrop-blur-sm border-border shadow-card">
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <Target className="w-8 h-8 text-success" />
              <div>
                <div className={`text-2xl font-bold ${getScoreColor(agentData.avg_final_score)}`}>
                  {(agentData.avg_final_score * 100).toFixed(1)}%
                </div>
                <div className="text-sm text-muted-foreground">Avg Score</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/80 backdrop-blur-sm border-border shadow-card">
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <TrendingUp className="w-8 h-8 text-accent" />
              <div>
                <div className={`text-2xl font-bold ${getScoreColor(agentData.best_score)}`}>
                  {(agentData.best_score * 100).toFixed(1)}%
                </div>
                <div className="text-sm text-muted-foreground">Best Score</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/80 backdrop-blur-sm border-border shadow-card">
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <BarChart3 className="w-8 h-8 text-warning" />
              <div>
                <div className="text-2xl font-bold">
                  {agentData.avg_processing_time.toFixed(0)}ms
                </div>
                <div className="text-sm text-muted-foreground">Avg Time</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Performance Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-card/80 backdrop-blur-sm border-border shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Target className="w-5 h-5 text-primary" />
              <span>Dimension Breakdown</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="hsl(var(--border))" />
                <PolarAngleAxis 
                  dataKey="dimension" 
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                />
                <PolarRadiusAxis 
                  angle={90} 
                  domain={[0, 100]}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                />
                <Radar
                  name="Score"
                  dataKey="score"
                  stroke="hsl(var(--primary))"
                  fill="hsl(var(--primary) / 0.3)"
                  strokeWidth={2}
                />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-card/80 backdrop-blur-sm border-border shadow-card">
          <CardHeader>
            <CardTitle>Performance Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {Object.entries(agentData.avg_scores).map(([dimension, score]) => (
                <div key={dimension} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div 
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: getDimensionColor(dimension) }}
                      />
                      <span className="font-medium capitalize">{dimension}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className={`font-bold ${getScoreColor(score)}`}>
                        {(score * 100).toFixed(1)}%
                      </span>
                      <Badge variant={getScoreBadgeVariant(score)} className="text-xs">
                        {score >= 0.8 ? "Excellent" : score >= 0.6 ? "Good" : "Poor"}
                      </Badge>
                    </div>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div 
                      className="h-2 rounded-full transition-smooth" 
                      style={{ 
                        width: `${score * 100}%`,
                        backgroundColor: getDimensionColor(dimension)
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Response Performance Chart */}
      <Card className="bg-card/80 backdrop-blur-sm border-border shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            <span>Response-by-Response Performance</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={responseScoresData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis 
                dataKey="response" 
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
                dataKey="score" 
                fill="hsl(var(--primary))"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Individual Responses */}
      <Card className="bg-card/80 backdrop-blur-sm border-border shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <FileText className="w-5 h-5 text-primary" />
              <span>Individual Responses</span>
            </div>
            <Badge variant="outline">{responses.length} responses</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {responses.map((response, index) => (
              <div
                key={response._id}
                className="p-6 border border-border rounded-lg bg-muted/30 hover:bg-muted/50 transition-smooth"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center space-x-2">
                      <Badge variant="outline">Response #{index + 1}</Badge>
                      <Badge variant={getScoreBadgeVariant(response.final_score)}>
                        {(response.final_score * 100).toFixed(1)}% Final Score
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        {response.processing_time_ms}ms
                      </Badge>
                    </div>
                    
                    <div>
                      <h4 className="font-medium text-sm text-muted-foreground mb-1">Prompt</h4>
                      <p className="text-sm">{response.prompt}</p>
                    </div>
                  </div>
                  
                  <div className="flex space-x-2">
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => setSelectedResponse(selectedResponse === response._id ? null : response._id)}
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      {selectedResponse === response._id ? 'Hide' : 'View'}
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => copyToClipboard(response.response_text)}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {selectedResponse === response._id && (
                  <div className="space-y-4 pt-4 border-t border-border">
                    <div>
                      <h4 className="font-medium text-sm text-muted-foreground mb-2">Response</h4>
                      <div className="p-3 bg-card rounded text-sm">
                        {response.response_text}
                      </div>
                    </div>

                    {response.context && (
                      <div>
                        <h4 className="font-medium text-sm text-muted-foreground mb-2">Context</h4>
                        <div className="p-3 bg-card rounded text-sm text-muted-foreground">
                          {response.context}
                        </div>
                      </div>
                    )}

                    {response.reference && (
                      <div>
                        <h4 className="font-medium text-sm text-muted-foreground mb-2">Reference</h4>
                        <div className="p-3 bg-card rounded text-sm text-muted-foreground">
                          {response.reference}
                        </div>
                      </div>
                    )}

                    <div>
                      <h4 className="font-medium text-sm text-muted-foreground mb-2">Dimension Scores</h4>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                        {Object.entries(response.scores).map(([dimension, score]) => (
                          <div 
                            key={dimension} 
                            className="p-2 bg-card rounded text-center"
                          >
                            <div className="text-xs text-muted-foreground capitalize mb-1">
                              {dimension}
                            </div>
                            <div className={`font-bold ${getScoreColor(score)}`}>
                              {(score * 100).toFixed(0)}%
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {response.processing_errors && response.processing_errors.length > 0 && (
                      <div>
                        <h4 className="font-medium text-sm text-destructive mb-2">Errors</h4>
                        <ul className="space-y-1">
                          {response.processing_errors.map((error, idx) => (
                            <li key={idx} className="text-xs text-destructive flex items-center">
                              <XCircle className="w-3 h-3 mr-2" />
                              {error}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                <Separator className="my-3" />
                
                <div className="flex space-x-2">
                  {Object.entries(response.scores).map(([dimension, score]) => (
                    <Badge 
                      key={dimension} 
                      variant={getScoreBadgeVariant(score)}
                      className="text-xs"
                    >
                      {dimension.charAt(0).toUpperCase()}: {(score * 100).toFixed(0)}%
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}