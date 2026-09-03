import { useApp } from '@/context/AppContext';
import { Card, Button, StatusBadge, AIDisclaimer } from '@/components/UI';
import {
  Plus, ArrowRight, MapPin, Layers, Calendar, TrendingUp,
  CheckCircle2, AlertTriangle, GitBranch,
} from 'lucide-react';
import type { ProjectStatus } from '@/types';

const STATUS_FLOW: ProjectStatus[] = [
  'created', 'data_uploaded', 'ai_processing', 'analysis_complete',
  'under_review', 'field_verification', 'completed',
];

const STATUS_LABELS: Record<ProjectStatus, string> = {
  created: 'Created',
  data_uploaded: 'Data Uploaded',
  ai_processing: 'AI Processing',
  analysis_complete: 'Analysis Complete',
  under_review: 'Under Review',
  field_verification: 'Field Verification',
  completed: 'Completed',
};

export default function Projects() {
  const { projects, setActiveProjectId, activeProject, setCurrentPage } = useApp();

  const handleOpenProject = (id: string) => {
    setActiveProjectId(id);
    setCurrentPage('dashboard');
  };

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Projects</h2>
          <p className="text-sm text-slate-500 mt-1">Manage your cadastral survey projects.</p>
        </div>
        <Button variant="primary" onClick={() => setCurrentPage('new-survey')}>
          <Plus className="w-4 h-4" /> New Survey Project
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {projects.map(project => {
          const isActive = project.id === activeProject?.id;
          const currentStageIdx = STATUS_FLOW.indexOf(project.status);
          return (
            <Card key={project.id} className={isActive ? 'ring-2 ring-blue-500' : ''}>
              <div className="p-5">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-slate-800 text-sm">{project.name}</h3>
                      {isActive && <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">ACTIVE</span>}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {project.district}, {project.state}</span>
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {project.surveyDate}</span>
                    </div>
                  </div>
                  <StatusBadge status={project.status} label={STATUS_LABELS[project.status]} />
                </div>

                {/* Progress */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-slate-600">Progress</span>
                    <span className="text-xs font-bold text-blue-600">{project.progress}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full" style={{ width: `${project.progress}%` }} />
                  </div>
                </div>

                {/* Status timeline */}
                <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-1">
                  {STATUS_FLOW.map((status, i) => {
                    const isDone = i <= currentStageIdx;
                    const isCurrent = i === currentStageIdx;
                    return (
                      <div key={status} className="flex items-center gap-1 flex-shrink-0">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${
                          isDone ? 'bg-green-500 text-white' : 'bg-slate-200 text-slate-400'
                        } ${isCurrent ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}>
                          {isDone ? '✓' : i + 1}
                        </div>
                        {i < STATUS_FLOW.length - 1 && (
                          <div className={`w-4 h-0.5 ${i < currentStageIdx ? 'bg-green-500' : 'bg-slate-200'}`} />
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Stats */}
                {project.parcelsDetected > 0 ? (
                  <div className="grid grid-cols-4 gap-2 mb-4">
                    <div className="bg-slate-50 rounded-lg p-2 text-center">
                      <Layers className="w-3.5 h-3.5 text-slate-500 mx-auto mb-0.5" />
                      <div className="text-sm font-bold text-slate-800">{project.parcelsDetected}</div>
                      <div className="text-[10px] text-slate-500">Parcels</div>
                    </div>
                    <div className="bg-green-50 rounded-lg p-2 text-center">
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500 mx-auto mb-0.5" />
                      <div className="text-sm font-bold text-green-700">{project.highConfidence}</div>
                      <div className="text-[10px] text-green-600">High Conf.</div>
                    </div>
                    <div className="bg-amber-50 rounded-lg p-2 text-center">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mx-auto mb-0.5" />
                      <div className="text-sm font-bold text-amber-700">{project.reviewRequired}</div>
                      <div className="text-[10px] text-amber-600">Review</div>
                    </div>
                    <div className="bg-red-50 rounded-lg p-2 text-center">
                      <GitBranch className="w-3.5 h-3.5 text-red-500 mx-auto mb-0.5" />
                      <div className="text-sm font-bold text-red-700">{project.topologyErrors}</div>
                      <div className="text-[10px] text-red-600">Topology</div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-50 rounded-lg p-4 mb-4 text-center text-sm text-slate-500">
                    <TrendingUp className="w-5 h-5 text-slate-400 mx-auto mb-1" />
                    AI processing in progress — no parcels yet
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  <div className="text-xs text-slate-500">
                    {project.areaKm2} km² · Avg confidence {project.avgConfidence || 0}%
                  </div>
                  <div className="flex gap-2">
                    {project.status === 'ai_processing' && (
                      <Button size="sm" variant="secondary" onClick={() => setCurrentPage('ai-processing')}>
                        View Processing
                      </Button>
                    )}
                    <Button size="sm" variant={isActive ? 'primary' : 'secondary'} onClick={() => handleOpenProject(project.id)}>
                      Open <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <AIDisclaimer />
    </div>
  );
}
