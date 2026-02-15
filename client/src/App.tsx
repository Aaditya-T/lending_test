import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Dashboard from "@/pages/dashboard";

function App() {
  return (
    <TooltipProvider>
      <Toaster />
      <Dashboard />
    </TooltipProvider>
  );
}

export default App;
