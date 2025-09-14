import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Menu } from "lucide-react";

export default function Layout({ children }) {
  return (
    <SidebarProvider defaultOpen={true}>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        
        <div className="flex-1 flex flex-col">
          <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm flex items-center justify-between px-6 sticky top-0 z-10">
            <div className="flex items-center space-x-4">
              <SidebarTrigger className="p-2 hover:bg-accent rounded-lg transition-smooth">
                <Menu className="w-5 h-5" />
              </SidebarTrigger>
              <div>
                <h1 className="text-xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                  Agent Evaluation Dashboard
                </h1>
                <p className="text-sm text-muted-foreground">
                  Real-time AI agent performance monitoring
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="hidden md:flex items-center space-x-2 text-sm text-muted-foreground">
                <div className="w-2 h-2 bg-success rounded-full animate-pulse"></div>
                <span>Connected to localhost:3001</span>
              </div>
              <ThemeToggle />
            </div>
          </header>

          <main className="flex-1 p-6 animate-slide-up">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}