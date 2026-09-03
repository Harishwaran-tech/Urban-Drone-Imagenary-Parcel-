import os
import sys
import argparse
import json
from PIL import Image

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.services.project_service import process_survey_pipeline

def main():
    parser = argparse.ArgumentParser(description="Run CadastraAI DL Inference on Drone Image and Export GeoJSON")
    parser.add_argument("--image", type=str, required=True, help="Path to input drone/orthomosaic image")
    parser.add_argument("--output", type=str, default="predicted_parcels.geojson", help="Output GeoJSON file path")
    args = parser.parse_args()

    if not os.path.exists(args.image):
        print(f"[!] Error: File not found: {args.image}")
        sys.exit(1)

    print(f"[*] Processing drone image: {args.image}")
    with open(args.image, "rb") as f:
        image_bytes = f.read()

    result = process_survey_pipeline(
        image_bytes=image_bytes,
        filename=os.path.basename(args.image),
        project_id="CLI-SURVEY",
    )

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(result["parcels_geojson"], f, indent=2)

    print(f"[+] Successfully extracted {result['stats']['total_parcels']} parcels and {result['stats']['buildings_detected']} buildings.")
    print(f"[+] Output GeoJSON saved to: {args.output}")
    print(f"[+] Inference Mode: {result['inference_mode']}")


if __name__ == "__main__":
    main()
