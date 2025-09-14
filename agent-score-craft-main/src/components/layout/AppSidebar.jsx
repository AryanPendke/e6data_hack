import { NavLink, useLocation } from "react-router-dom";
import {
  BarChart3,
  Upload,
  Trophy,
  TrendingUp,
  Settings,
  Brain,
  Activity
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";

const navigationItems = [
  { 
    title: "Dashboard", 
    url: "/", 
    icon: BarChart3,
    description: "Overview & KPIs" 
  },
  { 
    title: "Upload Data", 
    url: "/upload", 
    icon: Upload,
    description: "Add agent responses" 
  },
  { 
    title: "Leaderboard", 
    url: "/leaderboard", 
    icon: Trophy,
    description: "Agent rankings" 
  },
  { 
    title: "Analytics", 
    url: "/analytics", 
    icon: TrendingUp,
    description: "Trends & insights" 
  },
  { 
    title: "System Status", 
    url: "/status", 
    icon: Activity,
    description: "Health monitoring" 
  },
];

export function AppSidebar() {
  const { collapsed } = useSidebar();
  const location = useLocation();
  const currentPath = location.pathname;

  const isActive = (path) => currentPath === path;
  
  const getNavClassName = ({ isActive }) =>
    `flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-smooth font-medium ${
      isActive 
        ? "bg-gradient-primary text-primary-foreground shadow-glow" 
        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    }`;

  return (
    <Sidebar className={`${collapsed ? "w-16" : "w-64"} bg-sidebar border-sidebar-border shadow-card`} collapsible>
      <SidebarHeader className="p-6 border-b border-sidebar-border">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center shadow-glow">
            <Brain className="w-5 h-5 text-primary-foreground" />
          </div>
          {!collapsed && (
            <div>
              <h2 className="text-lg font-bold text-sidebar-foreground">AgentEval</h2>
              <p className="text-xs text-sidebar-foreground/60">AI Agent Evaluation</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="p-4">
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-semibold text-sidebar-foreground/60 mb-2 px-3">
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {navigationItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} className={getNavClassName} end>
                      <item.icon className="w-5 h-5 flex-shrink-0" />
                      {!collapsed && (
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">{item.title}</div>
                          <div className="text-xs opacity-70 truncate">{item.description}</div>
                        </div>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {!collapsed && (
          <SidebarGroup className="mt-8">
            <SidebarGroupLabel className="text-xs font-semibold text-sidebar-foreground/60 mb-2 px-3">
              Quick Stats
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <div className="px-3 py-2 bg-sidebar-accent/50 rounded-lg">
                <div className="text-xs text-sidebar-foreground/60">System Status</div>
                <div className="flex items-center mt-1">
                  <div className="w-2 h-2 bg-success rounded-full mr-2 animate-pulse"></div>
                  <span className="text-sm font-medium text-sidebar-foreground">Online</span>
                </div>
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  );
}