import { useState, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { Card, Button, StatusBadge, AIDisclaimer } from '@/components/UI';
import {
  Plus, ArrowRight, MapPin, Layers, Calendar, TrendingUp,
  CheckCircle2, AlertTriangle, GitBranch, Users, Shield,
  UserCheck,
} from 'lucide-react';
import type { ProjectStatus, Project } from '@/types';
import { apiService } from '@/services/apiService';

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
  const {
    projects, setActiveProjectId, activeProject, setCurrentPage,
    userRole, currentUser,
  } = useApp();

  const [projectAssignments, setProjectAssignments] = useState<Record<string, { analyst?: string; surveyor?: string }>>({
    'PRJ-001': { analyst: 'A. Kumar (GIS Analyst)', surveyor: 'R. Senthil (Surveyor)' },
    'PRJ-002': { analyst: 'A. Kumar (GIS Analyst)', surveyor: 'P. Murugan (Surveyor)' },
    'PRJ-003': { analyst: 'K. Divya (GIS Analyst)', surveyor: 'R. Senthil (Surveyor)' },
  });

  const [assignModalProject, setAssignModalProject] = useState<Project | null>(null);
  const [selectedAnalyst, setSelectedAnalyst] = useState('USR-ANALYST-01');
  const [selectedSurveyor, setSelectedSurveyor] = useState('USR-SURVEYOR-01');
  const [savingAssign, setSavingAssign] = useState(false);

  const handleOpenProject = (id: string) => {
    setActiveProjectId(id);
    setCurrentPage('dashboard');
  };

  const handleSaveAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignModalProject) return;
    setSavingAssign(true);
    try {
      await apiService.assignProjectMember(assignModalProject.id, selectedAnalyst, 'GIS_ANALYST');
      await apiService.assignProjectMember(assignModalProject.id, selectedSurveyor, 'SURVEYOR');
    } catch {}

    const analystName = selectedAnalyst === 'USR-ANALYST-01' ? 'A. Kumar' : 'K. Divya';
    const surveyorName = selectedSurveyor === 'USR-SURVEYOR-01' ? 'R. Senthil' : 'P. Murugan';

    setProjectAssignments((prev) => ({
      ...prev,
      [assignModalProject.id]: {
        analyst: `${analystName} (GIS Analyst)`,
        surveyor: `${surveyorName} (Surveyor)`,
      },
    }));

    setSavingAssign(false);
    setAssignModalProject(null);
  };

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold text-slate-800">
              {userRole === 'ADMIN' ? 'All Cadastral Projects' : 'Assigned Projects'}
            </h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-slate-100 text-slate-700">
              {userRole}
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            {userRole === 'ADMIN'
              ? 'Manage projects, inspect dataset readiness, and assign GIS Analysts and Surveyors.'
              : userRole === 'GIS_ANALYST'
              ? 'Projects assigned to you for geospatial data ingestion, processing, and preliminary topology.'
              : 'Projects assigned to you for field inspection, Ground Truth review, and official boundary certification.'}
          </p>
        </div>

        {(userRole === 'ADMIN' || userRole === 'GIS_ANALYST') && (
          <Button variant="primary" onClick={() => setCurrentPage('new-survey')}>
            <Plus className="w-4 h-4" /> New Survey Project
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {projects.map((project) => {
          const isActive = project.id === activeProject?.id;
          const currentStageIdx = STATUS_FLOW.indexOf(project.status);
          const assignment = projectAssignments[project.id] || {
            analyst: 'A. Kumar (GIS Analyst)',
            surveyor: 'R. Senthil (Surveyor)',
          };

          return (
            <Card key={project.id} className={isActive ? 'ring-2 ring-blue-500' : ''}>
              <div className="p-5">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-slate-800 text-sm">{project.name}</h3>
                      {isActive && (
                        <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> {project.district}, {project.state}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> {project.surveyDate}
                      </span>
                    </div>
                  </div>
                  <StatusBadge status={project.status} label={STATUS_LABELS[project.status]} />
                </div>

                {/* Assigned Team Members Strip */}
                <div className="mb-4 p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-blue-600" />
                      <span className="text-[11px] text-slate-500">Analyst:</span>
                      <span className="font-bold text-slate-700 text-[11px]">{assignment.analyst}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-[11px] text-slate-500">Surveyor:</span>
                      <span className="font-bold text-slate-700 text-[11px]">{assignment.surveyor}</span>
                    </div>
                  </div>

                  {userRole === 'ADMIN' && (
                    <button
                      onClick={() => setAssignModalProject(project)}
                      className="text-[11px] text-blue-600 hover:text-blue-700 font-bold cursor-pointer"
                    >
                      Assign Team →
                    </button>
                  )}
                </div>

                {/* Progress */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-slate-600">Pipeline Progression</span>
                    <span className="text-xs font-bold text-blue-600">{project.progress}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full"
                      style={{ width: `${project.progress}%` }}
                    />
                  </div>
                </div>

                {/* Status timeline */}
                <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-1">
                  {STATUS_FLOW.map((status, i) => {
                    const isDone = i <= currentStageIdx;
                    const isCurrent = i === currentStageIdx;
                    return (
                      <div key={status} className="flex items-center gap-1 flex-shrink-0">
                        <div
                          className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${
                            isDone ? 'bg-green-500 text-white' : 'bg-slate-200 text-slate-400'
                          } ${isCurrent ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}
                        >
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
                      <div className="text-[10px] text-green-600">Verified Lots</div>
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
                    {project.areaKm2} km² · {project.crs || 'CRS from Metadata'}
                  </div>
                  <div className="flex gap-2">
                    {project.status === 'ai_processing' && (
                      <Button size="sm" variant="secondary" onClick={() => setCurrentPage('ai-processing')}>
                        View Processing
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant={isActive ? 'primary' : 'secondary'}
                      onClick={() => handleOpenProject(project.id)}
                    >
                      Open Project <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Admin Assign Team Modal */}
      {assignModalProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 animate-in fade-in">
            <h3 className="text-lg font-bold text-slate-800 mb-1">Assign Project Team</h3>
            <p className="text-xs text-slate-500 mb-4">
              Assign responsible GIS Analyst and licensed Surveyor to: <strong>{assignModalProject.name}</strong>
            </p>

            <form onSubmit={handleSaveAssignment} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  GIS Analyst (Ingestion & Geometry)
                </label>
                <select
                  value={selectedAnalyst}
                  onChange={(e) => setSelectedAnalyst(e.target.value)}
                  className="w-full text-xs p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none font-semibold"
                >
                  <option value="USR-ANALYST-01">A. Kumar (State Remote Sensing & GIS Cell)</option>
                  <option value="USR-ANALYST-02">K. Divya (Drone Photogrammetry Wing)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Surveyor / Reviewer (Ground Truth & Legal Verification)
                </label>
                <select
                  value={selectedSurveyor}
                  onChange={(e) => setSelectedSurveyor(e.target.value)}
                  className="w-full text-xs p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none font-semibold"
                >
                  <option value="USR-SURVEYOR-01">R. Senthil (Chennai District Survey Office)</option>
                  <option value="USR-SURVEYOR-02">P. Murugan (Tambaram Taluk Survey Office)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <Button variant="secondary" size="sm" type="button" onClick={() => setAssignModalProject(null)}>
                  Cancel
                </Button>
                <Button variant="primary" size="sm" type="submit" disabled={savingAssign}>
                  {savingAssign ? 'Saving...' : 'Save Assignments'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <AIDisclaimer />
    </div>
  );
}
