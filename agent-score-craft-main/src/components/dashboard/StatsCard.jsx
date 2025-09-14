import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown } from "lucide-react";

export function StatsCard({ 
  title, 
  value, 
  description, 
  icon: Icon, 
  trend, 
  trendValue,
  className = "",
  valueColor = "text-foreground"
}) {
  const getTrendIcon = () => {
    if (trend === "up") return <TrendingUp className="w-4 h-4 text-success" />;
    if (trend === "down") return <TrendingDown className="w-4 h-4 text-destructive" />;
    return null;
  };

  const getTrendColor = () => {
    if (trend === "up") return "text-success";
    if (trend === "down") return "text-destructive";
    return "text-muted-foreground";
  };

  return (
    <Card className={`bg-card/80 backdrop-blur-sm border-border shadow-card hover:shadow-elevated transition-smooth animate-scale-in ${className}`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {Icon && (
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="w-4 h-4 text-primary" />
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="flex flex-col space-y-2">
          <div className={`text-2xl font-bold ${valueColor}`}>
            {value}
          </div>
          
          {(description || trendValue) && (
            <div className="flex items-center justify-between">
              {description && (
                <p className="text-xs text-muted-foreground">
                  {description}
                </p>
              )}
              
              {trendValue && (
                <div className={`flex items-center space-x-1 text-xs ${getTrendColor()}`}>
                  {getTrendIcon()}
                  <span>{trendValue}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}