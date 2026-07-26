"use client";

import { useState } from "react";
import { useAppStore } from "@/store/app-store";
import { GlassCard } from "@/components/ui/glass-card";
import { FileText, TrendingUp, Users, Plus } from "lucide-react";
import { PortfolioReport } from "@/lib/types";

export default function ReportHistoryTab() {
  const { reports, setTab } = useAppStore();
  const [loading, setLoading] = useState(false);

  // Simulate loading report details
  const viewReport = async (reportId: string) => {
    setLoading(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    setLoading(false);
    // In a real app, this would navigate to a report detail page
    alert(`Viewing report: ${reportId}`);
  };

  // Simulate regenerating a report
  const regenerateReport = async (reportId: string) => {
    setLoading(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));
    setLoading(false);
    // In a real app, this would regenerate the report and update the list
    alert(`Regenerating report: ${reportId}`);
    setTab("builder");
  };

  // Simulate deleting a report
  const deleteReport = (reportId: string) => {
    if (window.confirm("Are you sure you want to delete this report? This action cannot be undone.")) {
      // In a real app, this would make an API call to delete the report
      alert(`Deleted report: ${reportId}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col items-center justify-between pb-4">
        <div className="w-full flex justify-between items-center mb-4">
          <div>
            <h2 className="text-2xl font-bold text-white">Report History</h2>
            <p className="text-slate-400 max-w-xl">
              View and manage your previously generated portfolio reports
            </p>
          </div>

          {/* Stats overview */}
          <div className="text-right space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4 text-blue-400" />
              <span className="font-medium">Total Reports: {reports.length}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <TrendingUp className="h-4 w-4 text-green-400" />
              <span className="font-medium">Success Rate: 98%</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4 text-purple-400" />
              <span className="font-medium">Avg. Return: 14.2%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Reports List */}
      <div className="space-y-4">
        {reports.length > 0 ? (
          reports.map((report) => (
            <GlassCard key={report.id} className="group hover:shadow-lg transition-shadow">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 flex items-center justify-center rounded-full ${
                    report.status === "success" ? "bg-emerald-500/20 text-emerald-400" :
                    report.status === "failed" ? "bg-red-500/20 text-red-400" :
                    "bg-slate-500/20 text-slate-400"
                  }`}>
                    {report.status === "success" && <Check className="w-5 h-5" />}
                    {report.status === "failed" && <X className="w-5 h-5" />}
                    {report.status === "pending" && <Loader2 className="w-5 h-5 animate-spin" />}
                  </div>
                  <div>
                    <div className="font-semibold text-white">{report.title}</div>
                    <p className="text-sm text-slate-400">{report.description}</p>
                    <div className="text-xs text-slate-400 mt-1">
                      {new Date(report.date).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <div className="text-right space-y-1">
                  <span className={`text-xs font-medium ${
                    report.status === "success" ? "text-emerald-400" :
                    report.status === "failed" ? "text-red-400" :
                    "text-slate-400"
                  }`}>
                    {report.status.toUpperCase()}
                  </span>
                  {report.type && (
                    <span className="text-xs text-slate-400">
                      {report.type.toUpperCase()}
                    </span>
                  )}
                </div>
              </div>

            {/* Report Metrics */}
            {report.metrics && (
              <div className="grid grid-cols-2 gap-4 mb-4 pt-4 border-t border-slate-800/50">
                <div className="text-center">
                  <div className="text-xs text-slate-400">Total Value</div>
                  <div className="font-medium text-white">${report.metrics.totalValue?.toLocaleString() || '0'}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-slate-400">Risk Score</div>
                  <div className="font-medium text-white">{report.metrics.riskScore || 'N/A'}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-slate-400">Sharpe Ratio</div>
                  <div className="font-medium text-white">{report.metrics.sharpe || 'N/A'}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-slate-400">Volatility</div>
                  <div className="font-medium text-white">{report.metrics.volatility?.toFixed(1)}%</div>
                </div>
              </div>
            )}

            {/* Holdings Summary */}
            {report.holdings && report.holdings.length > 0 && (
              <div className="mb-4 pt-4 border-t border-slate-800/50">
                <div className="mb-3">
                  <div className="flex items-center gap-2">
                    <Folder className="w-4 h-4 text-slate-400" />
                    <span className="font-medium text-white">Holdings ({report.holdings.length})</span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-800/50">
                      <tr>
                        <th className="text-left p-3 font-medium text-slate-400">Token</th>
                        <th className="text-center p-3 font-medium text-slate-400">Amount</th>
                        <th className="text-center p-3 font-medium text-slate-400">Price</th>
                        <th className="text-center p-3 font-medium text-slate-400">Value</th>
                        <th className="text-center p-3 font-medium text-slate-400">Chain</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {report.holdings.map((holding) => (
                        <tr key={`${report.id}-${holding.token}`} className="hover:bg-slate-800/30 transition-colors cursor-default">
                          <td className="p-3 text-slate-400 font-mono">{holding.token}</td>
                          <td className="p-3 text-center text-slate-400 font-mono">{holding.amount.toFixed(4)}</td>
                          <td className="p-3 text-center text-slate-400 font-mono">${holding.price.toFixed(2)}</td>
                          <td className="p-3 text-center text-slate-400 font-mono">${holding.value.toLocaleString()}</td>
                          <td className="p-3 text-center text-slate-400 font-mono">{holding.chain}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Recommendations */}
            {report.recommendations && report.recommendations.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-800/50">
                <div className="mb-3">
                  <div className="flex items-center gap-2">
                    <Lightbulb className="w-4 h-4 text-yellow-400" />
                    <span className="font-medium text-white">Recommendations</span>
                  </div>
                </div>
                <div className="space-y-2">
                  {report.recommendations.map((rec, index) => (
                    <div key={index} className="flex items-start gap-3">
                      <Dot className="h-2.5 w-2.5 bg-green-400/50 rounded-full mt-1" />
                      <p className="text-sm text-slate-400">{rec}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => viewReport(report.id)}
                disabled={loading}
                className="flex-1 px-4 py-3 rounded-lg font-medium transition-all hover:shadow-sm "
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2" /> Loading...
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4 mr-2" /> View Report
                  </>
                )}
              </button>

              <button
                onClick={() => regenerateReport(report.id)}
                className="px-4 py-3 rounded-lg font-medium text-blue-400/hover hover:text-blue-300 transition-colors"
              >
                <RefreshCw className="h-4 h-4 mr-2" /> Regenerate
              </button>

              <button
                onClick={() => deleteReport(report.id)}
                className="px-4 py-3 rounded-lg font-medium text-red-400/hover hover:text-red-300 transition-colors"
              >
                <Trash2 className="h-4 h-4 mr-2" /> Delete
              </button>
            </div>
          </GlassCard>
        ))
      ) : (
        <div className="text-center py-12">
          <div className="mb-6">
            <FileText className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">No Reports Yet</h3>
          <p className="text-slate-400 max-w-xl mx-auto">
            Generate your first portfolio report to see it appear here.
          </p>
          <button
            onClick={() => setTab("builder")}
            className="mt-6 inline-flex items-center px-5 py-3 border border-transparent text-sm font-medium rounded-md shadow-sm bg-primary text-primary-foreground hover:bg-primary/80"
          >
            <Plus className="mr-2 h-4 w-4" /> Create First Report
          </button>
        </div>
      )}
    </div>
    </div>
  );
}

// Helper components (since some icons might not be in lucide-react by default)
function Check() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5"></path>
    </svg>
  );
}

function X() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  );
}

function Loader2() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="2" x2="12" y2="6"></line>
      <line x1="12" y1="18" x2="12" y2="22"></line>
      <line x1="4.93" y1="4.93" x2="6.34" y2="6.34"></line>
      <line x1="17.66" y1="17.66" x2="19.07" y2="19.07"></line>
      <line x1="2" y1="12" x2="6" y2="12"></line>
      <line x1="18" y1="12" x2="22" y2="12"></line>
      <line x1="6.34" y1="17.66" x2="4.93" y2="19.07"></line>
      <line x1="19.07" y1="6.34" x2="17.66" y2="4.93"></line>
    </svg>
  );
}

function Folder() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
    </svg>
  );
}

function Lightbulb() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v3z"></path>
      <path d="M9 17h6"></path>
      <path d="M10 11a4 4 0 0 0 4 4"></path>
    </svg>
  );
}

function Dot() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="1"></circle>
    </svg>
  );
}

function RefreshCw() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4v5h5"></path>
      <path d="M14 4a4 4 0 0 1 4 4 4 4 0 0 1-4 4 4 4 0 0 1-4-4 4 4 0 0 1 4-4 4 4 0 0 1 4 4"></path>
      <path d="M9 17a4.5 4.5 0 0 0 2.5-7 4.5 4.5 0 0 0-5.7 4.2"></path>
    </svg>
  );
}

function Trash2() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="3 6 5 6 5 15 19 15 19 6 21 6"></polygon>
      <path d="M10 11V16"></path>
      <path d="M14 11V16"></path>
      <line x1="9" y1="15" x2="15" y2="15"></line>
    </svg>
  );
}
