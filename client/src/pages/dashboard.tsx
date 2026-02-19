import { useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { runLendingFlow } from "@/lib/xrpl-flow";
import {
  Play,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  Wallet,
  ArrowRight,
  FileText,
  Copy,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Landmark,
  Building2,
  User,
  Banknote,
  AlertTriangle,
  Download,
  Upload,
} from "lucide-react";
import type { FlowState, FlowStep, Party, ScenarioId } from "@/lib/types";
import { SCENARIOS } from "@/lib/types";

const ROLE_CONFIG: Record<string, { icon: typeof Wallet; color: string; bgColor: string }> = {
  issuer: { icon: Banknote, color: "text-amber-600 dark:text-amber-400", bgColor: "bg-amber-50 dark:bg-amber-950/40" },
  lender: { icon: Landmark, color: "text-emerald-600 dark:text-emerald-400", bgColor: "bg-emerald-50 dark:bg-emerald-950/40" },
  borrower: { icon: User, color: "text-blue-600 dark:text-blue-400", bgColor: "bg-blue-50 dark:bg-blue-950/40" },
  broker: { icon: Building2, color: "text-purple-600 dark:text-purple-400", bgColor: "bg-purple-50 dark:bg-purple-950/40" },
};

function truncateAddress(addr?: string) {
  if (!addr) return "---";
  return `${addr.slice(0, 6)}...${addr.slice(-6)}`;
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
}

function devnetUrl(type: "accounts" | "transactions", id: string) {
  return `https://devnet.xrpl.org/${type}/${id}`;
}

function PartyCard({ party }: { party: Party }) {
  const config = ROLE_CONFIG[party.role];
  const Icon = config.icon;
  return (
    <Card data-testid={`card-party-${party.role}`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className={`p-2 rounded-md ${config.bgColor}`}>
            <Icon className={`w-5 h-5 ${config.color}`} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm">{party.label}</p>
            <p className="text-xs text-muted-foreground capitalize">{party.role}</p>
          </div>
        </div>
        {party.address ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <code className="text-xs text-muted-foreground font-mono truncate flex-1" data-testid={`text-address-${party.role}`}>
                {truncateAddress(party.address)}
              </code>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={() => copyToClipboard(party.address!)}
                data-testid={`button-copy-${party.role}`}
              >
                <Copy className="w-3 h-3" />
              </Button>
              <a href={devnetUrl("accounts", party.address!)} target="_blank" rel="noopener noreferrer">
                <Button size="icon" variant="ghost" className="h-6 w-6" data-testid={`button-explorer-${party.role}`}>
                  <ExternalLink className="w-3 h-3" />
                </Button>
              </a>
            </div>
            {party.balance && (
              <p className="text-xs text-muted-foreground">
                XRP: <span className="font-mono font-medium text-foreground">{party.balance}</span>
              </p>
            )}
            {party.usdBalance && (
              <p className="text-xs text-muted-foreground">
                USD: <span className="font-mono font-medium text-foreground">{party.usdBalance}</span>
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">Not funded yet</p>
        )}
      </CardContent>
    </Card>
  );
}

function StepItem({ step, index }: { step: FlowStep; index: number }) {
  const [expanded, setExpanded] = useState(false);

  const statusIcon = {
    pending: <Clock className="w-4 h-4 text-muted-foreground" />,
    running: <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />,
    success: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
    error: <XCircle className="w-4 h-4 text-destructive" />,
  }[step.status];

  const statusBadge = {
    pending: <Badge variant="secondary" className="text-xs">Pending</Badge>,
    running: <Badge variant="default" className="text-xs">Running</Badge>,
    success: <Badge variant="secondary" className="text-xs bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400">Success</Badge>,
    error: <Badge variant="destructive" className="text-xs">Failed</Badge>,
  }[step.status];

  const hasDetails = step.transactionHash || step.result || step.error || step.details;

  return (
    <div
      className={`border rounded-md transition-colors ${
        step.status === "running" ? "border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-950/20" :
        step.status === "error" ? "border-destructive/30 bg-destructive/5" : ""
      }`}
      data-testid={`step-item-${step.id}`}
    >
      <button
        className="w-full flex items-center gap-3 p-3 text-left"
        onClick={() => hasDetails && setExpanded(!expanded)}
        data-testid={`button-expand-step-${step.id}`}
      >
        <div className="flex items-center justify-center w-7 h-7 rounded-full bg-muted text-xs font-bold flex-shrink-0">
          {index + 1}
        </div>
        {statusIcon}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{step.title}</p>
          <p className="text-xs text-muted-foreground truncate">{step.description}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          {step.transactionType && (
            <Badge variant="outline" className="text-xs font-mono">{step.transactionType}</Badge>
          )}
          {statusBadge}
          {hasDetails && (
            expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {expanded && hasDetails && (
        <div className="px-3 pb-3 border-t pt-3 space-y-2">
          {step.transactionHash && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-medium">TX Hash:</span>
              <code className="text-xs font-mono text-muted-foreground flex-1 truncate" data-testid={`text-txhash-${step.id}`}>
                {step.transactionHash}
              </code>
              <Button size="icon" variant="ghost" onClick={() => copyToClipboard(step.transactionHash!)}>
                <Copy className="w-3 h-3" />
              </Button>
              <a href={devnetUrl("transactions", step.transactionHash!)} target="_blank" rel="noopener noreferrer">
                <Button size="icon" variant="ghost" data-testid={`button-explorer-tx-${step.id}`}>
                  <ExternalLink className="w-3 h-3" />
                </Button>
              </a>
            </div>
          )}
          {step.error && (
            <div className="p-2 bg-destructive/10 rounded-md">
              <p className="text-xs text-destructive font-mono whitespace-pre-wrap">{step.error}</p>
            </div>
          )}
          {step.details && (
            <div className="space-y-1">
              {Object.entries(step.details).map(([key, value]) => (
                <div key={key} className="flex items-start gap-2">
                  <span className="text-xs text-muted-foreground font-medium min-w-[100px]">{key}:</span>
                  <span className="text-xs font-mono text-foreground break-all">
                    {typeof value === "object" ? JSON.stringify(value, null, 2) : String(value)}
                  </span>
                </div>
              ))}
            </div>
          )}
          {step.result && !step.details && (
            <pre className="text-xs font-mono text-muted-foreground bg-muted/50 p-2 rounded-md overflow-auto max-h-60">
              {typeof step.result === "string" ? step.result : JSON.stringify(step.result, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function FlowDiagram({ scenarioId }: { scenarioId: ScenarioId }) {
  const scenario = SCENARIOS.find(s => s.id === scenarioId) || SCENARIOS[0];

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-2">
      {scenario.diagramSteps.map((s, i) => (
        <div key={i} className="flex items-center gap-1 flex-shrink-0">
          <div className="flex flex-col items-center gap-1 min-w-[80px]">
            <div className="text-[10px] text-muted-foreground font-medium">{s.actor}</div>
            <div className="px-2 py-1 bg-muted rounded-md text-[11px] font-medium text-center whitespace-nowrap">
              {s.label}
            </div>
          </div>
          {i < scenario.diagramSteps.length - 1 && <ArrowRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
        </div>
      ))}
    </div>
  );
}

const initialState: FlowState = {
  status: "idle",
  parties: [
    { role: "issuer", label: "USD Issuer" },
    { role: "lender", label: "Lender" },
    { role: "borrower", label: "Borrower" },
    { role: "broker", label: "Broker" },
  ],
  steps: [],
  network: "wss://s.devnet.rippletest.net:51233",
};

export default function Dashboard() {
  const [state, setState] = useState<FlowState>(initialState);
  const [rawReport, setRawReport] = useState<string>("");
  const [showReport, setShowReport] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState<ScenarioId>("loan-creation");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = useCallback(() => {
    const timestamp = Date.now();
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      scenarioId: selectedScenario,
      state,
      report: rawReport,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `xrpl-flow-${selectedScenario}-${timestamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [state, rawReport, selectedScenario]);

  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (!parsed.version || !parsed.state?.parties) {
          alert("Invalid flow data file.");
          return;
        }
        setState(parsed.state);
        setRawReport(parsed.report || "");
        setShowReport(false);
        if (parsed.scenarioId) {
          setSelectedScenario(parsed.scenarioId);
        }
      } catch {
        alert("Failed to parse the imported file.");
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const startFlow = useCallback(() => {
    setState({
      ...initialState,
      status: "running",
      scenarioId: selectedScenario,
    });
    setRawReport("");
    setShowReport(false);

    const emit = (event: { type: string; data: any }) => {
      if (event.type === "step_update") {
        const step = event.data as FlowStep;
        setState((prev) => {
          const existing = prev.steps.findIndex((s) => s.id === step.id);
          const newSteps = [...prev.steps];
          if (existing >= 0) {
            newSteps[existing] = step;
          } else {
            newSteps.push(step);
          }
          return { ...prev, steps: newSteps };
        });
      } else if (event.type === "party_update") {
        const party = event.data as Party;
        setState((prev) => ({
          ...prev,
          parties: prev.parties.map((p) =>
            p.role === party.role ? { ...p, ...party } : p
          ),
        }));
      } else if (event.type === "state_update") {
        setState((prev) => ({ ...prev, ...event.data }));
      } else if (event.type === "flow_complete") {
        setState((prev) => ({ ...prev, status: "completed", completedAt: new Date().toISOString() }));
        setRawReport(event.data.report || "");
      } else if (event.type === "flow_error") {
        setState((prev) => ({ ...prev, status: "error", errorMessage: event.data.message }));
        setRawReport(event.data.report || "");
      }
    };

    runLendingFlow(emit, selectedScenario).catch((err) => {
      setState((prev) => ({ ...prev, status: "error", errorMessage: err.message }));
    });
  }, [selectedScenario]);

  const totalSteps = state.steps.length || 13;
  const completedSteps = state.steps.filter((s) => s.status === "success").length;
  const progress = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

  const currentScenario = SCENARIOS.find(s => s.id === selectedScenario) || SCENARIOS[0];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-md">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold" data-testid="text-page-title">XRPL Lending Protocol Demo</h1>
              <p className="text-xs text-muted-foreground">XLS-66 Lending + XLS-65 Vault | End-to-End Flow</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="font-mono text-xs" data-testid="text-network">
              Devnet
            </Badge>
            <ThemeToggle />
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={state.status === "idle"}
              data-testid="button-export-flow"
            >
              <Download className="w-4 h-4" />
              Export
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              data-testid="button-import-flow"
            >
              <Upload className="w-4 h-4" />
              Import
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImport}
            />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md text-xs text-amber-800 dark:text-amber-300" data-testid="banner-session-warning">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>Run data is temporary and will be lost when you refresh the page. Use Export to save your results.</span>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ArrowRight className="w-4 h-4" />
              Scenario
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
              {SCENARIOS.map((scenario) => (
                <button
                  key={scenario.id}
                  onClick={() => {
                    if (state.status !== "running") {
                      setSelectedScenario(scenario.id);
                    }
                  }}
                  disabled={state.status === "running"}
                  className={`p-3 rounded-md border text-left transition-colors ${
                    selectedScenario === scenario.id
                      ? "border-primary bg-primary/5"
                      : "hover-elevate"
                  } ${state.status === "running" ? "opacity-50 cursor-not-allowed" : ""}`}
                  data-testid={`button-scenario-${scenario.id}`}
                >
                  <p className="text-xs font-semibold mb-1">{scenario.name}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">{scenario.description}</p>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <Button
                onClick={startFlow}
                disabled={state.status === "running"}
                data-testid="button-run-flow"
              >
                {state.status === "running" ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Running {currentScenario.name}...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Run {currentScenario.name}
                  </>
                )}
              </Button>
              <p className="text-xs text-muted-foreground">{currentScenario.description}</p>
            </div>
            <FlowDiagram scenarioId={selectedScenario} />
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {state.parties.map((party) => (
            <PartyCard key={party.role} party={party} />
          ))}
        </div>

        {state.status !== "idle" && (
          <>
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <CardTitle className="text-sm font-semibold">
                    Execution Steps
                    <span className="ml-2 text-muted-foreground font-normal">
                      ({completedSteps}/{state.steps.length})
                    </span>
                  </CardTitle>
                  {state.status === "running" && (
                    <div className="w-32 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
                    </div>
                  )}
                  {state.status === "completed" && (
                    <Badge variant="secondary" className="bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="w-3 h-3 mr-1" /> Complete
                    </Badge>
                  )}
                  {state.status === "error" && (
                    <Badge variant="destructive">
                      <XCircle className="w-3 h-3 mr-1" /> Error
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="max-h-[600px] overflow-y-auto space-y-2 pr-1">
                  {state.steps.map((step, i) => (
                    <StepItem key={step.id} step={step} index={i} />
                  ))}
                </div>
                {state.errorMessage && (
                  <div className="mt-3 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                    <p className="text-sm text-destructive font-medium">{state.errorMessage}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {rawReport && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      Detailed Report
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(rawReport)}
                        data-testid="button-copy-report"
                      >
                        <Copy className="w-3 h-3" />
                        Copy
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowReport(!showReport)}
                        data-testid="button-toggle-report"
                      >
                        {showReport ? "Hide" : "Show"} Report
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                {showReport && (
                  <CardContent>
                    <div className="max-h-[800px] overflow-y-auto pr-1">
                      <pre className="text-xs font-mono text-foreground whitespace-pre-wrap bg-muted/30 p-4 rounded-md" data-testid="text-report-content">
                        {rawReport}
                      </pre>
                    </div>
                  </CardContent>
                )}
              </Card>
            )}
          </>
        )}

        {state.status === "idle" && (
          <Card>
            <CardContent className="py-12 flex flex-col items-center gap-4 text-center">
              <div className="p-4 bg-muted rounded-full">
                <Play className="w-8 h-8 text-muted-foreground" />
              </div>
              <div>
                <h3 className="text-base font-semibold mb-1">Ready to Run</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  Select a scenario above and click "Run" to execute on the XRPL Devnet.
                  Each scenario creates 4 wallets, sets up the lending infrastructure,
                  and demonstrates different parts of the XLS-66 lending protocol.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
