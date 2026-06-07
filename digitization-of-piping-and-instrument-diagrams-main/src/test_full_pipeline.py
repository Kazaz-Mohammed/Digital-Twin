import sys
import os
import cv2
import numpy as np
import copy
from ultralytics import YOLO

# Set required environment variables for the digitization project config
os.environ['BLOB_STORAGE_ACCOUNT_URL'] = 'dummy'
os.environ['BLOB_STORAGE_CONTAINER_NAME'] = 'dummy'
os.environ['FORM_RECOGNIZER_ENDPOINT'] = 'dummy'
os.environ['GRAPH_DB_CONNECTION_STRING'] = 'dummy'
os.environ['SYMBOL_DETECTION_API'] = 'dummy'
os.environ['SYMBOL_DETECTION_API_BEARER_TOKEN'] = 'dummy'

# Add the src folder of the digitization project to path so we can import its modules
sys.path.append(r"C:\Users\Asus\Desktop\pid extraction\digitization-of-piping-and-instrument-diagrams-main\src")

from app.services.line_detection.utils.line_detection_image_preprocessor import LineDetectionImagePreprocessor
from app.services.line_detection.line_segments_service import detect_line_segments
from app.services.graph_construction.graph_construction_service import construct_graph
from app.models.graph_construction.graph_construction_request import GraphConstructionInferenceRequest
from app.models.line_detection.line_detection_response import LineDetectionInferenceResponse
from app.models.text_detection.symbol_and_text_associated import SymbolAndTextAssociated
from app.models.image_details import ImageDetails
from app.models.bounding_box import BoundingBox

def main():
    image_path = r"C:\Users\Asus\Desktop\pid extraction\MLOpsManufacturing-main\samples\amlv2_pid_symbol_detection_train\src\app\dataset\val\images\39.jpg"
    model_path = r"C:\Users\Asus\Desktop\pid extraction\MLOpsManufacturing-main\samples\amlv2_pid_symbol_detection_train\src\app\runs\detect\train-7\weights\best.pt"
    
    print("1. Running YOLO symbol detection with ultra-low confidence (0.02) for maximum recall...")
    model = YOLO(model_path)
    results = model.predict(image_path, conf=0.02, verbose=False)
    
    from app.models.symbol_detection.symbol_detection_inference_response import SymbolDetectionInferenceResponse
    from app.models.symbol_detection.label import Label
    from app.services.text_detection.utils.ocr_client import ocr_client
    from app.services.text_detection.symbol_to_text_correlation_service import correlate_symbols_with_text
    from app.models.text_detection.text_recognized import TextRecognized
    from app.utils.image_utils import normalize_coordinates
    import io

    def calculate_iou(boxA, boxB):
        xA = max(boxA[0], boxB[0]); yA = max(boxA[1], boxB[1])
        xB = min(boxA[2], boxB[2]); yB = min(boxA[3], boxB[3])
        interArea = max(0, xB - xA) * max(0, yB - yA)
        boxAArea = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1])
        boxBArea = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1])
        return interArea / float(boxAArea + boxBArea - interArea)

    def nms(labels, iou_threshold=0.3):
        if not labels: return []
        labels = sorted(labels, key=lambda x: x.score, reverse=True)
        keep = []
        while labels:
            best = labels.pop(0)
            keep.append(best)
            labels = [l for l in labels if calculate_iou((best.topX, best.topY, best.bottomX, best.bottomY), (l.topX, l.topY, l.bottomX, l.bottomY)) < iou_threshold]
        return keep

    symbol_labels = []
    r = results[0]
    names = model.names
    
    for i, box in enumerate(r.boxes):
        cls = int(box.cls[0].item())
        label_name = names[cls]
        score = float(box.conf[0].item())
        x1, y1, x2, y2 = box.xyxyn[0].tolist()
        
        lbl = Label(
            id=i,
            label=label_name,
            score=score,
            topX=x1,
            topY=y1,
            bottomX=x2,
            bottomY=y2
        )
        symbol_labels.append(lbl)
    
    # Apply NMS to remove duplicate symbol detections
    print(f"Applying NMS to {len(symbol_labels)} detections...")
    symbol_labels = nms(symbol_labels)
    print(f"Keep {len(symbol_labels)} unique symbols after NMS.")

    print(f"Detected {len(symbol_labels)} symbols with YOLO.")

    with open(image_path, "rb") as f:
        img_bytes = f.read()
    
    image_bgr = cv2.imdecode(np.frombuffer(img_bytes, np.uint8), cv2.IMREAD_COLOR)
    image_height, image_width = image_bgr.shape[:2]

    import re

    def clean_tag_text(text: str) -> str:
        text = text.strip()
        # Clean '1J-' -> 'IJ-', '1F-' -> 'IF-'
        text = re.sub(r'^1([A-Z]-)', r'I\1', text)
        # Clean 'RRO-' -> 'RO-'
        text = re.sub(r'^([A-Z])\1([A-Z]-)', r'\1\2', text)
        # Clean 'ZZLC' -> 'ZLC'
        text = re.sub(r'^([A-Z])\1([A-Z]{2})', r'\1\2', text)
        # Clean double-prefix letters with spaces (e.g., 'ZZLC 961' -> 'ZLC 961')
        text = re.sub(r'^([A-Z])\1([A-Z]{2}\s+[0-9])', r'\1\2', text)
        # Clean common character typos
        text = text.replace('DOL', 'DDL')
        return text

    def is_inner_text_symbol(label: str) -> bool:
        label_lower = label.lower()
        return 'indicator' in label_lower or 'recorder' in label_lower or 'discrete' in label_lower or 'shared' in label_lower

    print("2. Running Local OCR (EasyOCR) - Horizontal Scan...")
    ocr_results = list(ocr_client.read_text(io.BytesIO(img_bytes)))
    
    text_details = []
    for text, bbox in ocr_results:
        xs = [p[0] for p in bbox]
        ys = [p[1] for p in bbox]
        tx1, ty1, tx2, ty2 = normalize_coordinates(min(xs), min(ys), max(xs), max(ys), image_height, image_width)
        text_details.append(TextRecognized(
            text=clean_tag_text(text),
            topX=tx1, topY=ty1, bottomX=tx2, bottomY=ty2
        ))
    
    print("2b. Running Local OCR (EasyOCR) - Global Rotated 90 CW Scan for vertical tags...")
    img_90 = cv2.rotate(image_bgr, cv2.ROTATE_90_CLOCKWISE)
    _, encoded_img_90 = cv2.imencode('.jpg', img_90)
    stream_90 = io.BytesIO(encoded_img_90.tobytes())
    ocr_results_90 = list(ocr_client.read_text(stream_90))
    
    for text, bbox in ocr_results_90:
        xs_rot = [p[0] for p in bbox]
        ys_rot = [p[1] for p in bbox]
        x_rot_min, x_rot_max = min(xs_rot), max(xs_rot)
        y_rot_min, y_rot_max = min(ys_rot), max(ys_rot)
        
        # Map CW rotated coordinates back to original image
        x_min = y_rot_min
        x_max = y_rot_max
        y_min = image_height - 1 - x_rot_max
        y_max = image_height - 1 - x_rot_min
        
        tx1, ty1, tx2, ty2 = normalize_coordinates(x_min, y_min, x_max, y_max, image_height, image_width)
        text_details.append(TextRecognized(
            text=clean_tag_text(text),
            topX=tx1, topY=ty1, bottomX=tx2, bottomY=ty2
        ))

    print("2c. Running Local OCR (EasyOCR) - Global Rotated 90 CCW Scan...")
    img_270 = cv2.rotate(image_bgr, cv2.ROTATE_90_COUNTERCLOCKWISE)
    _, encoded_img_270 = cv2.imencode('.jpg', img_270)
    stream_270 = io.BytesIO(encoded_img_270.tobytes())
    ocr_results_270 = list(ocr_client.read_text(stream_270))
    
    for text, bbox in ocr_results_270:
        xs_rot = [p[0] for p in bbox]
        ys_rot = [p[1] for p in bbox]
        x_rot_min, x_rot_max = min(xs_rot), max(xs_rot)
        y_rot_min, y_rot_max = min(ys_rot), max(ys_rot)
        
        # Map CCW rotated coordinates back to original image
        x_min = image_width - 1 - y_rot_max
        x_max = image_width - 1 - y_rot_min
        y_min = x_rot_min
        y_max = x_rot_max
        
        tx1, ty1, tx2, ty2 = normalize_coordinates(x_min, y_min, x_max, y_max, image_height, image_width)
        text_details.append(TextRecognized(
            text=clean_tag_text(text),
            topX=tx1, topY=ty1, bottomX=tx2, bottomY=ty2
        ))
    
    print(f"Total text blocks detected globally (horizontal + vertical): {len(text_details)}")

    print("3. Running Supercharged High-Precision Correlation Engine...")
    
    def get_tag_quality(text: str) -> int:
        text = text.strip()
        if len(text) < 2:
            return 0 # Garbage/short character
        
        has_letter = bool(re.search(r'[a-zA-Z]', text))
        has_number = bool(re.search(r'[0-9]', text))
        
        # Check if it looks like a dimension (e.g. 3"x2", 1"x3", 3x2, etc.)
        if re.search(r'[0-9]+[\s]*[xX\"][\s]*.*[0-9]+', text) or '"' in text or 'x' in text.lower():
            return 1 # Dimension / low quality
            
        if has_letter and has_number:
            if len(text) >= 4:
                return 3 # Class A: Perfect Tag!
            return 2 # Class B: Medium Quality Tag
            
        if has_letter:
            return 2 # Class B: pure letters
            
        return 1 # Class C: pure numbers / pipe sizes

    symbol_detection_response = SymbolDetectionInferenceResponse(
        image_url="dummy.jpg",
        image_details=ImageDetails(format="jpg", width=image_width, height=image_height),
        label=symbol_labels
    )
    
    from app.config import config
    config.symbol_label_prefixes_with_text = {'Equipment/', 'Instrument/'}
    config.flow_direction_asset_prefixes = {'Equipment/', 'Instrument/'}
    config.valve_symbol_prefix = 'Instrument/Valve/'
    
    prefixes_lowered = tuple(sorted([elem.lower() for elem in config.symbol_label_prefixes_with_text]))

    # Call legacy correlation first to get the response structure, but we will override its assignments!
    symbols_list = correlate_symbols_with_text(
        located_text=text_details,
        located_symbols=symbol_detection_response,
        area_threshold=0.5,
        distance_threshold=0.02,
        symbols_label_prefixes_with_text_lowered_tuple=prefixes_lowered
    )

    # 1. Clear legacy associations
    for sym in symbols_list:
        sym.text_associated = None

    # 2. Local High-Precision Crop Pass for ALL symbols (valves, indicators, equipment)
    print("3b. Running Local High-Precision Crop Scan...")
    for sym in symbols_list:
        is_inner = is_inner_text_symbol(sym.label)
        
        # Determine padding: tightly crop circles, generously crop valves to never cut off vertical tags!
        if is_inner:
            pad_x = int((sym.bottomX - sym.topX) * image_width * 0.20)
            pad_y = int((sym.bottomY - sym.topY) * image_height * 0.20)
        else:
            pad_x = max(int((sym.bottomX - sym.topX) * image_width * 1.5), 150)
            pad_y = max(int((sym.bottomY - sym.topY) * image_height * 1.5), 150)
            
        x1 = int(sym.topX * image_width)
        y1 = int(sym.topY * image_height)
        x2 = int(sym.bottomX * image_width)
        y2 = int(sym.bottomY * image_height)
        
        crop_x1 = max(0, x1 - pad_x)
        crop_y1 = max(0, y1 - pad_y)
        crop_x2 = min(image_width, x2 + pad_x)
        crop_y2 = min(image_height, y2 + pad_y)
        
        crop = image_bgr[crop_y1:crop_y2, crop_x1:crop_x2]
        if crop.size > 0:
            upscaled = cv2.resize(crop, (0, 0), fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
            
            crop_candidates = []
            
            symbol_center_crop_x = (x1 + x2) / 2.0 - crop_x1
            symbol_center_crop_y = (y1 + y2) / 2.0 - crop_y1
            
            # Horizontal Scan inside crop
            _, encoded_h = cv2.imencode('.jpg', upscaled)
            results_h = list(ocr_client.read_text(io.BytesIO(encoded_h.tobytes())))
            for text, bbox in results_h:
                clean_t = clean_tag_text(text)
                if len(clean_t) > 0:
                    xs = [p[0] / 2.0 for p in bbox]
                    ys = [p[1] / 2.0 for p in bbox]
                    text_center_x = (min(xs) + max(xs)) / 2.0
                    text_center_y = (min(ys) + max(ys)) / 2.0
                    
                    dist = ((text_center_x - symbol_center_crop_x)**2 + (text_center_y - symbol_center_crop_y)**2)**0.5
                    quality = get_tag_quality(clean_t)
                    crop_candidates.append((clean_t, quality, dist))
            
            # Vertical/Rotated Scan inside crop for valve tags
            if not is_inner:
                upscaled_90 = cv2.rotate(upscaled, cv2.ROTATE_90_CLOCKWISE)
                _, encoded_v = cv2.imencode('.jpg', upscaled_90)
                results_v = list(ocr_client.read_text(io.BytesIO(encoded_v.tobytes())))
                for text, bbox in results_v:
                    clean_t = clean_tag_text(text)
                    if len(clean_t) > 0:
                        H_rot = upscaled_90.shape[0]
                        xs_rot = [p[0] for p in bbox]
                        ys_rot = [p[1] for p in bbox]
                        
                        xs_crop = [y / 2.0 for y in ys_rot]
                        ys_crop = [(H_rot - 1 - x) / 2.0 for x in xs_rot]
                        
                        text_center_x = (min(xs_crop) + max(xs_crop)) / 2.0
                        text_center_y = (min(ys_crop) + max(ys_crop)) / 2.0
                        
                        dist = ((text_center_x - symbol_center_crop_x)**2 + (text_center_y - symbol_center_crop_y)**2)**0.5
                        quality = get_tag_quality(clean_t)
                        crop_candidates.append((clean_t, quality, dist))
            
            if crop_candidates:
                valid_candidates = []
                for txt, qual, dist in crop_candidates:
                    if is_inner or qual >= 2:
                        valid_candidates.append((txt, qual, dist))
                        
                if valid_candidates:
                    valid_candidates = sorted(valid_candidates, key=lambda x: (-x[1], x[2]))
                    best_txt, best_qual, best_dist = valid_candidates[0]
                    sym.text_associated = best_txt
                    print(f"  [Crop OCR Success] ID {sym.id} ({sym.label}) -> tag: '{best_txt}' (Quality: {best_qual}, Dist: {best_dist:0.1f}px)")

    # 3. Global Proximity Fallback (with strict Quality filtering)
    print("3c. Running Global Proximity Fallback for remaining tagless assets...")
    from app.utils.shapely_utils import bounding_box_to_polygon
    symbol_polygon_list = [bounding_box_to_polygon(sym) for sym in symbols_list]
    
    for i, sym in enumerate(symbols_list):
        if sym.text_associated is not None:
            continue
            
        symbol_poly = symbol_polygon_list[i]
        closest_text = None
        closest_dist = None
        closest_quality = 0
        
        for text_obj in text_details:
            txt = text_obj.text
            quality = get_tag_quality(txt)
            
            # Strict quality check: must be proper tag containing letters
            if quality < 2:
                continue
                
            text_poly = bounding_box_to_polygon(text_obj)
            dist = text_poly.distance(symbol_poly)
            
            if dist > 0.02: # Proximity limit (140 pixels)
                continue
                
            if (closest_text is None or 
                quality > closest_quality or 
                (quality == closest_quality and dist < closest_dist)):
                closest_text = txt
                closest_dist = dist
                closest_quality = quality
                
        if closest_text is not None:
            sym.text_associated = closest_text
            print(f"  [Global Proximity Success] ID {sym.id} ({sym.label}) -> tag: '{closest_text}' (Quality: {closest_quality})")

    # FALLBACK: If OCR *still* didn't find a tag, give it a fallback name so the 
    # Topology engine doesn't ignore it.
    for i, sym in enumerate(symbols_list):
        if sym.text_associated is None:
            clean_label = sym.label.split('/')[-1]
            sym.text_associated = f"{clean_label}_{i}"

    print("4. Loading image for line detection...")
    from app.config import config
    
    # OVERRIDE THRESHOLDS: The default 5 pixels is often too small for high-res scans.
    # Increasing this allows lines to "snap" to symbols more easily.
    config.graph_distance_threshold_for_symbols_pixels = 50
    config.graph_distance_threshold_for_lines_pixels = 50
    config.graph_line_buffer_pixels = 10
    
    # Enable Dotted Line Detection (Dashed lines)
    config.detect_dotted_lines = True
    
    # Ensure our YOLO prefixes are recognized as assets that can have text
    config.symbol_label_prefixes_with_text = {'Equipment/', 'Instrument/', 'Piping/'}
    config.flow_direction_asset_prefixes = {'Equipment/', 'Instrument/', 'Piping/'}
    config.valve_symbol_prefix = 'Instrument/Valve/'

    with open(image_path, "rb") as f:
        img_bytes = f.read()
    
    image_bgr = cv2.imdecode(np.frombuffer(img_bytes, np.uint8), cv2.IMREAD_COLOR)
    image_height, image_width = image_bgr.shape[:2]

    # Preprocessor needs denormalized coordinates to erase them from the image
    # Surgical padding:
    # - Symbols: 15px (Safe margin to kill complex symbol outlines)
    # - Text: 40px (Wide blackout for labels)
    padding_symbols = 15
    padding_text = 40
    
    # IMPORTANT: Use symbol_labels (all detections) instead of symbols_list (only associated ones)
    # This ensures symbols WITHOUT text are also erased.
    denormalized_symbols = []
    for s in symbol_labels:
        ds = copy.deepcopy(s)
        ds.topX = s.topX * image_width - padding_symbols
        ds.topY = s.topY * image_height - padding_symbols
        ds.bottomX = s.bottomX * image_width + padding_symbols
        ds.bottomY = s.bottomY * image_height + padding_symbols
        denormalized_symbols.append(ds)
        
    padding_text = 20 # Increased even more for text tags
        
    denormalized_texts = []
    for t in text_details:
        dt = copy.deepcopy(t)
        dt.topX = t.topX * image_width - padding_text
        dt.topY = t.topY * image_height - padding_text
        dt.bottomX = t.bottomX * image_width + padding_text
        dt.bottomY = t.bottomY * image_height + padding_text
        denormalized_texts.append(dt)

    print("Preprocessing image & erasing YOLO symbols and OCR text...")
    # Erase the YOLO symbols and OCR text so Hough transform only extracts pipes
    preprocessed_image = LineDetectionImagePreprocessor.preprocess(
        img_bytes,
        symbol_bounding_boxes=denormalized_symbols,
        text_bounding_boxes=denormalized_texts
    )
    
    # SECONDARY MANUAL ERASURE on the binary image to be 100% sure
    # This ensures any leftover bits after binarization are killed
    for bb in denormalized_symbols:
        cv2.rectangle(preprocessed_image, (int(bb.topX), int(bb.topY)), (int(bb.bottomX), int(bb.bottomY)), (0,0,0), -1)
    for bb in denormalized_texts:
        cv2.rectangle(preprocessed_image, (int(bb.topX), int(bb.topY)), (int(bb.bottomX), int(bb.bottomY)), (0,0,0), -1)
    
    # NEW: Morphological DUAL-STAGE cleanup
    # 1. Opening (2x2) - Safe for dashed lines
    print("Applying noise-killing morphological opening (2x2)...")
    kernel_open = np.ones((2,2), np.uint8)
    preprocessed_image = cv2.morphologyEx(preprocessed_image, cv2.MORPH_OPEN, kernel_open)
    
    # 2. Surgical Shape Filtering: Remove boxy noise (characters) but keep thin segments (pipes)
    print("Applying Surgical Shape filtering...")
    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(preprocessed_image, connectivity=8)
    for i in range(1, num_labels):
        w = stats[i, cv2.CC_STAT_WIDTH]
        h = stats[i, cv2.CC_STAT_HEIGHT]
        area = stats[i, cv2.CC_STAT_AREA]
        aspect_ratio = max(w, h) / max(min(w, h), 1)
        
        # Kill tiny dots
        if area < 15:
            preprocessed_image[labels == i] = 0
            continue
            
        # Kill boxy fragments (likely characters) but keep long ones (likely pipes/dashes)
        if area < 100 and aspect_ratio < 2.5:
            preprocessed_image[labels == i] = 0

    # 3. Closing (7x7) to bridge dashed lines
    print("Applying morphological closing (7x7) to bridge dashed lines...")
    kernel_close = np.ones((7,7), np.uint8)
    preprocessed_image = cv2.morphologyEx(preprocessed_image, cv2.MORPH_CLOSE, kernel_close)

    # PHYSICAL MARGIN ERASING: Black out the areas we want to ignore (Borders & Title Block)
    # Erase Title Blocks and Margins using configurable thresholds
    margin_top = int(image_height * 0.06)
    margin_bottom = int(image_height * 0.08)
    margin_left = int(image_width * 0.06)
    margin_right_start = int(image_width * 0.75)
    
    # Erase margins
    cv2.rectangle(preprocessed_image, (0, 0), (image_width, margin_top), (0,0,0), -1)
    cv2.rectangle(preprocessed_image, (0, image_height - margin_bottom), (image_width, image_height), (0,0,0), -1)
    cv2.rectangle(preprocessed_image, (0, 0), (margin_left, image_height), (0,0,0), -1)
    cv2.rectangle(preprocessed_image, (margin_right_start, 0), (image_width, image_height), (0,0,0), -1)

    print("Applying thinning...")
    thinned_image = LineDetectionImagePreprocessor.apply_thinning(preprocessed_image)

    print("Detecting line segments (Hough)...")
    
    # Define a bounding box to exclude the page borders and the right-side title block / notes
    drawing_area = BoundingBox(
        topX=0.06,    
        topY=0.06,    
        bottomX=0.75,
        bottomY=0.92
    )
    
    # detect_line_segments expects a DENORMALIZED bounding box (pixel coordinates)
    drawing_area_denormalized = BoundingBox(
        topX=drawing_area.topX * image_width,
        topY=drawing_area.topY * image_height,
        bottomX=drawing_area.bottomX * image_width,
        bottomY=drawing_area.bottomY * image_height
    )
    
    # Tuned parameters: 
    # - max_line_gap (30) is enough for dashes but less likely to jump over symbols
    # - Lower threshold (15) for maximum recall
    lines = detect_line_segments(
        pid_id="test",
        preprocessed_image=thinned_image,
        image_height=image_height,
        image_width=image_width,
        max_line_gap=30, 
        threshold=15,
        min_line_length=15, 
        rho=0.1,
        theta_param=1080.0,
        bounding_box_inclusive=drawing_area_denormalized
    )
    
    print(f"Detected {len(lines)} raw line segments.")

    print("5. Running Vision AI Agent for Topology Graph Construction...")
    
    from app.services.agent_topology.annotated_tile_generator import generate_annotated_image, slice_into_tiles, save_tiles_to_disk
    from app.services.agent_topology.vision_agent import run_vision_agent_pipeline
    from app.services.agent_topology.connectivity_parser import parse_vlm_connections
    from app.services.graph_construction.draw_persistent_graph import draw_persistent_graph_networkx
    
    output_image_graph_path = r"C:\Users\Asus\Desktop\pid extraction\final_topology_graph_clean.jpg"
    debug_image_graph_connections_path = r"C:\Users\Asus\Desktop\pid extraction\final_topology_graph_annotated.jpg"
    
    # 5a. Generate high-contrast annotated full image
    print("  [Vision Agent] Generating annotated image...")
    annotated_full = generate_annotated_image(
        img_bytes, 
        symbols_list, 
        lines, 
        ImageDetails(format="jpg", width=image_width, height=image_height)
    )
    
    # 5b. Slice annotated image into overlapping 2048x2048 tiles
    print("  [Vision Agent] Slicing image into overlapping tiles...")
    tiles = slice_into_tiles(annotated_full, tile_size=2048, overlap=300)
    tiles_dir = r"C:\Users\Asus\Desktop\pid extraction\tiles"
    tile_paths = save_tiles_to_disk(tiles, tiles_dir)
    print(f"  [Vision Agent] Saved {len(tile_paths)} tiles to: {tiles_dir}")

    
    # 5c. Run Vision Agent pipeline (Gemini VLM API)
    print("  [Vision Agent] Initiating Gemini VLM multi-turn tracing...")
    raw_vlm_connections = run_vision_agent_pipeline(
        img_bytes,
        symbols_list,
        lines,
        ImageDetails(format="jpg", width=image_width, height=image_height),
        tiles,
        annotated_full
    )
    
    # 5d. Parse VLM output into ConnectedSymbolsItem models
    print("  [Vision Agent] Parsing connectivity results...")
    asset_connectivities = parse_vlm_connections(raw_vlm_connections, symbols_list)
    
    # 6. Save visualizations
    print("6. Creating High-Fidelity Visualizations...")
    
    # Save the annotated visual P&ID (with lines and labelled symbol IDs)
    cv2.imwrite(debug_image_graph_connections_path, annotated_full)
    
    # Save the clean mathematical graph using networkx
    graph_prefixes = {'Equipment/', 'Instrument/', 'Piping/'}
    draw_persistent_graph_networkx(
        asset_connectivities, 
        output_image_graph_path, 
        graph_prefixes
    )
    
    # 7. Create custom state-of-the-art interactive web-based topology dashboard!
    print("7. Generating stunning interactive HTML/JS Topology Dashboard...")
    dashboard_path = r"C:\Users\Asus\Desktop\pid extraction\interactive_topology_dashboard.html"
    generate_interactive_dashboard(asset_connectivities, dashboard_path)

    print(f"Graph construction complete! Found {len(asset_connectivities)} connected assets.")
    print("Check your desktop for:")
    print(f"- {output_image_graph_path} (The Mathematical Graph)")
    print(f"- {debug_image_graph_connections_path} (The Full Detection View)")
    print(f"- {dashboard_path} (The Searchable Interactive Dashboard)")


def generate_interactive_dashboard(assets: list, output_path: str):
    import json
    
    nodes_map = {}
    edges_set = set()
    
    color_map = {
        'equipment': {'background': '#1e40af', 'border': '#3b82f6', 'font': {'color': '#ffffff'}}, 
        'valve': {'background': '#854d0e', 'border': '#eab308', 'font': {'color': '#ffffff'}}, 
        'indicator': {'background': '#991b1b', 'border': '#ef4444', 'font': {'color': '#ffffff'}}, 
        'other': {'background': '#065f46', 'border': '#10b981', 'font': {'color': '#ffffff'}}
    }
    
    for asset in assets:
        label_lower = asset.label.lower()
        if 'equipment' in label_lower:
            cat = 'equipment'
        elif 'valve' in label_lower:
            cat = 'valve'
        elif any(k in label_lower for k in ['indicator', 'recorder', 'discrete', 'shared']):
            cat = 'indicator'
        else:
            cat = 'other'
            
        color_style = color_map[cat]
        
        nodes_map[asset.id] = {
            'id': asset.id,
            'label': f"{asset.text_associated}\n({asset.label.split('/')[-1]})",
            'tag': asset.text_associated,
            'type': asset.label,
            'category': cat,
            'color': color_style,
            'shape': 'box',
            'margin': 10,
            'font': {'size': 12, 'face': 'Outfit, sans-serif'}
        }
        
        for conn in asset.connections:
            if conn.id not in nodes_map:
                conn_label_lower = conn.label.lower()
                if 'equipment' in conn_label_lower:
                    conn_cat = 'equipment'
                elif 'valve' in conn_label_lower:
                    conn_cat = 'valve'
                elif any(k in conn_label_lower for k in ['indicator', 'recorder', 'discrete', 'shared']):
                    conn_cat = 'indicator'
                else:
                    conn_cat = 'other'
                
                nodes_map[conn.id] = {
                    'id': conn.id,
                    'label': f"{conn.text_associated}\n({conn.label.split('/')[-1]})",
                    'tag': conn.text_associated,
                    'type': conn.label,
                    'category': conn_cat,
                    'color': color_map[conn_cat],
                    'shape': 'box',
                    'margin': 10,
                    'font': {'size': 12, 'face': 'Outfit, sans-serif'}
                }
            
            from_id = asset.id
            to_id = conn.id
            edge_key = (min(from_id, to_id), max(from_id, to_id))
            
            if edge_key not in edges_set:
                edges_set.add(edge_key)
                
    nodes_list = list(nodes_map.values())
    edges_list = [{'from': k[0], 'to': k[1], 'color': {'color': '#475569', 'highlight': '#10b981'}, 'width': 2} for k in edges_set]
    
    table_connections = []
    for asset in assets:
        for conn in asset.connections:
            table_connections.append({
                'source_id': asset.id,
                'source_tag': asset.text_associated,
                'source_type': asset.label.split('/')[-1],
                'target_id': conn.id,
                'target_tag': conn.text_associated,
                'target_type': conn.label.split('/')[-1]
            })
            
    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>P&ID Topology & Connectivity Dashboard</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap" rel="stylesheet">
    <script type="text/javascript" src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
    <style>
        * {{
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }}
        body {{
            font-family: 'Outfit', sans-serif;
            background-color: #0f172a;
            color: #f1f5f9;
            height: 100vh;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }}
        header {{
            background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
            padding: 15px 30px;
            border-bottom: 1px solid #334155;
            display: flex;
            justify-content: space-between;
            align-items: center;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }}
        header h1 {{
            font-size: 24px;
            font-weight: 700;
            background: linear-gradient(to right, #38bdf8, #818cf8);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }}
        .stats-badge {{
            background: rgba(129, 140, 248, 0.15);
            border: 1px solid rgba(129, 140, 248, 0.3);
            border-radius: 20px;
            padding: 5px 15px;
            font-size: 14px;
            color: #818cf8;
            font-weight: 600;
        }}
        .main-container {{
            flex: 1;
            display: flex;
            overflow: hidden;
        }}
        .left-panel {{
            width: 35%;
            border-right: 1px solid #334155;
            display: flex;
            flex-direction: column;
            background-color: #1e293b;
            padding: 20px;
            overflow: hidden;
        }}
        .search-container {{
            margin-bottom: 20px;
            position: relative;
        }}
        .search-input {{
            width: 100%;
            padding: 12px 15px;
            border-radius: 8px;
            border: 1px solid #475569;
            background-color: #0f172a;
            color: #f1f5f9;
            font-size: 15px;
            outline: none;
            transition: all 0.3s ease;
        }}
        .search-input:focus {{
            border-color: #6366f1;
            box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
        }}
        .table-container {{
            flex: 1;
            overflow-y: auto;
            border-radius: 8px;
            border: 1px solid #334155;
            background-color: #0f172a;
        }}
        table {{
            width: 100%;
            border-collapse: collapse;
            text-align: left;
            font-size: 14px;
        }}
        th, td {{
            padding: 12px 15px;
            border-bottom: 1px solid #1e293b;
        }}
        th {{
            background-color: rgba(30, 41, 59, 0.8);
            font-weight: 600;
            color: #94a3b8;
            position: sticky;
            top: 0;
        }}
        tr:hover {{
            background-color: rgba(99, 102, 241, 0.05);
            cursor: pointer;
        }}
        .badge {{
            padding: 3px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
        }}
        .badge-equipment {{ background-color: rgba(59, 130, 246, 0.2); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); }}
        .badge-valve {{ background-color: rgba(234, 179, 8, 0.2); color: #facc15; border: 1px solid rgba(234, 179, 8, 0.3); }}
        .badge-indicator {{ background-color: rgba(239, 68, 68, 0.2); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.3); }}
        .badge-other {{ background-color: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }}
        
        .right-panel {{
            width: 65%;
            position: relative;
            background-color: #0b0f19;
        }}
        #network-canvas {{
            width: 100%;
            height: 100%;
        }}
        .legend {{
            position: absolute;
            bottom: 20px;
            right: 20px;
            background: rgba(30, 41, 59, 0.9);
            border: 1px solid #475569;
            padding: 15px;
            border-radius: 8px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            font-size: 13px;
            z-index: 10;
            backdrop-filter: blur(8px);
        }}
        .legend-item {{
            display: flex;
            align-items: center;
            gap: 10px;
        }}
        .legend-color {{
            width: 15px;
            height: 15px;
            border-radius: 3px;
        }}
    </style>
</head>
<body>
    <header>
        <h1>P&ID Topology & Connectivity Dashboard</h1>
        <div class="stats-badge">Total Assets: {len(nodes_list)} | Total Pipelines: {len(edges_list)}</div>
    </header>
    
    <div class="main-container">
        <div class="left-panel">
            <div class="search-container">
                <input type="text" id="search-box" class="search-input" placeholder="🔍 Search by Asset Tag or Type...">
            </div>
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Source Asset</th>
                            <th></th>
                            <th>Target Asset</th>
                        </tr>
                    </thead>
                    <tbody id="connections-table-body">
                        <!-- Table rows generated by JS -->
                    </tbody>
                </table>
            </div>
        </div>
        
        <div class="right-panel">
            <div id="network-canvas"></div>
            
            <div class="legend">
                <div class="legend-item">
                    <div class="legend-color" style="background-color: #1e40af; border: 1px solid #3b82f6;"></div>
                    <span>Equipment (Pumps, Tanks)</span>
                </div>
                <div class="legend-item">
                    <div class="legend-color" style="background-color: #854d0e; border: 1px solid #eab308;"></div>
                    <span>Valves & Fittings</span>
                </div>
                <div class="legend-item">
                    <div class="legend-color" style="background-color: #991b1b; border: 1px solid #ef4444;"></div>
                    <span>Indicators & Controllers</span>
                </div>
                <div class="legend-item">
                    <div class="legend-color" style="background-color: #065f46; border: 1px solid #10b981;"></div>
                    <span>Other Fittings</span>
                </div>
            </div>
        </div>
    </div>
    
    <script>
        const nodesData = {json.dumps(nodes_list)};
        const edgesData = {json.dumps(edges_list)};
        const connectionsTable = {json.dumps(table_connections)};
        
        const container = document.getElementById('network-canvas');
        const data = {{
            nodes: new vis.DataSet(nodesData),
            edges: new vis.DataSet(edgesData)
        }};
        
        const options = {{
            nodes: {{
                shape: 'box',
                borderWidth: 2,
                shadow: true
            }},
            edges: {{
                width: 2,
                shadow: false,
                smooth: {{
                    type: 'continuous'
                }}
            }},
            physics: {{
                barnesHut: {{
                    gravitationalConstant: -3000,
                    centralGravity: 0.1,
                    springLength: 120,
                    springConstant: 0.04,
                    damping: 0.09,
                    avoidOverlap: 0.5
                }},
                stabilization: {{
                    iterations: 150
                }}
            }}
        }};
        
        const network = new vis.Network(container, data, options);
        
        function renderTable(filterText = '') {{
            const tbody = document.getElementById('connections-table-body');
            tbody.innerHTML = '';
            
            const lowerFilter = filterText.toLowerCase();
            
            connectionsTable.forEach(conn => {{
                if (lowerFilter && 
                    !conn.source_tag.toLowerCase().includes(lowerFilter) && 
                    !conn.source_type.toLowerCase().includes(lowerFilter) &&
                    !conn.target_tag.toLowerCase().includes(lowerFilter) &&
                    !conn.target_type.toLowerCase().includes(lowerFilter)) {{
                    return;
                }}
                
                const tr = document.createElement('tr');
                tr.onclick = () => {{
                    network.selectNodes([conn.source_id, conn.target_id]);
                    network.focus(conn.source_id, {{ scale: 1.2, animation: true }});
                }};
                
                const sourceBadge = conn.source_type.toLowerCase().includes('valve') ? 'badge-valve' : 
                                    (conn.source_type.toLowerCase().includes('indicator') || conn.source_type.toLowerCase().includes('recorder') ? 'badge-indicator' : 'badge-equipment');
                                    
                const targetBadge = conn.target_type.toLowerCase().includes('valve') ? 'badge-valve' : 
                                    (conn.target_type.toLowerCase().includes('indicator') || conn.target_type.toLowerCase().includes('recorder') ? 'badge-indicator' : 'badge-equipment');
                
                tr.innerHTML = `
                    <td>
                        <div style="font-weight:600;">${{conn.source_tag}}</div>
                        <span class="badge ${{sourceBadge}}">${{conn.source_type}}</span>
                    </td>
                    <td style="color:#6366f1; text-align:center; font-weight:bold;">➔</td>
                    <td>
                        <div style="font-weight:600;">${{conn.target_tag}}</div>
                        <span class="badge ${{targetBadge}}">${{conn.target_type}}</span>
                    </td>
                `;
                tbody.appendChild(tr);
            }});
        }}
        
        renderTable();
        
        document.getElementById('search-box').addEventListener('input', (e) => {{
            const query = e.target.value;
            renderTable(query);
            
            if (query.trim() !== '') {{
                const matchingNodes = nodesData.filter(n => n.tag.toLowerCase().includes(query.toLowerCase()));
                if (matchingNodes.length > 0) {{
                    network.selectNodes(matchingNodes.map(n => n.id));
                }}
            }} else {{
                network.unselectAll();
            }}
        }});
        
        network.on("selectNode", function (params) {{
            const selectedNodeId = params.nodes[0];
            const node = nodesData.find(n => n.id === selectedNodeId);
            if (node) {{
                document.getElementById('search-box').value = node.tag;
                renderTable(node.tag);
            }}
        }});
    </script>
</body>
</html>
"""
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html_content)
    print(f"Generated stunning P&ID interactive topology dashboard at: {output_path}")

if __name__ == "__main__":
    main()
