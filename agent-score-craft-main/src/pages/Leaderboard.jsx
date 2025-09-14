import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiService } from "@/lib/api";
import { batchStorage } from "@/utils/localStorage";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { 
  Trophy, 
  Medal, 
  Award, 
  Search, 
  Filter, 
  Download,
  Eye,
  TrendingUp,
  Target,
  Brain,
  Loader2
} from "lucide-react";

export default function Leaderboard() {
  const [batches, setBatches] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState("");
  const [leaderboardData, setLeaderboardData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("final_score");
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    fetchBatches();
  }, []);

  const fetchBatches = async () => {
    try {
      // Get batches from localStorage (since backend doesn't have batch list endpoint)
      const storedBatches = batchStorage.getBatches();
      setBatches(storedBatches);
      
      // If no stored batches, show message to user
      if (storedBatches.length === 0) {
        toast({
          title: "No batches found",
          description: "Upload some data first to see the leaderboard",
        });
      }
    } catch (error) {
      console.error("Failed to fetch batches:", error);
      toast({
        title: "Error",
        description: "Failed to load batch list",
        variant: "destructive",
      });
    }
  };

  const fetchLeaderboard = async (batchId) => {
    if (!batchId) return;
    
    try {
      setLoading(true);
      const response = await apiService.getLeaderboard(batchId);
      setLeaderboardData(response.data);
    } catch (error) {
      console.error("Failed to fetch leaderboard:", error);
      toast({
        title: "Error",
        description: "Failed to load leaderboard data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBatchSelect = (batchId) => {
    setSelectedBatch(batchId);
    fetchLeaderboard(batchId);
  };

  const getRankIcon = (rank) => {
    switch (rank) {
      case 1: return <Trophy className="w-6 h-6 text-yellow-500" />;
      case 2: return <Medal className="w-6 h-6 text-gray-400" />;
      case 3: return <Award className="w-6 h-6 text-amber-600" />;
      default: return (
        <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground">
          {rank}
        </div>
      );
    }
  };

  const getScoreColor = (score) => {
    if (score >= 0.8) return "text-success";
    if (score >= 0.6) return "text-warning";
    return "text-destructive";
  };

  const getPerformanceBadge = (score) => {
    if (score >= 0.9) return { variant: "default", label: "Excellent" };
    if (score >= 0.8) return { variant: "default", label: "Good" };
    if (score >= 0.6) return { variant: "secondary", label: "Average" };
    return { variant: "destructive", label: "Poor" };
  };

  const getDimensionColor = (dimension) => {
    const colors = {
      instruction: "bg-blue-500/20 text-blue-400",
      hallucination: "bg-red-500/20 text-red-400", 
      assumption: "bg-yellow-500/20 text-yellow-400",
      coherence: "bg-green-500/20 text-green-400",
      accuracy: "bg-purple-500/20 text-purple-400"
    };
    return colors[dimension] || "bg-muted text-muted-foreground";
  };

  const filteredLeaderboard = leaderboardData?.leaderboard?.filter(agent =>
    agent.agent_id.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const sortedLeaderboard = [...filteredLeaderboard].sort((a, b) => {
    if (sortBy === "final_score") return b.final_score - a.final_score;
    if (sortBy === "total_responses") return b.total_responses - a.total_responses;
    return a.rank - b.rank;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Leaderboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Compare agent performance across evaluations
          </p>
        </div>
      </div>

      {/* Batch Selection & Filters */}
      <Card className="bg-card/80 backdrop-blur-sm border-border shadow-card">
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Batch</label>
              <Select value={selectedBatch} onValueChange={handleBatchSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose evaluation batch" />
                </SelectTrigger>
                <SelectContent>
                  {batches.map(batch => (
                    <SelectItem key={batch.id} value={batch.id}>
                      {batch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Search Agents</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by agent ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Sort By</label>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="final_score">Final Score</SelectItem>
                  <SelectItem value="total_responses">Response Count</SelectItem>
                  <SelectItem value="rank">Rank</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading State */}
      {loading && (
        <Card className="bg-card/80 backdrop-blur-sm border-border shadow-card">
          <CardContent className="p-12">
            <div className="flex flex-col items-center space-y-4">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-muted-foreground">Loading leaderboard...</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Leaderboard Results */}
      {!loading && leaderboardData && (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="bg-card/80 backdrop-blur-sm border-border shadow-card">
              <CardContent className="p-4">
                <div className="flex items-center space-x-3">
                  <Brain className="w-8 h-8 text-primary" />
                  <div>
                    <div className="text-2xl font-bold">{leaderboardData.summary?.total_agents || 0}</div>
                    <div className="text-sm text-muted-foreground">Total Agents</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-card/80 backdrop-blur-sm border-border shadow-card">
              <CardContent className="p-4">
                <div className="flex items-center space-x-3">
                  <Trophy className="w-8 h-8 text-yellow-500" />
                  <div>
                    <div className={`text-2xl font-bold ${getScoreColor(leaderboardData.summary?.best_score || 0)}`}>
                      {((leaderboardData.summary?.best_score || 0) * 100).toFixed(1)}%
                    </div>
                    <div className="text-sm text-muted-foreground">Best Score</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-card/80 backdrop-blur-sm border-border shadow-card">
              <CardContent className="p-4">
                <div className="flex items-center space-x-3">
                  <TrendingUp className="w-8 h-8 text-accent" />
                  <div>
                    <div className={`text-2xl font-bold ${getScoreColor(leaderboardData.summary?.average_score || 0)}`}>
                      {((leaderboardData.summary?.average_score || 0) * 100).toFixed(1)}%
                    </div>
                    <div className="text-sm text-muted-foreground">Average Score</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-card/80 backdrop-blur-sm border-border shadow-card">
              <CardContent className="p-4">
                <div className="flex items-center space-x-3">
                  <Target className="w-8 h-8 text-success" />
                  <div>
                    <div className="text-2xl font-bold">
                      {sortedLeaderboard.filter(agent => agent.final_score >= 0.8).length}
                    </div>
                    <div className="text-sm text-muted-foreground">High Performers</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Leaderboard Table */}
          <Card className="bg-card/80 backdrop-blur-sm border-border shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Trophy className="w-5 h-5 text-primary" />
                  <span>Agent Rankings</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge variant="outline">{sortedLeaderboard.length} agents</Badge>
                  <Button variant="outline" size="sm">
                    <Download className="w-4 h-4 mr-2" />
                    Export
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {sortedLeaderboard.map((agent, index) => {
                  const performance = getPerformanceBadge(agent.final_score);
                  
                  return (
                    <div
                      key={agent.agent_id}
                      className="flex items-center justify-between p-6 rounded-lg bg-muted/30 hover:bg-muted/50 transition-smooth border border-border/50 animate-scale-in"
                      style={{ animationDelay: `${index * 0.1}s` }}
                    >
                      <div className="flex items-center space-x-6">
                        <div className="flex items-center justify-center">
                          {getRankIcon(agent.rank)}
                        </div>
                        
                        <div className="flex flex-col space-y-2">
                          <div className="flex items-center space-x-3">
                            <span className="font-semibold text-lg">
                              Agent {agent.agent_id.slice(-8)}
                            </span>
                            <Badge variant={performance.variant} className="text-xs">
                              {performance.label}
                            </Badge>
                          </div>
                          
                          <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                            <span>{agent.total_responses} responses</span>
                            <span>•</span>
                            <div className="flex space-x-2">
                              {Object.entries(agent.scores).map(([dimension, score]) => (
                                <div
                                  key={dimension}
                                  className={`px-2 py-1 rounded text-xs ${getDimensionColor(dimension)}`}
                                  title={`${dimension}: ${(score * 100).toFixed(1)}%`}
                                >
                                  {dimension.charAt(0).toUpperCase()}: {(score * 100).toFixed(0)}%
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-6">
                        <div className="text-right">
                          <div className={`text-3xl font-bold ${getScoreColor(agent.final_score)}`}>
                            {(agent.final_score * 100).toFixed(1)}%
                          </div>
                          <div className="text-sm text-muted-foreground">Final Score</div>
                        </div>
                        
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/agent/${agent.agent_id}?batchId=${selectedBatch}`)}
                          className="hover:bg-primary/10 hover:text-primary transition-smooth"
                        >
                          <Eye className="w-4 h-4 mr-2" />
                          Details
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {sortedLeaderboard.length === 0 && (
                <div className="text-center py-12">
                  <Trophy className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-muted-foreground mb-2">No agents found</h3>
                  <p className="text-sm text-muted-foreground">
                    {searchTerm ? "Try adjusting your search criteria" : "Select a batch to view the leaderboard"}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Empty State */}
      {!selectedBatch && !loading && (
        <Card className="bg-card/80 backdrop-blur-sm border-border shadow-card">
          <CardContent className="p-12">
            <div className="text-center space-y-4">
              <Trophy className="w-16 h-16 text-muted-foreground mx-auto" />
              <div>
                <h3 className="text-xl font-medium text-muted-foreground mb-2">Select an Evaluation Batch</h3>
                <p className="text-sm text-muted-foreground">
                  Choose a completed evaluation batch to view agent rankings and performance comparison
                </p>
              </div>
              <Button 
                variant="outline" 
                onClick={() => navigate('/upload')}
                className="hover:bg-primary/10 hover:text-primary transition-smooth"
              >
                Start New Evaluation
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}