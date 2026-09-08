import { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { Button, Card, AIDisclaimer } from '@/components/UI';
import {
  Upload, FileText, Map, Mountain, Ruler, MapPin, CheckCircle2,
  Cloud, Building2, Layers3, ArrowRight, X, Sparkles, Image as ImageIcon,
  Compass, Globe, Shield, RefreshCw,
} from 'lucide-react';
import { DRONE_SAMPLE_PRESETS, generateRealisticDroneSample, type DroneSamplePreset } from '@/services/ImageAnalysisService';

interface UploadSlot {
  id: string;
  label: string;
  accept: string;
  icon: typeof Upload;
  description: string;
  required: boolean;
}

const UPLOAD_SLOTS: UploadSlot[] = [
  { id: 'ori', label: 'Drone Orthomosaic (ORI)', accept: '.tif,.tiff,.jpg,.jpeg,.png', icon: Cloud, description: 'GeoTIFF, High-Resolution Orthomosaic (Primary Survey Raster)', required: true },
  { id: 'drone', label: 'Raw / Oblique Drone Imagery', accept: '.jpg,.jpeg,.png,.tif', icon: ImageIcon, description: 'High-Resolution Aerial Snapshots for Feature Detail', required: false },
  { id: 'dsm', label: 'Digital Surface Model (DSM)', accept: '.tif,.tiff', icon: Mountain, description: 'GeoTIFF Surface Elevation Raster (Structure Heights)', required: false },
  { id: 'dtm', label: 'Digital Terrain Model (DTM)', accept: '.tif,.tiff', icon: Layers3, description: 'GeoTIFF Bare-Earth Elevation Raster (Ground Datum)', required: false },
  { id: 'existing', label: 'Existing Cadastral Records (Reference)', accept: '.geojson,.shp,.zip,.kml,.json', icon: Map, description: 'GeoJSON, Shapefile ZIP, KML (Historical Boundary Overlay)', required: false },
  { id: 'gt', label: 'Ground Truth Cadastral Parcels (Validation)', accept: '.geojson,.shp,.zip,.kml,.json', icon: Shield, description: 'Survey-Grade Ground Truth for IoU & Hausdorff Validation', required: false },
  { id: 'gnss', label: 'GNSS / CORS RTK Control Points', accept: '.csv,.geojson,.txt', icon: Ruler, description: 'CSV (ID, Latitude, Longitude, Elevation) Field Benchmarks', required: false },
];

const CITY_PRESETS: { city: string; state: string; lat: number; lng: number }[] = [
  { city: 'Jaipur', state: 'Rajasthan', lat: 26.9124, lng: 75.7873 },
  { city: 'Delhi NCR', state: 'Delhi', lat: 28.6139, lng: 77.2090 },
  { city: 'Mumbai', state: 'Maharashtra', lat: 19.0760, lng: 72.8777 },
  { city: 'Bengaluru', state: 'Karnataka', lat: 12.9716, lng: 77.5946 },
  { city: 'Pune', state: 'Maharashtra', lat: 18.5204, lng: 73.8567 },
  { city: 'Hyderabad', state: 'Telangana', lat: 17.3850, lng: 78.4867 },
  { city: 'Chennai', state: 'Tamil Nadu', lat: 13.0827, lng: 80.2707 },
  { city: 'Ahmedabad', state: 'Gujarat', lat: 23.0225, lng: 72.5714 },
  { city: 'Kolkata', state: 'West Bengal', lat: 22.5726, lng: 88.3639 },
  { city: 'Chandigarh', state: 'Punjab', lat: 30.7333, lng: 76.7794 },
];

const STATES = ['Rajasthan', 'Maharashtra', 'Karnataka', 'Tamil Nadu', 'Gujarat', 'Delhi', 'Telangana', 'West Bengal', 'Uttar Pradesh', 'Madhya Pradesh', 'Punjab'];

export default function NewSurvey() {
  const { setCurrentPage, setUploadedImage, setIsRealAnalysis, createProject, appMode } = useApp();
  const [formData, setFormData] = useState({
    projectName: 'Urban Parcel Cadastral Survey',
    surveyArea: 'Zone 04 Sector 12',
    district: 'Jaipur',
    state: 'Rajasthan',
    surveyDate: new Date().toISOString().split('T')[0],
    lat: 26.9124,
    lng: 75.7873,
    customCoords: false,
  });

  const [uploadedFiles, setUploadedFiles] = useState<Record<string, string[]>>({});
  const [uploadedFileObjs, setUploadedFileObjs] = useState<Record<string, File[]>>({});
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('residential_colony');
  const [loadingSample, setLoadingSample] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleCitySelect = (cityObj: typeof CITY_PRESETS[0]) => {
    setFormData(prev => ({
      ...prev,
      district: cityObj.city,
      state: cityObj.state,
      lat: cityObj.lat,
      lng: cityObj.lng,
      surveyArea: `Sector 04, ${cityObj.city}`,
    }));
  };

  const handleFileSelect = (slotId: string, files: FileList | null) => {
    if (!files) return;
    const fileArr = Array.from(files);
    const fileNames = fileArr.map(f => f.name);
    setUploadedFiles(prev => ({ ...prev, [slotId]: [...(prev[slotId] || []), ...fileNames] }));
    setUploadedFileObjs(prev => ({ ...prev, [slotId]: [...(prev[slotId] || []), ...fileArr] }));
    setUploadError(null);

    if ((slotId === 'ori' || slotId === 'aerial' || slotId === 'drone') && fileArr.length > 0) {
      const imageFile = fileArr[0];
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        setImagePreview(dataUrl);
        setUploadedImage(dataUrl, imageFile);
        setIsRealAnalysis(true);
      };
      reader.readAsDataURL(imageFile);
    }
  };

  const removeFile = (slotId: string, fileName: string) => {
    setUploadedFiles(prev => ({ ...prev, [slotId]: (prev[slotId] || []).filter(f => f !== fileName) }));
    setUploadedFileObjs(prev => ({ ...prev, [slotId]: (prev[slotId] || []).filter(f => f.name !== fileName) }));
    if (slotId === 'ori' || slotId === 'aerial' || slotId === 'drone') {
      setImagePreview(null);
      setUploadedImage(null, null);
      setIsRealAnalysis(false);
    }
  };

  const handleLoadDronePreset = async (preset: DroneSamplePreset) => {
    setLoadingSample(true);
    setSelectedPresetId(preset.id);
    setFormData(prev => ({
      ...prev,
      projectName: `${preset.district} ${preset.name}`,
      surveyArea: preset.area,
      district: preset.district,
      state: preset.state,
      lat: preset.center[0],
      lng: preset.center[1],
    }));

    try {
      const sample = await generateRealisticDroneSample(preset.id);
      setImagePreview(sample.dataUrl);
      setUploadedFiles(prev => ({ ...prev, ori: [sample.name] }));
      setUploadedFileObjs(prev => ({ ...prev, ori: [sample.file] }));
      setUploadedImage(sample.dataUrl, sample.file);
      setIsRealAnalysis(true);
      setUploadError(null);
    } finally {
      setLoadingSample(false);
    }
  };

  const hasAerialUpload = (uploadedFiles['ori']?.length ?? 0) > 0 || (uploadedFiles['aerial']?.length ?? 0) > 0 || imagePreview !== null;

  const handleStart = async () => {
    let activeDataUrl = imagePreview;
    let activeFile = uploadedFileObjs['ori']?.[0] || uploadedFileObjs['aerial']?.[0] || null;

    if (!activeDataUrl || !activeFile) {
      if (appMode === 'real') {
        setUploadError('Required Drone Orthomosaic (ORI) raster is missing. In Real Project Mode, please upload a genuine GeoTIFF or orthomosaic file to proceed.');
        return;
      }
      const sample = await generateRealisticDroneSample(selectedPresetId);
      activeDataUrl = sample.dataUrl;
      activeFile = sample.file;
      setUploadedImage(sample.dataUrl, sample.file);
    }

    const center: [number, number] = [Number(formData.lat) || 26.9124, Number(formData.lng) || 75.7873];
    
    createProject({
      name: formData.projectName.trim() || `${formData.district} Urban Parcel Survey`,
      surveyArea: formData.surveyArea.trim() || `Zone 04, ${formData.district}`,
      district: formData.district,
      state: formData.state,
      surveyDate: formData.surveyDate,
      center,
      zoom: 17,
      droneImage: activeDataUrl,
    });

    setIsRealAnalysis(true);
    setCurrentPage('ai-processing');
  };

  return (
    <div className="p-6 max-w-[1240px] mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Create New Survey Project</h2>
          <p className="text-sm text-slate-500 mt-1">Upload drone orthomosaic imagery or select a calibrated sample dataset for AI extraction.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleLoadDronePreset(DRONE_SAMPLE_PRESETS[0])}
            disabled={loadingSample}
          >
            <Sparkles className="w-4 h-4 text-blue-600" />
            {loadingSample ? 'Generating Dataset...' : 'Quick Sample Survey'}
          </Button>
        </div>
      </div>

      <Card title="Sample Drone Datasets (Ready to Analyze)" subtitle="Select a calibrated drone survey or upload your own imagery below">
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {DRONE_SAMPLE_PRESETS.map((preset) => {
            const isSelected = selectedPresetId === preset.id && hasAerialUpload;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleLoadDronePreset(preset)}
                className={`p-3.5 rounded-xl border text-left transition-all ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50/70 ring-2 ring-blue-500/20 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-slate-800">{preset.name}</span>
                  {isSelected && <CheckCircle2 className="w-4 h-4 text-blue-600 flex-shrink-0" />}
                </div>
                <div className="text-[11px] text-blue-600 font-medium flex items-center gap-1 mb-1">
                  <MapPin className="w-3 h-3" /> {preset.district}, {preset.state}
                </div>
                <p className="text-[11px] text-slate-500 leading-snug">{preset.description}</p>
              </button>
            );
          })}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <Card title="Project Details" subtitle="Survey Metadata & Georeferencing">
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Project Name</label>
                <input
                  type="text"
                  value={formData.projectName}
                  onChange={(e) => setFormData({ ...formData, projectName: e.target.value })}
                  placeholder="e.g., Jaipur Urban Parcel Survey"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Survey Area / Ward</label>
                <input
                  type="text"
                  value={formData.surveyArea}
                  onChange={(e) => setFormData({ ...formData, surveyArea: e.target.value })}
                  placeholder="e.g., Zone 04, Vidyadhar Nagar"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center justify-between">
                  <span>City / Geographic Anchor</span>
                  <button
                    type="button"
                    onClick={() => setFormData(p => ({ ...p, customCoords: !p.customCoords }))}
                    className="text-[11px] text-blue-600 hover:underline"
                  >
                    {formData.customCoords ? 'Use Presets' : 'Custom Lat/Lng'}
                  </button>
                </label>

                {!formData.customCoords ? (
                  <select
                    value={formData.district}
                    onChange={(e) => {
                      const match = CITY_PRESETS.find(c => c.city === e.target.value);
                      if (match) handleCitySelect(match);
                    }}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {CITY_PRESETS.map(c => (
                      <option key={c.city} value={c.city}>{c.city} ({c.state}) — {c.lat}°N, {c.lng}°E</option>
                    ))}
                  </select>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[10px] text-slate-500">Latitude</span>
                      <input
                        type="number"
                        step="0.0001"
                        value={formData.lat}
                        onChange={(e) => setFormData({ ...formData, lat: parseFloat(e.target.value) || 26.9124 })}
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500">Longitude</span>
                      <input
                        type="number"
                        step="0.0001"
                        value={formData.lng}
                        onChange={(e) => setFormData({ ...formData, lng: parseFloat(e.target.value) || 75.7873 })}
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">State</label>
                  <select
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Survey Date</label>
                  <input
                    type="date"
                    value={formData.surveyDate}
                    onChange={(e) => setFormData({ ...formData, surveyDate: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 flex items-start gap-2">
                <Globe className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-slate-800">CRS: EPSG:4326 (WGS84)</span>
                  <div className="text-[11px] text-slate-500">Target GSD: 2.5 cm/px · Center: {formData.lat}°N, {formData.lng}°E</div>
                </div>
              </div>
            </div>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <Card title="Data Ingestion" subtitle="Upload drone orthomosaics and reference datasets">
            <div className="p-5 space-y-4">
              {UPLOAD_SLOTS.map((slot) => {
                const Icon = slot.icon;
                const files = uploadedFiles[slot.id] || [];
                const hasFiles = files.length > 0;
                const isDrag = dragOver === slot.id;

                return (
                  <div
                    key={slot.id}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(slot.id); }}
                    onDragLeave={() => setDragOver(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOver(null);
                      handleFileSelect(slot.id, e.dataTransfer.files);
                    }}
                    className={`border-2 border-dashed rounded-xl p-4 transition-all ${
                      isDrag ? 'border-blue-500 bg-blue-50/50' :
                      hasFiles ? 'border-green-300 bg-green-50/30' :
                      slot.required ? 'border-blue-200 bg-slate-50/50' : 'border-slate-200 bg-slate-50/30'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${hasFiles ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                          {hasFiles ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                            {slot.label}
                            {slot.required && (
                              <span className="text-[10px] font-bold px-1.5 py-0.2 bg-blue-100 text-blue-700 rounded-full">
                                Required
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500">{slot.description}</div>
                        </div>
                      </div>

                      <label className="cursor-pointer px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-700 shadow-sm transition-colors">
                        Browse
                        <input
                          type="file"
                          accept={slot.accept}
                          multiple={slot.id !== 'aerial'}
                          className="hidden"
                          onChange={(e) => handleFileSelect(slot.id, e.target.files)}
                        />
                      </label>
                    </div>

                    {hasFiles && (
                      <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-slate-200/60">
                        {files.map((name) => (
                          <div key={name} className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-200 rounded-md text-xs text-slate-700 shadow-xs">
                            <FileText className="w-3.5 h-3.5 text-slate-400" />
                            <span className="truncate max-w-[200px]">{name}</span>
                            <button onClick={() => removeFile(slot.id, name)} className="text-slate-400 hover:text-red-500">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          {imagePreview && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <ImageIcon className="w-4 h-4 text-blue-600" /> Drone Orthomosaic Preview
                </div>
                <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-[10px] font-bold">
                  READY FOR DEEP LEARNING & GIS MAP OVERLAY
                </span>
              </div>
              <div className="relative rounded-lg overflow-hidden border border-slate-200 bg-slate-900 flex items-center justify-center min-h-[180px] p-2">
                <img src={imagePreview} alt="Aerial imagery preview" className="max-h-72 object-contain rounded" />
              </div>
            </div>
          )}

          {/* Preflight Compatibility Checklist */}
          <div className="bg-slate-900 text-white rounded-xl p-4 shadow-sm border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-blue-400" /> Preflight Dataset Checklist
              </span>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                appMode === 'real' ? 'bg-blue-900/60 text-blue-300 border border-blue-700' : 'bg-emerald-900/60 text-emerald-300 border border-emerald-700'
              }`}>
                {appMode === 'real' ? 'REAL_MODE (Strict Ingestion)' : 'DEMO_MODE (Sandbox)'}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className={`p-2.5 rounded border ${
                (uploadedFiles['ori']?.length || uploadedFiles['aerial']?.length || imagePreview) 
                  ? 'bg-green-950/50 border-green-700 text-green-300' 
                  : 'bg-red-950/40 border-red-800 text-red-300'
              }`}>
                <div className="font-semibold flex items-center gap-1">
                  {(uploadedFiles['ori']?.length || uploadedFiles['aerial']?.length || imagePreview) ? '✓' : '✗'} ORI Raster
                </div>
                <div className="text-[10px] opacity-80">
                  {(uploadedFiles['ori']?.length || uploadedFiles['aerial']?.length || imagePreview) ? 'Validated (Primary)' : 'Required (Missing)'}
                </div>
              </div>

              <div className={`p-2.5 rounded border ${
                uploadedFiles['dsm']?.length 
                  ? 'bg-green-950/50 border-green-700 text-green-300' 
                  : 'bg-slate-800/40 border-slate-700 text-slate-400'
              }`}>
                <div className="font-semibold flex items-center gap-1">
                  {uploadedFiles['dsm']?.length ? '✓' : '○'} DSM Elevation
                </div>
                <div className="text-[10px] opacity-80">
                  {uploadedFiles['dsm']?.length ? 'Aligned (Heights)' : 'Optional (Shadow heuristic)'}
                </div>
              </div>

              <div className={`p-2.5 rounded border ${
                uploadedFiles['existing']?.length 
                  ? 'bg-green-950/50 border-green-700 text-green-300' 
                  : 'bg-slate-800/40 border-slate-700 text-slate-400'
              }`}>
                <div className="font-semibold flex items-center gap-1">
                  {uploadedFiles['existing']?.length ? '✓' : '○'} Ref Cadastre
                </div>
                <div className="text-[10px] opacity-80">
                  {uploadedFiles['existing']?.length ? 'Loaded (Displacements)' : 'Optional (No ref)'}
                </div>
              </div>

              <div className={`p-2.5 rounded border ${
                uploadedFiles['gnss']?.length 
                  ? 'bg-green-950/50 border-green-700 text-green-300' 
                  : 'bg-slate-800/40 border-slate-700 text-slate-400'
              }`}>
                <div className="font-semibold flex items-center gap-1">
                  {uploadedFiles['gnss']?.length ? '✓' : '○'} GNSS RTK
                </div>
                <div className="text-[10px] opacity-80">
                  {uploadedFiles['gnss']?.length ? 'Calibrated (RMSE)' : 'Relative datum'}
                </div>
              </div>
            </div>
          </div>

          {uploadError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
              <span className="font-bold">Error:</span> {uploadError}
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <div className="text-xs text-slate-500">
              {hasAerialUpload ? (
                <span className="text-green-600 font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> Imagery loaded · Ready for PyTorch U-Net & WebGIS overlay
                </span>
              ) : (
                <span className="text-slate-500">
                  Upload an aerial orthomosaic or click &ldquo;Quick Sample Survey&rdquo; above
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setCurrentPage('dashboard')}>Cancel</Button>
              <Button variant="primary" onClick={handleStart}>
                Start AI Analysis <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <AIDisclaimer />
        </div>
      </div>
    </div>
  );
}
