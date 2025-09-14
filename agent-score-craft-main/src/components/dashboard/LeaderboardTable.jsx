import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Trophy, Medal, Award } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function LeaderboardTable({ data, batchId, className = "" }) {
  const navigate = useNavigate();

  const getRankIcon = (rank) => {
    switch (rank) {
      case 1: return <Trophy className="w-4 h-4 text-yellow-500" />;
      case 2: return <Medal className="w-4 h-4 text-gray-400" />;
      case 3: return <Award className="w-4 h-4 text-amber-600" />;
      default: return <span className="w-4 h-4 flex items-center justify-center text-xs font-bold text-muted-foreground">#{rank}</span>;
    }
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

  if (!data?.leaderboard || data.leaderboard.length === 0) {
    return (
      <Card className={`bg-card/80 backdrop-blur-sm border-border shadow-card ${className}`}>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Trophy className="w-5 h-5 text-primary" />
            <span>Agent Leaderboard</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            No data available. Upload agent responses to see rankings.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`bg-card/80 backdrop-blur-sm border-border shadow-card ${className}`}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Trophy className="w-5 h-5 text-primary" />
            <span>Agent Leaderboard</span>
          </div>
          <Badge variant="outline" className="text-xs">
            {data.summary?.total_agents || 0} Agents
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {data.leaderboard.map((agent) => (
            <div
              key={agent.agent_id}
              className="flex items-center justify-between p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-smooth border border-border/50"
            >
              <div className="flex items-center space-x-4">
                <div className="flex items-center justify-center w-8 h-8">
                  {getRankIcon(agent.rank)}
                </div>
                
                <div className="flex flex-col">
                  <div className="font-medium text-sm">
                    Agent {agent.agent_id.slice(-8)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {agent.total_responses} responses
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-4">
                <div className="text-right">
                  <div className={`font-bold text-lg ${getScoreColor(agent.final_score)}`}>
                    {(agent.final_score * 100).toFixed(1)}%
                  </div>
                  <div className="flex space-x-1">
                    {Object.entries(agent.scores).map(([dimension, score]) => (
                      <Badge
                        key={dimension}
                        variant={getScoreBadgeVariant(score)}
                        className="text-xs px-1"
                        title={`${dimension}: ${(score * 100).toFixed(1)}%`}
                      >
                        {dimension.charAt(0).toUpperCase()}: {(score * 100).toFixed(0)}%
                      </Badge>
                    ))}
                  </div>
                </div>
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(`/agent/${agent.agent_id}?batchId=${batchId}`)}
                  className="hover:bg-primary/10 hover:text-primary transition-smooth"
                >
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        {data.summary && (
          <div className="mt-6 pt-4 border-t border-border">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">Average Score</div>
                <div className={`font-semibold ${getScoreColor(data.summary.average_score)}`}>
                  {(data.summary.average_score * 100).toFixed(1)}%
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Best Score</div>
                <div className={`font-semibold ${getScoreColor(data.summary.best_score)}`}>
                  {(data.summary.best_score * 100).toFixed(1)}%
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}