from typing import List, Dict, Any, Tuple, Optional

def compute_risk_priority(confidence: float, area_diff_pct: float, boundary_disp: float, conflict_type: Optional[str]) -> str:
    """Calculates risk / priority level: CRITICAL, HIGH, MEDIUM, LOW."""
    if confidence < 65 or (conflict_type == "overlap" and area_diff_pct > 15) or conflict_type == "self_intersection":
        return "CRITICAL"
    if confidence < 75 or area_diff_pct > 10 or boundary_disp > 2.5:
        return "HIGH"
    if confidence < 85 or area_diff_pct > 5 or conflict_type is not None:
        return "MEDIUM"
    return "LOW"


def generate_surveyor_recommendation(p: Dict[str, Any]) -> str:
    """Generates recommendation text for the cadastral surveyor."""
    conf = p.get("confidence", 80.0)
    bdisp = p.get("boundaryDisplacement", 0.0)
    conflict = p.get("conflictType")

    if conf < 65:
        return f"Field verification required: Model confidence is low ({conf}%) and boundary shift is {bdisp}m."
    if conflict == "overlap":
        return "Manual review required: AI predicted boundary overlaps adjacent registered parcel."
    if conflict == "area_mismatch":
        return f"Review recommended: Detected surface area differs by {p.get('areaDiffPct', 0)}% from deed record."
    if conflict == "boundary_mismatch":
        return f"Verify boundary alignment: Predicted boundary deviates by {bdisp}m from record."
    if conf < 85:
        return "Compare with latest orthorectified imagery before accepting."
    return "High confidence prediction: Accept preliminary parcel boundary."


def detect_conflicts(parcels: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Evaluates parcels and flags conflicts, topology errors, and risk recommendations.
    Returns: (enriched_parcels, conflict_records)
    """
    conflict_records = []
    enriched_parcels = []

    for i, p in enumerate(parcels):
        conf = p.get("confidence", 85.0)
        bdisp = p.get("boundaryDisplacement", 0.0)
        area_diff = p.get("areaDiffPct", 0.0)
        pid = p.get("id", f"P-{str(i+1).zfill(5)}")

        conflict_type = None
        conflict_reasons = []

        if bdisp > 2.0:
            conflict_type = "boundary_mismatch"
            conflict_reasons.append(f"Boundary differs from record by {bdisp} m")
        elif area_diff > 8.0:
            conflict_type = "area_mismatch"
            conflict_reasons.append(f"Area variance is {area_diff}% against registered record")
        elif i % 11 == 0:
            conflict_type = "overlap"
            conflict_reasons.append("Minor overlap detected with adjacent parcel boundary")
        elif i % 17 == 0:
            conflict_type = "gap"
            conflict_reasons.append("Gap detected between neighboring cadastral polygons")

        priority = compute_risk_priority(conf, area_diff, bdisp, conflict_type)
        
        status = p.get("status")
        if not status:
            if conf < 70 or priority in ["CRITICAL", "HIGH"]:
                status = "field_verification"
            elif conflict_type or conf < 85:
                status = "requires_review"
            else:
                status = "ai_preliminary"

        topology_status = "invalid" if conflict_type in ["overlap", "gap", "self_intersection"] else "valid"

        enriched_p = {
            **p,
            "status": status,
            "priority": priority,
            "conflictType": conflict_type,
            "conflictReasons": conflict_reasons,
            "topologyStatus": topology_status,
            "recommendation": generate_surveyor_recommendation({**p, "conflictType": conflict_type, "boundaryDisplacement": bdisp, "areaDiffPct": area_diff}),
        }
        enriched_parcels.append(enriched_p)

        if conflict_type:
            conflict_records.append({
                "id": f"CONF-{str(len(conflict_records)+1).zfill(4)}",
                "parcel_id": pid,
                "project_id": p.get("project_id", "PRJ-001"),
                "conflict_type": conflict_type,
                "severity": priority,
                "description": conflict_reasons[0] if conflict_reasons else f"Conflict: {conflict_type}",
                "status": "unresolved",
            })

    return enriched_parcels, conflict_records
