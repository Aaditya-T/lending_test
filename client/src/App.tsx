import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import Dashboard from "@/pages/dashboard";

function App() {
  return (
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Dashboard />
      </TooltipProvider>
    </ThemeProvider>
  );
}

export default App;
