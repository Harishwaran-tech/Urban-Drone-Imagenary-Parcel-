import { useState, useMemo } from 'react';
import { useApp } from '@/context/AppContext';
import { Card, Button, AIDisclaimer, StatusBadge, PriorityBadge } from '@/components/UI';
import {
  FileText, Download, FileJson, FileSpreadsheet, FileType,
  CheckCircle2, AlertTriangle, MapPin, GitBranch, Building2, Layers,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Legend,
} from 'recharts';

export default function Reports() {
  const { parcels, activeProject, topologyIssues, gnssPoints, buildings, setCurrentPage } = useApp();
  const [reportGenerated, setReportGenerated] = useState(false);

  const stats = useMemo(() => {
    const verified = parcels.filter(p => p.status === 'verified').length;
    const review = parcels.filter(p => p.status === 'requires_review').length;
    const fieldVerif = parcels.filter(p => p.status === 'field_verification').length;
    const conflicts = parcels.filter(p => p.conflictType !== null);
    const boundaryConflicts = parcels.filter(p => p.conflictType === 'boundary_mismatch').length;
    const areaConflicts = parcels.filter(p => p.conflictType === 'area_mismatch').length;
    const topologyErrors = parcels.filter(p => p.topologyStatus === 'invalid').length;
    return {
      total: parcels.length,
      verified,
      review,
      fieldVerif,
      conflicts: conflicts.length,
      boundaryConflicts,
      areaConflicts,
      topologyErrors,
      gnssPoints: gnssPoints.length,
      buildings: buildings.length,
    };
  }, [parcels, gnssPoints, buildings]);

  const statusData = [
    { name: 'Verified', value: stats.verified, color: '#16a34a' },
    { name: 'AI Preliminary', value: parcels.filter(p => p.status === 'ai_preliminary').length, color: '#2563eb' },
    { name: 'Requires Review', value: stats.review, color: '#d97706' },
    { name: 'Field Verification', value: stats.fieldVerif, color: '#dc2626' },
  ];

  const conflictData = [
    { name: 'Boundary', value: stats.boundaryConflicts, color: '#f59e0b' },
    { name: 'Area', value: stats.areaConflicts, color: '#3b82f6' },
    { name: 'Overlap', value: parcels.filter(p => p.conflictType === 'overlap').length, color: '#ef4444' },
    { name: 'Gap', value: parcels.filter(p => p.conflictType === 'gap').length, color: '#8b5cf6' },
    { name: 'Topology', value: parcels.filter(p => p.conflictType === 'self_intersection').length, color: '#06b6d4' },
  ];

  const handleGenerate = () => {
    setReportGenerated(true);
  };

  const generateGeoJSON = () => {
    const baseLat = activeProject?.center?.[0] ?? 26.9124;
    const baseLng = activeProject?.center?.[1] ?? 75.7873;
    const LAT_SPAN = 0.007;
    const LNG_SPAN = 0.008;

    const geojson = {
      type: 'FeatureCollection',
      crs: {
        type: 'name',
        properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' },
      },
      features: parcels.map(p => {
        const coords = p.aiGeometry.map(pt => {
          if (pt.lng !== undefined && pt.lat !== undefined) return [Number(pt.lng.toFixed(6)), Number(pt.lat.toFixed(6))];
          const lat = baseLat + (0.5 - pt.y / 1000) * LAT_SPAN;
          const lng = baseLng + (pt.x / 1000 - 0.5) * LNG_SPAN;
          return [Number(lng.toFixed(6)), Number(lat.toFixed(6))];
        });
        if (coords.length > 0 && (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1])) {
          coords.push(coords[0]);
        }
        return {
          type: 'Feature',
          id: p.id,
          properties: {
            id: p.id,
            surveyNumber: p.surveyNumber,
            ward: p.ward,
            zone: p.zone,
            confidence: p.confidence,
            existingArea: p.existingArea,
            aiArea: p.aiArea,
            boundaryDisplacement: p.boundaryDisplacement,
            status: p.status,
            priority: p.priority,
            topologyStatus: p.topologyStatus,
            conflictType: p.conflictType,
            verificationStatus: p.verificationStatus,
            assignedSurveyor: p.assignedSurveyor,
          },
          geometry: {
            type: 'Polygon',
            coordinates: [coords],
          },
        };
      }),
    };
    downloadFile(JSON.stringify(geojson, null, 2), `${(activeProject?.name || 'cadastral_parcels').toLowerCase().replace(/\s+/g, '_')}.geojson`, 'application/geo+json');
  };

  const generateCSV = () => {
    const headers = ['Parcel ID', 'Survey Number', 'Ward', 'Zone', 'Confidence', 'Existing Area', 'AI Area', 'Area Difference', 'Status', 'Priority', 'Topology', 'Conflict Type', 'Verification Status', 'Assigned Surveyor'];
    const rows = parcels.map(p => [
      p.id, p.surveyNumber, p.ward, p.zone, p.confidence, p.existingArea, p.aiArea,
      (p.aiArea - p.existingArea).toFixed(1), p.status, p.priority, p.topologyStatus,
      p.conflictType || '', p.verificationStatus, p.assignedSurveyor || '',
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    downloadFile(csv, `${(activeProject?.name || 'cadastral_report').toLowerCase().replace(/\s+/g, '_')}.csv`, 'text/csv');
  };

  const generateKML = () => {
    const baseLat = activeProject?.center?.[0] ?? 26.9124;
    const baseLng = activeProject?.center?.[1] ?? 75.7873;
    const LAT_SPAN = 0.007;
    const LNG_SPAN = 0.008;

    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>CadastraAI - ${activeProject?.name || 'Survey Report'}</name>
    ${parcels.map(p => {
      const coordsStr = p.aiGeometry.map(pt => {
        const lat = baseLat + (0.5 - pt.y / 1000) * LAT_SPAN;
        const lng = baseLng + (pt.x / 1000 - 0.5) * LNG_SPAN;
        return `${lng.toFixed(6)},${lat.toFixed(6)},0`;
      }).join(' ');
      return `
    <Placemark>
      <name>${p.id}</name>
      <description>Confidence: ${p.confidence}%, Status: ${p.status}, Area: ${p.aiArea}m²</description>
      <Polygon><outerBoundaryIs><LinearRing><coordinates>${coordsStr}</coordinates></LinearRing></outerBoundaryIs></Polygon>
    </Placemark>`;
    }).join('')}
  </Document>
</kml>`;
    downloadFile(kml, `${(activeProject?.name || 'cadastral_parcels').toLowerCase().replace(/\s+/g, '_')}.kml`, 'application/vnd.google-earth.kml+xml');
  };

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const reportRows = [
    { label: 'Project Name', value: activeProject?.name || 'Jaipur Urban Cadastral Survey – Zone 04', icon: FileText },
    { label: 'Survey Area', value: activeProject?.surveyArea || 'Zone 04, Jaipur', icon: MapPin },
    { label: 'Survey Date', value: activeProject?.surveyDate || '28 Aug 2026', icon: FileText },
    { label: 'Total Parcels', value: stats.total, icon: Layers },
    { label: 'AI-Generated Parcels', value: stats.total, icon: Layers },
    { label: 'Verified Parcels', value: stats.verified, icon: CheckCircle2 },
    { label: 'Review Parcels', value: stats.review, icon: AlertTriangle },
    { label: 'Field Verification Parcels', value: stats.fieldVerif, icon: MapPin },
    { label: 'Topology Errors', value: stats.topologyErrors, icon: GitBranch },
    { label: 'Boundary Conflicts', value: stats.boundaryConflicts, icon: AlertTriangle },
    { label: 'Area Conflicts', value: stats.areaConflicts, icon: AlertTriangle },
    { label: 'GNSS/CORS Points', value: stats.gnssPoints, icon: MapPin },
    { label: 'Buildings Detected', value: stats.buildings, icon: Building2 },
    { label: 'Final Status', value: activeProject?.status.replace(/_/g, ' ') || 'Analysis Complete', icon: CheckCircle2 },
  ];

  return (
    <div className="p-6 space-y-6 max-w-[1200px] mx-auto">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Survey Reports</h2>
        <p className="text-sm text-slate-500 mt-1">Generate and export cadastral survey reports for the active project.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Generate report */}
        <div className="lg:col-span-1">
          <Card title="Generate Report" subtitle="Create a comprehensive survey report">
            <div className="p-5 space-y-4">
              <Button variant="primary" className="w-full" onClick={handleGenerate}>
                <FileText className="w-4 h-4" /> Generate Report
              </Button>

              <div className="border-t border-slate-100 pt-4">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Export Options</div>
                <div className="space-y-2">
                  <Button variant="secondary" className="w-full justify-start" onClick={generateGeoJSON}>
                    <FileJson className="w-4 h-4 text-green-600" /> Export GeoJSON
                  </Button>
                  <Button variant="secondary" className="w-full justify-start" onClick={generateCSV}>
                    <FileSpreadsheet className="w-4 h-4 text-blue-600" /> Export CSV
                  </Button>
                  <Button variant="secondary" className="w-full justify-start" onClick={generateKML}>
                    <Download className="w-4 h-4 text-amber-600" /> Export KML
                  </Button>
                  <Button variant="secondary" className="w-full justify-start" onClick={() => alert('Shapefile export is a prototype mock action. Use GeoJSON or CSV for actual data download.')}>
                    <FileType className="w-4 h-4 text-purple-600" /> Export Shapefile
                    <span className="ml-auto text-[10px] text-slate-400 font-normal">Mock</span>
                  </Button>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-4 text-xs text-slate-500 space-y-1">
                <div className="font-semibold text-slate-700">Report includes:</div>
                <div>• Project summary and statistics</div>
                <div>• Parcel status breakdown</div>
                <div>• Conflict analysis summary</div>
                <div>• Topology validation results</div>
                <div>• GNSS/CORS survey data</div>
              </div>
            </div>
          </Card>
        </div>

        {/* Report preview */}
        <div className="lg:col-span-2">
          <Card title="Report Preview" subtitle={activeProject?.name} action={
            reportGenerated && <span className="text-xs text-green-600 font-semibold flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Generated</span>
          }>
            <div className="p-5">
              {!reportGenerated ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mb-3">
                    <FileText className="w-6 h-6 text-slate-400" />
                  </div>
                  <div className="text-sm font-semibold text-slate-600">No report generated yet</div>
                  <div className="text-xs text-slate-400 mt-1">Click "Generate Report" to create a survey report.</div>
                </div>
              ) : (
                <div className="space-y-5">
                  {/* Report header */}
                  <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-bold text-slate-800">Cadastral Survey Report</div>
                      <div className="text-xs text-slate-500 font-mono">RPT-{Date.now().toString().slice(-6)}</div>
                    </div>
                    <div className="text-xs text-slate-500">{activeProject?.name}</div>
                    <div className="text-xs text-slate-500">{activeProject?.district}, {activeProject?.state} · {activeProject?.surveyDate}</div>
                  </div>

                  {/* Report data table */}
                  <div className="overflow-hidden border border-slate-200 rounded-lg">
                    <table className="w-full text-sm">
                      <tbody>
                        {reportRows.map((row, i) => {
                          const Icon = row.icon;
                          return (
                            <tr key={i} className={i % 2 === 0 ? 'bg-slate-50/50' : 'bg-white'}>
                              <td className="px-4 py-2.5 text-slate-600 text-xs">
                                <div className="flex items-center gap-2">
                                  <Icon className="w-3.5 h-3.5 text-slate-400" />
                                  {row.label}
                                </div>
                              </td>
                              <td className="px-4 py-2.5 font-semibold text-slate-800 text-right capitalize">{row.value}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Charts */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                      <div className="text-xs font-bold text-slate-600 uppercase mb-2">Parcel Status</div>
                      <ResponsiveContainer width="100%" height={160}>
                        <PieChart>
                          <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={55} innerRadius={30} paddingAngle={2}>
                            {statusData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                          </Pie>
                          <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '11px' }} />
                          <Legend wrapperStyle={{ fontSize: '10px' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                      <div className="text-xs font-bold text-slate-600 uppercase mb-2">Conflict Types</div>
                      <ResponsiveContainer width="100%" height={160}>
                        <BarChart data={conflictData} margin={{ left: -15, right: 5, top: 5, bottom: 5 }}>
                          <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                          <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '11px' }} cursor={{ fill: 'rgba(148,163,184,0.1)' }} />
                          <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                            {conflictData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Priority summary */}
                  <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                    <div className="text-xs font-bold text-slate-600 uppercase mb-2">Priority Distribution</div>
                    <div className="grid grid-cols-4 gap-2">
                      {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map(p => (
                        <div key={p} className="text-center">
                          <PriorityBadge priority={p} />
                          <div className="text-lg font-bold text-slate-800 mt-1">{parcels.filter(pp => pp.priority === p).length}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="primary" onClick={generateGeoJSON}><FileJson className="w-4 h-4" /> Download GeoJSON</Button>
                    <Button variant="secondary" onClick={generateCSV}><FileSpreadsheet className="w-4 h-4" /> Download CSV</Button>
                    <Button variant="secondary" onClick={() => setCurrentPage('cadastral-map')}>View on Map</Button>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      <AIDisclaimer />
    </div>
  );
}
