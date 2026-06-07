import base64
import requests
import json
import cv2
import numpy as np
from typing import List, Dict, Any, Tuple
from app.models.text_detection.symbol_and_text_associated import SymbolAndTextAssociated
from app.models.image_details import ImageDetails
import logger_config



import os

logger = logger_config.get_logger(__name__)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
MODEL_NAME = "gemini-flash-latest"
API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL_NAME}:generateContent"



def update_progress(percent, status):
    import tempfile
    import os
    import json
    try:
        progress_path = os.path.join(tempfile.gettempdir(), "pid_extraction_progress.json")
        with open(progress_path, "w") as f:
            json.dump({"percent": percent, "status": status}, f)
    except Exception:
        pass

def encode_image_to_base64(image_np: np.ndarray) -> str:
    """
    Resizes the image to a maximum dimension of 600 to minimize token usage,
    then encodes it to a base64 string.
    """
    max_dim = 600
    h, w = image_np.shape[:2]
    if max(h, w) > max_dim:
        scale = max_dim / max(h, w)
        image_np = cv2.resize(image_np, (0, 0), fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    _, buffer = cv2.imencode('.jpg', image_np, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
    return base64.b64encode(buffer).decode('utf-8')


def call_gemini_vlm(prompt: str, image_np: np.ndarray, schema: Dict[str, Any] = None) -> Dict[str, Any]:
    """
    Sends an image and prompt to the Gemini VLM and requests structured JSON output.
    Includes a retry loop with exponential backoff for rate limits (429) and server errors (503).
    """
    import time
    base64_image = encode_image_to_base64(image_np)
    
    headers = {
        "Content-Type": "application/json",
        "X-goog-api-key": GEMINI_API_KEY
    }
    
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt},
                    {
                        "inlineData": {
                            "mimeType": "image/jpeg",
                            "data": base64_image
                        }
                    }
                ]
            }
        ],
        "generationConfig": {
            "responseMimeType": "application/json"
        }
    }
    
    if schema:
        payload["generationConfig"]["responseSchema"] = schema
        
    max_retries = 8
    delay = 2.0

    for attempt in range(max_retries):
        try:
            response = requests.post(API_URL, headers=headers, json=payload, timeout=45)
            if response.status_code == 200:
                res_json = response.json()
                text_content = res_json['candidates'][0]['content']['parts'][0]['text']
                return json.loads(text_content)
            elif response.status_code in [429, 503]:
                if "quota" in response.text.lower() or "limit" in response.text.lower():
                    logger.error(f"Gemini API quota exceeded: {response.text}. Aborting VLM retry and falling back to geometric tracing.")
                    return {"connections": []}
                logger.warning(f"Gemini API returned status {response.status_code} on attempt {attempt+1}/{max_retries}. Error body: {response.text}. Retrying in {delay}s...")
                time.sleep(delay)
                delay *= 2.0

            else:
                logger.error(f"Gemini API returned error {response.status_code}: {response.text}")
                return {"connections": []}
        except Exception as e:
            logger.exception(f"Error calling Gemini VLM on attempt {attempt+1}/{max_retries}: {str(e)}")
            if attempt < max_retries - 1:
                time.sleep(delay)
                delay *= 2.0
            else:
                return {"connections": []}
                
    return {"connections": []}


def get_overlapping_symbols(
    symbols: List[SymbolAndTextAssociated],
    tile_coords: Tuple[int, int, int, int],
    w: int,
    h: int,
    padding: int = 20
) -> List[SymbolAndTextAssociated]:
    """
    Filters symbols that fall within or overlap with the tile bounding box.
    """
    tx1, ty1, tx2, ty2 = tile_coords
    overlapping = []
    
    for s in symbols:
        sx1 = int(s.topX * w) - padding
        sy1 = int(s.topY * h) - padding
        sx2 = int(s.bottomX * w) + padding
        sy2 = int(s.bottomY * h) + padding
        
        # Check intersection of bounding boxes
        if max(sx1, tx1) < min(sx2, tx2) and max(sy1, ty1) < min(sy2, ty2):
            overlapping.append(s)
            
    return overlapping

def run_vision_agent_pipeline(
    image_bytes: bytes,
    symbols: List[SymbolAndTextAssociated],
    lines: List[Any],
    image_details: ImageDetails,
    tiles: List[Tuple[np.ndarray, int, int, int, int]],
    annotated_full_image: np.ndarray
) -> List[Dict[str, Any]]:
    """
    Main vision agent pipeline that orchestrates the tile-by-tile analysis
    and the global reconciliation to trace P&ID connectivity.
    """
    w = image_details.width
    h = image_details.height
    
    # 1. Define standard output schema for Gemini
    connection_schema = {
        "type": "OBJECT",
        "properties": {
            "connections": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "from_id": {"type": "INTEGER", "description": "ID of the source symbol (prefixed with # on the image)"},
                        "to_id": {"type": "INTEGER", "description": "ID of the target symbol (prefixed with # on the image)"},
                        "confidence": {"type": "STRING", "description": "HIGH, MEDIUM, or LOW"}
                    },
                    "required": ["from_id", "to_id", "confidence"]
                }
            }
        },
        "required": ["connections"]
    }
    
    all_connections = []
    
    # 2. Process each tile that has at least two overlapping symbols
    for idx, (tile_img, tx1, ty1, tx2, ty2) in enumerate(tiles):
        tile_symbols = get_overlapping_symbols(symbols, (tx1, ty1, tx2, ty2), w, h)
        if len(tile_symbols) < 2:
            logger.info(f"Skipping tile {idx} (only {len(tile_symbols)} symbols present)")
            continue
            
        percent = int(80 + (idx / len(tiles)) * 15)
        update_progress(percent, f"Gemini VLM tracing tile {idx + 1} of {len(tiles)}...")
        logger.info(f"Processing tile {idx} ({tx1},{ty1} to {tx2},{ty2}) with {len(tile_symbols)} symbols...")
        
        # Prepare list of symbols for context
        symbol_descriptions = []
        for s in tile_symbols:
            tag_str = f"Tag: '{s.text_associated}'" if s.text_associated else "No Tag"
            symbol_descriptions.append(f"- Symbol ID #{s.id}: Type='{s.label.split('/')[-1]}', {tag_str}")
            
        symbol_list_str = "\n".join(symbol_descriptions)
        
        prompt = f"""You are a senior instrumentation engineer tracing a Piping and Instrumentation Diagram (P&ID).
Look at this sub-section (tile) of the P&ID. 

In this image, pipelines are traced in blue. Symbol bounding boxes are drawn in red, and each has its ID and tag printed (e.g. "#45 Gate Valve [UV-101]").

Here are the symbols visible in this tile section:
{symbol_list_str}

Task:
Trace the blue pipeline paths and identify all direct connections between these symbols.
Two symbols are directly connected if a blue pipe line goes from one to the other without passing through any other symbols listed.
If a blue pipe line splits or branches, trace all branches.

Identify all direct connections in this tile. Return them in the requested JSON format.
Only return connections between the symbols listed above.
"""
        result = call_gemini_vlm(prompt, tile_img, connection_schema)
        connections = result.get("connections", [])
        logger.info(f"Tile {idx} found {len(connections)} connections.")
        
        # Add tile coordinate info to track source
        for conn in connections:
            conn["source_tile"] = idx
            all_connections.append(conn)
            
        # Respect Gemini API free tier 15 RPM limit (1 request every 4 seconds)
        import time
        time.sleep(4.0)

            
    # 3. Global verification pass using a downsampled annotated image
    # Downsample the full annotated image to a size that respects Gemini limits (e.g., max 1600px width/height)
    max_dim = 1600
    full_h, full_w = annotated_full_image.shape[:2]
    if max(full_h, full_w) > max_dim:
        scale = max_dim / max(full_h, full_w)
        resized_full = cv2.resize(annotated_full_image, (0,0), fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    else:
        resized_full = annotated_full_image
        
    update_progress(95, "Gemini VLM: Reconciling global connections...")
    logger.info("Running global verification pass on full downsampled image...")
    
    # Prepare symbol descriptions for the global list
    global_symbol_descriptions = []
    for s in symbols:
        tag_str = f"Tag: '{s.text_associated}'" if s.text_associated else "No Tag"
        global_symbol_descriptions.append(f"- Symbol ID #{s.id}: Type='{s.label.split('/')[-1]}', {tag_str}")
        
    global_symbol_list_str = "\n".join(global_symbol_descriptions)
    
    # We pass the list of connections found from the tiles and ask the model to verify/reconcile them
    # and find any long-distance ones that were cut off by tiles.
    tiles_connections_summary = []
    for c in all_connections:
        tiles_connections_summary.append(f"  - #{c['from_id']} connected to #{c['to_id']}")
    tiles_conn_str = "\n".join(tiles_connections_summary)
    
    global_prompt = f"""You are a senior instrumentation engineer tracing a Piping and Instrumentation Diagram (P&ID).
Look at this full annotated P&ID drawing. 

Traced pipelines are in blue. Symbol bounding boxes are in red with their IDs and tags (e.g. "#45 Gate Valve [UV-101]").

Here is the full list of symbols on the drawing:
{global_symbol_list_str}

Our tile-by-tile analysis suggested the following connections:
{tiles_conn_str}

Your tasks:
1. Re-verify the suggested connections. Remove any that are visual mistakes or hallucinations.
2. Identify long-distance connections (e.g., pipes spanning across the diagram connecting equipment) that were missed in individual tiles.
3. Return the complete, final, and clean list of all direct connections for this entire P&ID.

Return the final consolidated connection list in the requested JSON format.
"""
    global_result = call_gemini_vlm(global_prompt, resized_full, connection_schema)
    final_connections = global_result.get("connections", [])
    logger.info(f"Global verification finished. Total final connections: {len(final_connections)}")
    
    return final_connections
