import { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { Card, Button, AIDisclaimer } from '@/components/UI';
import {
  User, Map, Cpu, GitBranch, Bell, Database, Save, Sliders,
} from 'lucide-react';

const SECTIONS = [
  { id: 'profile', label: 'User Profile', icon: User },
  { id: 'api', label: 'Backend & AI Engine', icon: Cpu },
  { id: 'map', label: 'Map Settings', icon: Map },
  { id: 'ai', label: 'AI Threshold', icon: Sliders },
  { id: 'topology', label: 'Topology Rules', icon: GitBranch },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'data', label: 'Data Management', icon: Database },
];

export default function Settings() {
  const { currentUser, settings, updateSettings, appMode, setAppMode } = useApp();
  const [activeSection, setActiveSection] = useState('profile');
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="p-6 max-w-[1000px] mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Settings</h2>
        <p className="text-sm text-slate-500 mt-1">Configure your surveyor profile, operational mode, AI thresholds, and backend engine.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Settings nav */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-2">
            {SECTIONS.map(s => {
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveSection(s.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    activeSection === s.id ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${activeSection === s.id ? 'text-blue-600' : 'text-slate-400'}`} />
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Settings content */}
        <div className="lg:col-span-3">
          {activeSection === 'profile' && (
            <Card title="User Profile" subtitle="Your surveyor account information">
              <div className="p-5 space-y-4">
                <div className="flex items-center gap-4 pb-4 border-b border-slate-100">
                  <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center text-white text-xl font-bold">
                    {currentUser?.avatar || 'U'}
                  </div>
                  <div>
                    <div className="font-bold text-slate-800 text-lg">{currentUser?.name}</div>
                    <div className="text-sm text-slate-500">{currentUser?.email}</div>
                    <div className="text-xs text-blue-600 font-semibold mt-0.5">{currentUser?.role}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Full Name</label>
                    <input type="text" defaultValue={currentUser?.name} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Surveyor License #</label>
                    <input type="text" defaultValue="SURV-2024-TN-0482" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Assigned Zone</label>
                    <input type="text" defaultValue="Zone 04 – Jaipur Urban" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Survey Organization</label>
                    <input type="text" defaultValue="Cadastral Survey & Land Records Directorate" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                </div>
                <Button variant="primary" onClick={handleSave}>
                  <Save className="w-4 h-4" /> {saved ? 'Saved!' : 'Save Changes'}
                </Button>
              </div>
            </Card>
          )}

          {activeSection === 'api' && (
            <div className="space-y-6">
              <Card title="System Operational Mode" subtitle="Separate demo visualization from live survey projects">
                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => setAppMode('demo')}
                      className={`p-4 rounded-xl border text-left transition-all ${
                        appMode === 'demo'
                          ? 'border-amber-500 bg-amber-50/70 shadow-sm'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-sm text-amber-900 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                          Demo Sandbox Mode
                        </span>
                        {appMode === 'demo' && (
                          <span className="text-[10px] bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full font-bold">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600">
                        Uses pre-calibrated sample parcels, buildings, roads, and GNSS control points for demonstration and offline review.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setAppMode('real')}
                      className={`p-4 rounded-xl border text-left transition-all ${
                        appMode === 'real'
                          ? 'border-emerald-500 bg-emerald-50/70 shadow-sm'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-sm text-emerald-900 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          Live Survey Project Mode
                        </span>
                        {appMode === 'real' && (
                          <span className="text-[10px] bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded-full font-bold">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600">
                        Strict production mode: shows only genuine backend inference results from uploaded GeoTIFFs. Never shows invented parcels.
                      </p>
                    </button>
                  </div>
                </div>
              </Card>

              <Card title="FastAPI & Deep Learning Engine" subtitle="Backend connection and PyTorch runtime configuration">
                <div className="p-5 space-y-5">
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-bold text-sm text-slate-800">FastAPI Backend URL</div>
                        <div className="text-xs text-slate-500">HTTP REST endpoint for image inference and PostGIS sync</div>
                      </div>
                      <span className="px-2.5 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                        http://localhost:8000
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2 text-xs">
                      <div className="bg-white p-3 border border-slate-200 rounded-lg">
                        <span className="text-slate-500 block mb-1">Deep Learning Architecture</span>
                        <strong className="text-slate-800">PyTorch Ensemble (U-Net, SegFormer, DeepLabV3+)</strong>
                      </div>
                      <div className="bg-white p-3 border border-slate-200 rounded-lg">
                        <span className="text-slate-500 block mb-1">Geospatial Database</span>
                        <strong className="text-slate-800">PostgreSQL + PostGIS (Dual-Mode)</strong>
                      </div>
                      <div className="bg-white p-3 border border-slate-200 rounded-lg">
                        <span className="text-slate-500 block mb-1">Georeferencing CRS</span>
                        <strong className="text-slate-800">EPSG:4326 (WGS84) & UTM Projections</strong>
                      </div>
                      <div className="bg-white p-3 border border-slate-200 rounded-lg">
                        <span className="text-slate-500 block mb-1">Target Drone Imagery</span>
                        <strong className="text-slate-800">GeoTIFF / JPG / PNG (0.1–0.5m GSD)</strong>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wide">Model Capabilities</div>
                    <ul className="text-xs text-slate-600 space-y-1.5 list-disc pl-4">
                      <li>Model 1 (U-Net): Parcel boundary and wall segmentation.</li>
                      <li>Model 2 (SegFormer): Building footprint and LULC land-use classification.</li>
                      <li>Model 3 (DeepLabV3+): Road network and pathway centerline extraction.</li>
                      <li>Douglas-Peucker simplification with topological snapping and geometry repair.</li>
                    </ul>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {activeSection === 'map' && (
            <Card title="Map Settings" subtitle="Configure map display options">
              <div className="p-5 space-y-4">
                <SettingToggle
                  label="Show coordinate grid"
                  description="Display grid lines on the map"
                  value={settings.showGrid}
                  onChange={(v) => updateSettings({ showGrid: v })}
                />
                <SettingToggle
                  label="Show coordinates"
                  description="Display lat/long coordinates on hover"
                  value={settings.showCoordinates}
                  onChange={(v) => updateSettings({ showCoordinates: v })}
                />
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Default Basemap</label>
                  <select
                    value={settings.defaultBasemap}
                    onChange={(e) => updateSettings({ defaultBasemap: e.target.value as 'satellite' | 'street' })}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="satellite">Satellite Imagery</option>
                    <option value="street">Street Map</option>
                  </select>
                </div>
                <Button variant="primary" onClick={handleSave}>
                  <Save className="w-4 h-4" /> {saved ? 'Saved!' : 'Save Settings'}
                </Button>
              </div>
            </Card>
          )}

          {activeSection === 'ai' && (
            <Card title="AI Confidence Thresholds" subtitle="Define when parcels require review or field verification">
              <div className="p-5 space-y-5">
                <ThresholdSlider
                  label="High Confidence Threshold"
                  description="Parcels above this are auto-accepted (very high confidence)"
                  value={settings.highConfidenceThreshold}
                  onChange={(v) => updateSettings({ highConfidenceThreshold: v })}
                  color="green"
                />
                <ThresholdSlider
                  label="Review Threshold"
                  description="Parcels below this require manual review"
                  value={settings.reviewThreshold}
                  onChange={(v) => updateSettings({ reviewThreshold: v })}
                  color="amber"
                />
                <ThresholdSlider
                  label="Field Verification Threshold"
                  description="Parcels below this require physical field verification"
                  value={settings.fieldVerificationThreshold}
                  onChange={(v) => updateSettings({ fieldVerificationThreshold: v })}
                  color="red"
                />
                <div className="bg-slate-50 rounded-lg p-4 text-xs text-slate-600">
                  <div className="font-bold text-slate-700 mb-2">How thresholds work:</div>
                  <div className="space-y-1">
                    <div><span className="inline-block w-3 h-3 bg-green-500 rounded-sm mr-1.5" />Above {settings.highConfidenceThreshold}%: Very High — auto-accept eligible</div>
                    <div><span className="inline-block w-3 h-3 bg-blue-500 rounded-sm mr-1.5" />{settings.reviewThreshold}–{settings.highConfidenceThreshold}%: High — review recommended</div>
                    <div><span className="inline-block w-3 h-3 bg-amber-500 rounded-sm mr-1.5" />{settings.fieldVerificationThreshold}–{settings.reviewThreshold}%: Medium — manual review required</div>
                    <div><span className="inline-block w-3 h-3 bg-red-500 rounded-sm mr-1.5" />Below {settings.fieldVerificationThreshold}%: Low — field verification required</div>
                  </div>
                </div>
                <Button variant="primary" onClick={handleSave}>
                  <Save className="w-4 h-4" /> {saved ? 'Saved!' : 'Save Thresholds'}
                </Button>
              </div>
            </Card>
          )}

          {activeSection === 'topology' && (
            <Card title="Topology Rules" subtitle="Rules for geometry validation">
              <div className="p-5 space-y-4">
                <SettingToggle label="Detect overlapping parcels" description="Flag when two parcel polygons overlap" value={true} onChange={() => {}} />
                <SettingToggle label="Detect gaps between parcels" description="Flag unintended empty space between neighbors" value={true} onChange={() => {}} />
                <SettingToggle label="Detect self-intersections" description="Flag geometries that cross themselves" value={true} onChange={() => {}} />
                <SettingToggle label="Detect unclosed geometries" description="Flag polygons that are not properly closed" value={true} onChange={() => {}} />
                <SettingToggle label="Enforce shared boundaries" description="Treat adjacent parcel edges as shared topology" value={true} onChange={() => {}} />
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Minimum parcel area (m²)</label>
                  <input type="number" defaultValue={10} className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <Button variant="primary" onClick={handleSave}>
                  <Save className="w-4 h-4" /> {saved ? 'Saved!' : 'Save Rules'}
                </Button>
              </div>
            </Card>
          )}

          {activeSection === 'notifications' && (
            <Card title="Notification Settings" subtitle="Manage alert preferences">
              <div className="p-5 space-y-4">
                <SettingToggle
                  label="Enable notifications"
                  description="Receive in-app notifications"
                  value={settings.enableNotifications}
                  onChange={(v) => updateSettings({ enableNotifications: v })}
                />
                <SettingToggle label="New review required" description="Alert when parcels need review" value={true} onChange={() => {}} />
                <SettingToggle label="Topology conflicts" description="Alert when topology errors are detected" value={true} onChange={() => {}} />
                <SettingToggle label="Field verification completed" description="Alert when a surveyor submits verification" value={true} onChange={() => {}} />
                <SettingToggle label="AI analysis completed" description="Alert when AI processing finishes" value={true} onChange={() => {}} />
                <SettingToggle label="Low confidence parcels" description="Alert when parcels fall below threshold" value={true} onChange={() => {}} />
                <Button variant="primary" onClick={handleSave}>
                  <Save className="w-4 h-4" /> {saved ? 'Saved!' : 'Save Preferences'}
                </Button>
              </div>
            </Card>
          )}

          {activeSection === 'data' && (
            <Card title="Data Management" subtitle="Manage project data and exports">
              <div className="p-5 space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Sliders className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-bold text-blue-700">AI Processing Service</span>
                  </div>
                  <p className="text-xs text-blue-900">
                    This prototype uses simulated AI data. The service layer is abstracted so a real
                    FastAPI + PyTorch backend can replace the mock service without changing the UI.
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <div>
                      <div className="text-sm font-semibold text-slate-800">Active project data</div>
                      <div className="text-xs text-slate-500">80 parcels, 48 buildings, 28 GNSS points</div>
                    </div>
                    <Button size="sm" variant="secondary">Export</Button>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <div>
                      <div className="text-sm font-semibold text-slate-800">Clear cached data</div>
                      <div className="text-xs text-slate-500">Remove temporary processing files</div>
                    </div>
                    <Button size="sm" variant="secondary">Clear</Button>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                    <div>
                      <div className="text-sm font-semibold text-red-700">Reset all project data</div>
                      <div className="text-xs text-red-500">This will remove all parcels and analysis results</div>
                    </div>
                    <Button size="sm" variant="danger">Reset</Button>
                  </div>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>

      <AIDisclaimer />
    </div>
  );
}

function SettingToggle({ label, description, value, onChange }: { label: string; description: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-sm font-semibold text-slate-800">{label}</div>
        <div className="text-xs text-slate-500">{description}</div>
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`relative w-11 h-6 rounded-full transition-colors ${value ? 'bg-blue-600' : 'bg-slate-300'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${value ? 'translate-x-5' : ''}`} />
      </button>
    </div>
  );
}

function ThresholdSlider({ label, description, value, onChange, color }: { label: string; description: string; value: number; onChange: (v: number) => void; color: string }) {
  const colorMap: Record<string, string> = {
    green: 'accent-green-500',
    amber: 'accent-amber-500',
    red: 'accent-red-500',
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div>
          <div className="text-sm font-semibold text-slate-800">{label}</div>
          <div className="text-xs text-slate-500">{description}</div>
        </div>
        <div className="text-lg font-bold text-slate-800">{value}%</div>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`w-full ${colorMap[color]}`}
      />
    </div>
  );
}
