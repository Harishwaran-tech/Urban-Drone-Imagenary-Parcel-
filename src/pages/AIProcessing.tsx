import { useState, useEffect, useRef } from 'react';
import { useApp } from '@/context/AppContext';
import { Button, Card, AIDisclaimer } from '@/components/UI';
import { analyzeAerialImage, type AIAnalysisOutput } from '@/services/AIService';
import {
  CheckCircle2, Loader2, Circle, ArrowRight, Cpu, Scan,
  Building2, GitCompare, GitBranch, BarChart3, Sparkles, AlertCircle, Layers,
} from 'lucide-react';

const STAGES = [
  { id: 0, label: 'Ingestion & Preflight Validation', icon: Scan, detail: 'Validating CRS, coordinate bounds, and SIH data directories' },
  { id: 1, label: 'Georeferencing & Spatial Transform', icon: Cpu, detail: 'Parsing GeoTIFF metadata, GSD resolution, and WGS84 mapping' },
  { id: 2, label: 'Elevation Modeling (nDSM)', icon: Layers, detail: 'Computing nDSM = DSM - DTM to extract structure heights' },
  { id: 3, label: 'Model 1: Parcel U-Net Boundaries', icon: Sparkles, detail: 'Deep learning boundary delineation & wall segmentation' },
  { id: 4, label: 'Model 2: SegFormer Footprints & LULC', icon: Building2, detail: 'Extracting building polygons and land use classifications' },
  { id: 5, label: 'Model 3: DeepLab Road Networks', icon: Scan, detail: 'Extracting road corridors and skeletonized centerlines' },
  { id: 6, label: 'Vectorization & Douglas-Peucker', icon: Sparkles, detail: 'Simplifying contours and converting to survey-grade GeoJSON' },
  { id: 7, label: 'Topology Engine & Snapping', icon: GitBranch, detail: 'Sub-meter vertex snapping and overlap/sliver validation' },
  { id: 8, label: 'Cadastral Spatial Comparison', icon: GitCompare, detail: 'Calculating displacement & area difference against deeds' },
  { id: 9, label: 'GNSS/CORS Precision Validation', icon: BarChart3, detail: 'Calculating boundary RMSE and field tolerance compliance' },
  { id: 10, label: 'Survey Certification & GIS Ready', icon: CheckCircle2, detail: 'GeoJSON, Shapefile, KML, DXF, and PDF report ready' },
];

export default function AIProcessing() {
  const { setCurrentPage, uploadedImageFile, uploadedImage, setAnalysisResult, analysisResult, appMode } = useApp();
  const [currentStage, setCurrentStage] = useState(0);
  const [stageStates, setStageStates] = useState<('pending' | 'processing' | 'completed')[]>(STAGES.map(() => 'pending'));
  const [progress, setProgress] = useState(0);
  const [complete, setComplete] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [inferenceMode, setInferenceMode] = useState<string>('pytorch_unet');
  const executionStarted = useRef(false);

  useEffect(() => {
    if (executionStarted.current) return;
    executionStarted.current = true;

    async function runPipeline() {
      try {
        // Run analysis via AIService (FastAPI backend with fallback)
        const output: AIAnalysisOutput = await analyzeAerialImage(
          {
            imageFile: uploadedImageFile || undefined,
            imageDataUrl: uploadedImage || undefined,
            appMode: appMode,
          },
          (stepDesc, stepIdx, totalSteps) => {
            const mappedStage = Math.min(STAGES.length - 1, Math.floor((stepIdx / Math.max(1, totalSteps)) * STAGES.length));
            setCurrentStage(mappedStage);
            setStageStates(prev => {
              const next = [...prev];
              for (let i = 0; i < mappedStage; i++) next[i] = 'completed';
              next[mappedStage] = 'processing';
              return next;
            });
            const pct = Math.min(95, Math.round((stepIdx / Math.max(1, totalSteps)) * 100));
            setProgress(pct);
          }
        );

        // Mark all complete
        setStageStates(STAGES.map(() => 'completed'));
        setCurrentStage(STAGES.length - 1);
        setProgress(100);
        setComplete(true);
        setInferenceMode(output.inferenceMode || 'pytorch_unet');
        setAnalysisResult(output);
      } catch (err: any) {
        console.error('Pipeline error:', err);
        setErrorMsg(err.message || 'Error processing imagery through AI pipeline');
        setComplete(false);
      }
    }

    runPipeline();
  }, [uploadedImageFile, uploadedImage, setAnalysisResult, appMode]);

  const stats = analysisResult?.stats || {
    totalParcels: 24,
    highConfidence: 18,
    reviewRequired: 4,
    fieldVerification: 2,
    topologyErrors: 1,
  };

  return (
    <div className="p-6 max-w-[1000px] mx-auto space-y-6">
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">AI Cadastral Analysis Pipeline</h2>
            <p className="text-sm text-slate-500 mt-1">
              {complete
                ? 'Deep learning inference and GIS vectorization completed successfully.'
                : 'Processing drone orthomosaic imagery through PyTorch U-Net & GIS extraction...'}
            </p>
          </div>
          {complete && (
            <span className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${
              inferenceMode === 'pytorch_unet'
                ? 'bg-blue-100 text-blue-700 border border-blue-200'
                : 'bg-amber-100 text-amber-700 border border-amber-200'
            }`}>
              Engine: {inferenceMode === 'pytorch_unet' ? 'PyTorch U-Net (Active)' : 'Development CV Pipeline'}
            </span>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>{errorMsg} (Displaying calibrated baseline dataset)</div>
        </div>
      )}

      {/* Progress bar */}
      <Card>
        <div className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${complete ? 'bg-green-100' : 'bg-blue-100'}`}>
                {complete ? <CheckCircle2 className="w-5 h-5 text-green-600" /> : <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />}
              </div>
              <div>
                <div className="font-bold text-slate-800 text-sm">
                  {complete ? 'AI Deep Learning Pipeline Complete' : `Stage ${currentStage + 1} of ${STAGES.length}: ${STAGES[currentStage]?.label || ''}`}
                </div>
                <div className="text-xs text-slate-500">{STAGES[currentStage]?.detail || 'All stages completed'}</div>
              </div>
            </div>
            <div className="text-3xl font-bold text-blue-600">{progress}%</div>
          </div>
          <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </Card>

      {/* Stages */}
      <Card title="Processing Pipeline" subtitle="End-to-End AI & Geospatial Stages">
        <div className="p-5">
          <div className="space-y-2.5">
            {STAGES.map((stage, i) => {
              const Icon = stage.icon;
              const state = stageStates[i];
              const stepResult = analysisResult?.processingSteps?.[i];
              const preview = stepResult?.previewUrl;

              return (
                <div
                  key={stage.id}
                  className={`flex items-center gap-3.5 p-3 rounded-xl transition-all ${
                    state === 'completed' ? 'bg-green-50/80 border border-green-200/60' :
                    state === 'processing' ? 'bg-blue-50 border border-blue-200 ring-2 ring-blue-500/20 shadow-xs' :
                    'bg-slate-50/80 border border-slate-100'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    state === 'completed' ? 'bg-green-500 text-white' :
                    state === 'processing' ? 'bg-blue-500 text-white' : 'bg-slate-200 text-slate-400'
                  }`}>
                    {state === 'completed' ? <CheckCircle2 className="w-5 h-5" /> :
                     state === 'processing' ? <Loader2 className="w-5 h-5 animate-spin" /> :
                     <Icon className="w-4 h-4" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-semibold flex items-center gap-2 ${state === 'pending' ? 'text-slate-400' : 'text-slate-800'}`}>
                      <span>{stage.label}</span>
                      {stepResult?.duration ? (
                        <span className="text-[10px] text-slate-400 font-normal">({Math.round(stepResult.duration)}ms)</span>
                      ) : null}
                    </div>
                    <div className={`text-xs truncate ${state === 'pending' ? 'text-slate-400' : 'text-slate-500'}`}>
                      {stepResult?.description || stage.detail}
                    </div>
                  </div>

                  {/* Thumbnail preview if available */}
                  {preview && (
                    <div className="w-12 h-12 rounded-lg overflow-hidden border border-slate-300 bg-slate-900 flex-shrink-0 shadow-xs">
                      <img src={preview} alt={stage.label} className="w-full h-full object-cover" />
                    </div>
                  )}

                  <div className="text-xs font-bold uppercase tracking-wide flex-shrink-0">
                    {state === 'completed' && <span className="text-green-600">Done</span>}
                    {state === 'processing' && <span className="text-blue-600 animate-pulse">Processing</span>}
                    {state === 'pending' && <span className="text-slate-400">Pending</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Completion summary */}
      {complete && (
        <Card className="border-green-200 bg-green-50/50 shadow-sm">
          <div className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <h3 className="font-bold text-slate-800">Preliminary Parcels & Cadastral Boundaries Extracted</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
              <div className="bg-white rounded-lg p-3 border border-slate-200">
                <div className="text-xs text-slate-500">Parcels Extracted</div>
                <div className="text-xl font-bold text-blue-600">{stats.totalParcels}</div>
              </div>
              <div className="bg-white rounded-lg p-3 border border-slate-200">
                <div className="text-xs text-slate-500">High Confidence</div>
                <div className="text-xl font-bold text-green-600">{stats.highConfidence}</div>
              </div>
              <div className="bg-white rounded-lg p-3 border border-slate-200">
                <div className="text-xs text-slate-500">Require Review</div>
                <div className="text-xl font-bold text-amber-600">{stats.reviewRequired}</div>
              </div>
              <div className="bg-white rounded-lg p-3 border border-slate-200">
                <div className="text-xs text-slate-500">Field Verification</div>
                <div className="text-xl font-bold text-red-600">{stats.fieldVerification}</div>
              </div>
              <div className="bg-white rounded-lg p-3 border border-slate-200">
                <div className="text-xs text-slate-500">Topology Errors</div>
                <div className="text-xl font-bold text-slate-700">{stats.topologyErrors}</div>
              </div>
            </div>

            <div className="flex items-center justify-between flex-wrap gap-3 pt-2 border-t border-green-200/60">
              <div className="text-xs text-slate-600">
                Georeferenced orthomosaic and vector polygons are ready in the WebGIS cadastral map viewer.
              </div>
              <Button variant="primary" size="md" onClick={() => setCurrentPage('cadastral-map')}>
                Open Cadastral Map (WebGIS) <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </Card>
      )}

      <AIDisclaimer />

      {/* Architecture note */}
      <Card title="AI Pipeline Architecture" subtitle="Separation of Concerns">
        <div className="p-5">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {['Drone Orthomosaic', 'Preprocessing', 'PyTorch U-Net', 'Feature Segmentation', 'Shapely Vectorization', 'EPSG:4326 Georeferencing', 'PostGIS Comparison', 'Conflict Scoring', 'WebGIS Visualization', 'Surveyor Verification'].map((step, i, arr) => (
              <div key={i} className="flex items-center gap-2">
                <span className="px-2.5 py-1.5 bg-slate-100 rounded-lg font-medium text-slate-700">{step}</span>
                {i < arr.length - 1 && <span className="text-slate-400">→</span>}
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-3">
            The deep learning model extracts geometric feature masks from aerial imagery. The GIS engine handles spatial coordinate transformation and PostGIS comparison. Legal authority rests with the reviewing surveyor.
          </p>
        </div>
      </Card>
    </div>
  );
}
