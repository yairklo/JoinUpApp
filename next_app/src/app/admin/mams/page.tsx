"use client";

import React, { useState, useEffect } from "react";
import {
  Activity,
  Terminal,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Play,
  Square,
  RefreshCw,
  Coins,
  Cpu,
  Database,
  User,
  Clock,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Plus,
  X
} from "lucide-react";

interface TaskSummary {
  taskId: string;
  status: string;
  executionTier: string;
  blueprintStepIndex: number;
  blueprintTotalSteps: number;
  orchestrationRunning: boolean;
  aggregatedTokenUsage: {
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
  };
}

interface ToolCall {
  toolName: string;
  args: any;
  ok: boolean;
  errorMessage: string | null;
}

interface PersistedStep {
  stepId: string;
  stepIndex: number;
  agentId: string;
  role: string;
  narrativeSummary: string;
  toolCalls: ToolCall[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
    provider: string;
    modelId: string;
  };
  timestampMs: number;
  createdAt: string;
}

interface TaskDetail {
  taskId: string;
  status: string;
  executionTier: string;
  history: string[];
  blueprintStepIndex: number;
  blueprintTotalSteps: number;
  architectureAlignmentStatus: string;
  awaitingApprovalKind: string | null;
  orchestrationRunning: boolean;
  steps: PersistedStep[];
  recentTools: string[];
  liveProgress: {
    percent: number;
    currentStep: number;
    totalSteps: number;
  };
  runtime?: {
    changedFiles?: string[];
    meaningfulChangedFiles?: string[];
  };
}

const BACKEND_URL = "http://localhost:8080";

const isTerminalStatus = (status: string) => {
  return ["DONE", "FAILED", "ABORTED_FUSE", "CANCELLED", "ABORTED"].includes(status);
};

export default function MamsDashboard() {
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string>("");
  const [taskDetail, setTaskDetail] = useState<TaskDetail | null>(null);
  const [userGuidance, setUserGuidance] = useState<string>("");
  const [loadingList, setLoadingList] = useState<boolean>(true);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Task creation form state
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [newObjective, setNewObjective] = useState<string>("");
  const [newExecutionTier, setNewExecutionTier] = useState<string>("TIER2_STANDARD");
  const [newCriteriaText, setNewCriteriaText] = useState<string>("");
  const [newPreferredProvider, setNewPreferredProvider] = useState<string>("AUTO");
  const [newModelOverride, setNewModelOverride] = useState<string>("");
  const [newDeadlineHours, setNewDeadlineHours] = useState<string>("1");
  const [submittingForm, setSubmittingForm] = useState<boolean>(false);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newObjective.trim()) return;
    setSubmittingForm(true);

    const criteria = newCriteriaText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const deadlineMs = Math.round(Number(newDeadlineHours || 1) * 3600 * 1000);

    const body: any = {
      objective: newObjective.trim(),
      executionTier: newExecutionTier,
      acceptanceCriteria: criteria,
      deadlineMs: isNaN(deadlineMs) || deadlineMs <= 0 ? 3600000 : deadlineMs,
    };

    if (newPreferredProvider !== "AUTO") {
      body.preferredProvider = newPreferredProvider;
    }
    if (newModelOverride.trim()) {
      body.modelOverride = newModelOverride.trim();
    }

    try {
      const res = await fetch(`${BACKEND_URL}/api/mams/task/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || "Failed to launch pipeline");
      }

      const data = await res.json();
      const newTaskId = data.taskId;

      // Close modal & reset fields
      setShowCreateModal(false);
      setNewObjective("");
      setNewCriteriaText("");
      setNewExecutionTier("TIER2_STANDARD");
      setNewPreferredProvider("AUTO");
      setNewModelOverride("");
      setNewDeadlineHours("1");

      // Refresh list & select the newly created task
      await fetchTaskList();
      setSelectedTaskId(newTaskId);
    } catch (err: any) {
      alert(`Error starting task: ${err.message}`);
    } finally {
      setSubmittingForm(false);
    }
  };

  // Load task list
  const fetchTaskList = async () => {
    try {
      setErrorMsg(null);
      const res = await fetch(`${BACKEND_URL}/api/mams/tasks`);
      if (!res.ok) throw new Error("Failed to fetch task list");
      const data = await res.json();
      setTasks(data.tasks || []);
    } catch (err: any) {
      console.error(err);
      setErrorMsg("MAMS Backend unavailable or CORS error.");
    } finally {
      setLoadingList(false);
    }
  };

  // Load task detail
  const fetchTaskDetail = async (id: string) => {
    if (!id) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/mams/task/${id}`);
      if (!res.ok) throw new Error("Failed to fetch task detail");
      const data = await res.json();
      setTaskDetail(data);
    } catch (err) {
      console.error(err);
    }
  };

  // Poll list on mount and task detail when selected
  useEffect(() => {
    fetchTaskList();
    const interval = setInterval(fetchTaskList, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!selectedTaskId) {
      setTaskDetail(null);
      return;
    }
    setLoadingDetail(true);
    fetchTaskDetail(selectedTaskId).finally(() => setLoadingDetail(false));

    // Poll detail every 3 seconds while orchestration is running
    const interval = setInterval(() => {
      fetchTaskDetail(selectedTaskId);
    }, 3000);

    return () => clearInterval(interval);
  }, [selectedTaskId]);

  const handleSelectTask = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedTaskId(e.target.value);
  };

  const handleAbort = async () => {
    if (!selectedTaskId) return;
    if (!confirm("Are you sure you want to abort this task?")) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/mams/task/${selectedTaskId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ by: "human", reason: "Aborted from dashboard console" })
      });
      if (!res.ok) throw new Error("Failed to abort task");
      fetchTaskDetail(selectedTaskId);
      fetchTaskList();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleResume = async () => {
    if (!selectedTaskId) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/mams/task/${selectedTaskId}/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userGuidance })
      });
      if (!res.ok) throw new Error("Failed to resume task");
      setUserGuidance("");
      fetchTaskDetail(selectedTaskId);
      fetchTaskList();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const toggleStep = (stepId: string) => {
    setExpandedSteps((prev) => ({ ...prev, [stepId]: !prev[stepId] }));
  };

  // Compute metrics from current task steps
  const steps = taskDetail?.steps || [];
  const totalCost = steps.reduce((sum, s) => sum + (s.usage?.estimatedCostUsd || 0), 0);
  const totalInputTokens = steps.reduce((sum, s) => sum + (s.usage?.inputTokens || 0), 0);
  const totalOutputTokens = steps.reduce((sum, s) => sum + (s.usage?.outputTokens || 0), 0);

  // Compute cost breakdown by role
  const costByRole: Record<string, number> = {};
  steps.forEach((s) => {
    const role = s.role || "UNKNOWN";
    costByRole[role] = (costByRole[role] || 0) + (s.usage?.estimatedCostUsd || 0);
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "DONE":
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
      case "FAILED":
      case "ABORTED_FUSE":
        return "bg-rose-500/10 text-rose-400 border-rose-500/20";
      case "ESCALATED":
        return "bg-amber-500/10 text-amber-400 border-amber-500/20";
      default:
        return "bg-blue-500/10 text-blue-400 border-blue-500/20";
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case "ARCHITECT":
        return "bg-purple-500/20 text-purple-300 border-purple-500/30";
      case "CODER":
        return "bg-sky-500/20 text-sky-300 border-sky-500/30";
      case "TESTER":
        return "bg-indigo-500/20 text-indigo-300 border-indigo-500/30";
      case "QA":
        return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
      case "SPEC_REVIEWER":
        return "bg-pink-500/20 text-pink-300 border-pink-500/30";
      case "SUPERVISOR":
        return "bg-amber-500/20 text-amber-300 border-amber-500/30";
      default:
        return "bg-gray-500/20 text-gray-300 border-gray-500/30";
    }
  };

  return (
    <div className="flex-1 bg-gray-950 text-gray-100 min-h-screen font-sans p-6 pt-24">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-800 pb-5">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
              <Activity className="text-blue-500 h-8 w-8 animate-pulse" />
              MAMS Control Center
            </h1>
            <p className="text-sm text-gray-400 mt-1">
              Real-time multi-agent pipeline monitoring, budget tracking, and human-in-the-loop console.
            </p>
          </div>

          {/* Task Selector */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-400 flex items-center gap-1">
              <Terminal className="h-4 w-4" /> Monitor Task:
            </span>
            <select
              value={selectedTaskId}
              onChange={handleSelectTask}
              className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[280px] max-w-sm"
            >
              <option value="">-- Choose an active/past pipeline --</option>
              {tasks.map((task) => (
                <option key={task.taskId} value={task.taskId}>
                  [{task.status}] {task.taskId.slice(0, 8)}... ({task.executionTier})
                </option>
              ))}
            </select>
            <button
              onClick={fetchTaskList}
              className="p-2 bg-gray-900 hover:bg-gray-800 border border-gray-800 rounded-lg transition"
              title="Refresh Task List"
            >
              <RefreshCw className={`h-4 w-4 text-gray-400 ${loadingList ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition flex items-center gap-1.5 shadow"
            >
              <Plus className="h-4 w-4" /> Launch Pipeline
            </button>
          </div>
        </div>

        {/* Global Error Notice */}
        {errorMsg && (
          <div className="bg-red-950/20 border border-red-900/50 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="text-red-500 h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-red-400">Connection Error</h4>
              <p className="text-sm text-gray-300 mt-0.5">{errorMsg}</p>
            </div>
          </div>
        )}

        {/* If no task is selected */}
        {!selectedTaskId && (
          <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-12 text-center flex flex-col items-center justify-center">
            <Terminal className="text-gray-600 h-16 w-16 mb-4" />
            <h3 className="text-xl font-semibold text-gray-300">No Task Selected</h3>
            <p className="text-sm text-gray-500 max-w-md mt-2">
              Select an active agent pipeline from the dropdown in the top-right corner to view metrics, timeline actions, and controls.
            </p>
          </div>
        )}

        {selectedTaskId && taskDetail && (
          <>
            {/* Metrics Bar */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Cost Card */}
              <div className="bg-gray-900 border border-gray-800/80 rounded-2xl p-5 relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Estimated Task Cost</span>
                  <Coins className="text-amber-500 h-5 w-5" />
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-white">${totalCost.toFixed(4)}</span>
                  <span className="text-xs text-gray-500">USD</span>
                </div>
                {/* Cost breakdown badges */}
                <div className="mt-4 flex flex-wrap gap-2">
                  {Object.entries(costByRole).map(([role, cost]) => (
                    <span key={role} className="text-[10px] font-mono px-2 py-0.5 bg-gray-950 border border-gray-800 rounded-md text-gray-300">
                      {role}: <span className="text-amber-400 font-semibold">${cost.toFixed(4)}</span>
                    </span>
                  ))}
                  {Object.keys(costByRole).length === 0 && (
                    <span className="text-xs text-gray-600 italic">No budget spent yet</span>
                  )}
                </div>
              </div>

              {/* Input Tokens */}
              <div className="bg-gray-900 border border-gray-800/80 rounded-2xl p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Input Tokens</span>
                  <Cpu className="text-blue-400 h-5 w-5" />
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-white">{totalInputTokens.toLocaleString()}</span>
                  <span className="text-xs text-gray-500">tokens</span>
                </div>
                <p className="text-[10px] text-gray-500 mt-4">
                  Sent to LLM models (Gemini / Claude Sonnet) across all rounds.
                </p>
              </div>

              {/* Output Tokens */}
              <div className="bg-gray-900 border border-gray-800/80 rounded-2xl p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Output Tokens</span>
                  <Database className="text-indigo-400 h-5 w-5" />
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-white">{totalOutputTokens.toLocaleString()}</span>
                  <span className="text-xs text-gray-500">tokens</span>
                </div>
                <p className="text-[10px] text-gray-500 mt-4">
                  Generated by developer agents (write_file, plans, tests).
                </p>
              </div>
            </div>

            {/* Task Info & Control Panel */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Task Details Info Box */}
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Terminal className="text-gray-400 h-5 w-5" /> Pipeline Metadata
                </h3>
                
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between py-1 border-b border-gray-800/50">
                    <span className="text-gray-400">Task ID</span>
                    <span className="font-mono text-xs text-gray-300 select-all">{taskDetail.taskId}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-gray-800/50">
                    <span className="text-gray-400">Current Status</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 border rounded-full ${getStatusColor(taskDetail.status)}`}>
                      {taskDetail.status}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-gray-800/50">
                    <span className="text-gray-400">Execution Tier</span>
                    <span className="text-gray-200 font-medium">{taskDetail.executionTier}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-gray-800/50">
                    <span className="text-gray-400">Orchestrator Thread</span>
                    <span className="flex items-center gap-1.5">
                      <span className={`h-2.5 w-2.5 rounded-full ${taskDetail.orchestrationRunning ? "bg-emerald-500 animate-ping" : "bg-gray-600"}`}></span>
                      <span className="text-gray-300 font-medium">{taskDetail.orchestrationRunning ? "RUNNING" : "PAUSED"}</span>
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-gray-800/50">
                    <span className="text-gray-400">Blueprint Progress</span>
                    <span className="text-gray-300 font-mono">
                      {taskDetail.blueprintStepIndex} / {taskDetail.blueprintTotalSteps} steps
                    </span>
                  </div>
                </div>

                {/* Progress Bar */}
                {taskDetail.blueprintTotalSteps > 0 && (
                  <div className="space-y-1.5 pt-2">
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>Blueprint Step Progress</span>
                      <span>{taskDetail.liveProgress.percent}%</span>
                    </div>
                    <div className="w-full bg-gray-950 h-2 rounded-full overflow-hidden border border-gray-800">
                      <div
                        className="bg-blue-500 h-full rounded-full transition-all duration-500"
                        style={{ width: `${taskDetail.liveProgress.percent}%` }}
                      ></div>
                    </div>
                  </div>
                )}

                {/* Recent Tools */}
                <div className="pt-2">
                  <span className="text-xs font-semibold text-gray-400 block mb-2">Recent Tools Invocations</span>
                  <div className="flex flex-wrap gap-1.5">
                    {taskDetail.recentTools.map((tool, idx) => (
                      <span key={idx} className="text-[10px] bg-gray-950 border border-gray-850 px-2 py-0.5 rounded font-mono text-gray-300">
                        {tool}
                      </span>
                    ))}
                    {taskDetail.recentTools.length === 0 && (
                      <span className="text-xs text-gray-600 italic">No tools run yet</span>
                    )}
                  </div>
                </div>

                {/* Changed Files */}
                {taskDetail.runtime?.changedFiles && taskDetail.runtime.changedFiles.length > 0 && (
                  <div className="pt-2 border-t border-gray-800/50">
                    <span className="text-xs font-semibold text-gray-400 block mb-2">Changed Workspace Files</span>
                    <div className="max-h-28 overflow-y-auto space-y-1 bg-gray-950 p-2 rounded-lg border border-gray-850">
                      {taskDetail.runtime.changedFiles.map((file, idx) => (
                        <div key={idx} className="text-[10px] font-mono text-sky-400 truncate">
                          {file}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Control Panel (HITL Console) */}
              <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-2xl p-5 flex flex-col justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <User className="text-blue-400 h-5 w-5" /> Human-in-the-Loop Console
                  </h3>
                  <p className="text-xs text-gray-400 mt-1">
                    Control active pipelines, abort failing runs, or resume escalated tasks with direct instructions.
                  </p>

                  {/* Context State Renderers */}
                  <div className="mt-4">
                    {taskDetail.status === "ESCALATED" && (
                      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 space-y-3">
                        <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
                          <AlertTriangle className="h-5 w-5 shrink-0" />
                          MAMS Agent Requires Input (Escalated)
                        </div>
                        <p className="text-xs text-gray-300">
                          The agent hit a blocking threshold, test budget exhaustion, or is awaiting specification alignment. Review the timeline below and supply guidance to resume the turn.
                        </p>
                        
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-gray-300">Provide User Guidance / Reply:</label>
                          <textarea
                            value={userGuidance}
                            onChange={(e) => setUserGuidance(e.target.value)}
                            placeholder="Tell the agent what to fix, skip, or modify next (e.g. 'Use the mocked auth bypass instead of calling clerk API...')"
                            className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-amber-500 min-h-[90px]"
                          />
                        </div>
                      </div>
                    )}

                    {taskDetail.status !== "ESCALATED" && !taskDetail.orchestrationRunning && !isTerminalStatus(taskDetail.status) && (
                      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 text-xs text-gray-300">
                        Task orchestration is currently paused. You can resume it to continue agent execution.
                      </div>
                    )}

                    {taskDetail.orchestrationRunning && (
                      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-emerald-400 text-xs">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                          </span>
                          Agent pipeline actively running...
                        </div>
                        <span className="text-[10px] text-gray-500 italic">Polling database updates</span>
                      </div>
                    )}

                    {isTerminalStatus(taskDetail.status) && (
                      <div className="bg-gray-800/40 border border-gray-800 rounded-xl p-4 text-xs text-gray-400 italic">
                        This task is in a terminal status ({taskDetail.status}) and cannot be modified.
                      </div>
                    )}
                  </div>
                </div>

                {/* Operations Buttons */}
                <div className="flex items-center justify-end gap-3 mt-5 pt-3 border-t border-gray-800/50">
                  {/* Cancel/Abort button */}
                  {!isTerminalStatus(taskDetail.status) && (
                    <button
                      onClick={handleAbort}
                      className="px-4 py-2 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1.5 shadow"
                    >
                      <Square className="h-3.5 w-3.5 fill-current" /> Abort Task
                    </button>
                  )}

                  {/* Resume Pipeline button */}
                  {taskDetail.status === "ESCALATED" && (
                    <button
                      onClick={handleResume}
                      disabled={!userGuidance.trim()}
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 disabled:opacity-50 disabled:pointer-events-none text-gray-950 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow"
                    >
                      <Play className="h-3.5 w-3.5 fill-current" /> Resume Agent Pipeline
                    </button>
                  )}

                  {/* Resume Paused Task */}
                  {taskDetail.status !== "ESCALATED" && !taskDetail.orchestrationRunning && !isTerminalStatus(taskDetail.status) && (
                    <button
                      onClick={handleResume}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1.5 shadow"
                    >
                      <Play className="h-3.5 w-3.5 fill-current" /> Resume Pipeline
                    </button>
                  )}
                </div>
              </div>

            </div>

            {/* Live Steps Timeline */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-6">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Terminal className="text-blue-500 h-5 w-5" /> Execution Timeline & Step Feed
                </h3>
                <p className="text-xs text-gray-400 mt-1">
                  Chronological order of actions taken by autonomous agent instances on this workspace.
                </p>
              </div>

              <div className="relative border-l border-gray-800 ml-4 pl-6 space-y-8">
                {taskDetail.steps.map((step, idx) => {
                  const stepId = step.stepId;
                  const isExpanded = !!expandedSteps[stepId];
                  const timestamp = new Date(step.timestampMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

                  return (
                    <div key={stepId} className="relative">
                      {/* Circle indicator */}
                      <span className="absolute -left-[31px] top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-gray-900 border border-gray-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-500"></span>
                      </span>

                      {/* Step Card */}
                      <div className="bg-gray-950 border border-gray-850 rounded-xl p-4 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-900 pb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-gray-400">#{step.stepIndex + 1}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 border rounded ${getRoleColor(step.role)}`}>
                              {step.role}
                            </span>
                            <span className="text-xs text-gray-500 font-mono">({step.agentId})</span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-500">
                            <span className="flex items-center gap-1 font-mono text-[10px] bg-gray-900 px-2 py-0.5 rounded">
                              <Coins className="h-3 w-3 text-amber-500" /> ${(step.usage?.estimatedCostUsd || 0).toFixed(4)}
                            </span>
                            <span className="flex items-center gap-1 font-mono text-[10px] bg-gray-900 px-2 py-0.5 rounded">
                              {step.usage?.modelId || "unknown"}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" /> {timestamp}
                            </span>
                          </div>
                        </div>

                        {/* Narrative summary */}
                        <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
                          {step.narrativeSummary}
                        </div>

                        {/* Tool Calls Toggle */}
                        {step.toolCalls && step.toolCalls.length > 0 && (
                          <div className="pt-2">
                            <button
                              onClick={() => toggleStep(stepId)}
                              className="text-xs text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1.5"
                            >
                              {isExpanded ? (
                                <>
                                  Hide Tool Activity <ChevronUp className="h-3.5 w-3.5" />
                                </>
                              ) : (
                                <>
                                  Show Tool Activity ({step.toolCalls.length} calls) <ChevronDown className="h-3.5 w-3.5" />
                                </>
                              )}
                            </button>

                            {/* Tool Calls List */}
                            {isExpanded && (
                              <div className="mt-3 space-y-2.5">
                                {step.toolCalls.map((call, cIdx) => (
                                  <div
                                    key={cIdx}
                                    className={`p-3 rounded-lg border text-xs font-mono space-y-2 ${
                                      call.ok
                                        ? "bg-gray-900/60 border-gray-850 text-gray-300"
                                        : "bg-rose-950/20 border-rose-900/50 text-rose-300"
                                    }`}
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="font-semibold text-gray-200">
                                        call: <span className="text-sky-400">{call.toolName}</span>
                                      </span>
                                      <span className="flex items-center gap-1">
                                        {call.ok ? (
                                          <CheckCircle className="text-emerald-500 h-3.5 w-3.5" />
                                        ) : (
                                          <XCircle className="text-rose-500 h-3.5 w-3.5" />
                                        )}
                                        {call.ok ? "Success" : "Failed"}
                                      </span>
                                    </div>

                                    {/* Arguments */}
                                    {call.args && (
                                      <div className="bg-gray-950 p-2 rounded border border-gray-900 text-[10px] text-gray-400 overflow-x-auto">
                                        args: {JSON.stringify(call.args, null, 2)}
                                      </div>
                                    )}

                                    {/* Error message */}
                                    {!call.ok && call.errorMessage && (
                                      <div className="text-[10px] text-rose-400 font-sans border-t border-rose-950 pt-2 mt-1">
                                        <span className="font-semibold">Error detail:</span> {call.errorMessage}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {taskDetail.steps.length === 0 && (
                  <div className="text-center py-8 text-gray-600 italic text-sm">
                    No steps have been recorded for this pipeline yet.
                  </div>
                )}
              </div>
            </div>
          </>
        )}
        {/* Create Task Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Play className="text-blue-500 h-5 w-5 fill-current" />
                  Launch New Agent Pipeline
                </h2>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="p-1 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Modal Body */}
              <form onSubmit={handleCreateTask} className="flex-1 overflow-y-auto p-6 space-y-4">
                {/* Objective */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider block">
                    Task Objective *
                  </label>
                  <textarea
                    required
                    value={newObjective}
                    onChange={(e) => setNewObjective(e.target.value)}
                    placeholder="Describe exactly what the developer agent should do (e.g., 'Fix game ratings panel styling to match layout.tsx...')"
                    className="w-full bg-gray-950 border border-gray-800 rounded-lg p-3 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px]"
                  />
                </div>

                {/* Execution Tier & Deadline */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider block">
                      Execution Tier
                    </label>
                    <select
                      value={newExecutionTier}
                      onChange={(e) => setNewExecutionTier(e.target.value)}
                      className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="TIER1_FAST_TRACK">Tier 1: Fast Track (Single Coder turn)</option>
                      <option value="TIER2_STANDARD">Tier 2: Standard (Planning + Coder)</option>
                      <option value="TIER3_CRITICAL">Tier 3: Critical (Architect + Planning + E2E)</option>
                      <option value="TIER4_ENTERPRISE_E2E">Tier 4: Enterprise E2E (Full hardening)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider block">
                      Deadline (Hours)
                    </label>
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={newDeadlineHours}
                      onChange={(e) => setNewDeadlineHours(e.target.value)}
                      className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Acceptance Criteria */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider block">
                    Acceptance Criteria (one per line)
                  </label>
                  <textarea
                    value={newCriteriaText}
                    onChange={(e) => setNewCriteriaText(e.target.value)}
                    placeholder="e.g.&#10;Verify user rating persists on Neon&#10;No compile errors in next_app lint"
                    className="w-full bg-gray-950 border border-gray-800 rounded-lg p-3 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px]"
                  />
                </div>

                {/* Advanced Providers */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-gray-850 pt-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider block">
                      Preferred Provider
                    </label>
                    <select
                      value={newPreferredProvider}
                      onChange={(e) => setNewPreferredProvider(e.target.value)}
                      className="w-full bg-gray-950 border border-gray-850 rounded-lg p-2.5 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="AUTO">Auto (Balanced routing)</option>
                      <option value="GOOGLE">Google Generative AI (Flash/Pro)</option>
                      <option value="ANTHROPIC">Anthropic (Claude Sonnet 3.5)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider block">
                      Model Override (Optional)
                    </label>
                    <input
                      type="text"
                      value={newModelOverride}
                      onChange={(e) => setNewModelOverride(e.target.value)}
                      placeholder="e.g. claude-3-5-sonnet-latest"
                      className="w-full bg-gray-950 border border-gray-850 rounded-lg p-2.5 text-sm text-gray-200 placeholder-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Footer Buttons */}
                <div className="flex items-center justify-end gap-3 border-t border-gray-850 pt-4 mt-6">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm font-semibold transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingForm}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold transition flex items-center gap-1.5 shadow"
                  >
                    {submittingForm ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" /> Launching...
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 fill-current" /> Launch Pipeline
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
