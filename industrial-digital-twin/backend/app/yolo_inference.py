import os
os.environ['KMP_DUPLICATE_LIB_OK'] = 'TRUE'
import sys
import json
from ultralytics import YOLO
import cv2
import numpy as np

# Set required environment variables for the digitization project config
os.environ['BLOB_STORAGE_ACCOUNT_URL'] = 'dummy'
os.environ['BLOB_STORAGE_CONTAINER_NAME'] = 'dummy'
os.environ['FORM_RECOGNIZER_ENDPOINT'] = 'dummy'
os.environ['GRAPH_DB_CONNECTION_STRING'] = 'dummy'
os.environ['SYMBOL_DETECTION_API'] = 'dummy'
os.environ['SYMBOL_DETECTION_API_BEARER_TOKEN'] = 'dummy'

# Add the src folder of the digitization project to path so we can import its modules
default_digitization_path = os.path.abspath(os.path.join(
    os.path.dirname(__file__),
    "..", "..", "..", "digitization-of-piping-and-instrument-diagrams-main", "src"
))
digitization_path = os.getenv("DIGITIZATION_SRC_DIR", default_digitization_path)
sys.path.append(digitization_path)

from app.services.line_detection.utils.line_detection_image_preprocessor import LineDetectionImagePreprocessor
from app.services.line_detection.line_segments_service import detect_line_segments
from app.models.bounding_box import BoundingBox
from app.services.text_detection.utils.ocr_client import ocr_client
import io

def get_text_bounding_boxes(img_bytes, width, height, padding_text=20):
    denormalized_texts = []
    
    # 1. Horizontal Scan
    try:
        ocr_results_h = list(ocr_client.read_text(io.BytesIO(img_bytes)))
        for text, bbox in ocr_results_h:
            xs = [p[0] for p in bbox]
            ys = [p[1] for p in bbox]
            denormalized_texts.append(BoundingBox(
                topX=min(xs) - padding_text,
                topY=min(ys) - padding_text,
                bottomX=max(xs) + padding_text,
                bottomY=max(ys) + padding_text
            ))
    except Exception as e:
        print(f"Horizontal OCR error: {e}", file=sys.stderr)

    # Decode image once for rotation scans
    try:
        image_bgr = cv2.imdecode(np.frombuffer(img_bytes, np.uint8), cv2.IMREAD_COLOR)
        
        # 2. CW 90 Scan
        img_90 = cv2.rotate(image_bgr, cv2.ROTATE_90_CLOCKWISE)
        _, encoded_img_90 = cv2.imencode('.jpg', img_90)
        ocr_results_90 = list(ocr_client.read_text(io.BytesIO(encoded_img_90.tobytes())))
        for text, bbox in ocr_results_90:
            xs_rot = [p[0] for p in bbox]
            ys_rot = [p[1] for p in bbox]
            x_rot_min, x_rot_max = min(xs_rot), max(xs_rot)
            y_rot_min, y_rot_max = min(ys_rot), max(ys_rot)
            
            x_min = y_rot_min
            x_max = y_rot_max
            y_min = height - 1 - x_rot_max
            y_max = height - 1 - x_rot_min
            
            denormalized_texts.append(BoundingBox(
                topX=x_min - padding_text,
                topY=y_min - padding_text,
                bottomX=x_max + padding_text,
                bottomY=y_max + padding_text
            ))
            
        # 3. CCW 90 Scan
        img_270 = cv2.rotate(image_bgr, cv2.ROTATE_90_COUNTERCLOCKWISE)
        _, encoded_img_270 = cv2.imencode('.jpg', img_270)
        ocr_results_270 = list(ocr_client.read_text(io.BytesIO(encoded_img_270.tobytes())))
        for text, bbox in ocr_results_270:
            xs_rot = [p[0] for p in bbox]
            ys_rot = [p[1] for p in bbox]
            x_rot_min, x_rot_max = min(xs_rot), max(xs_rot)
            y_rot_min, y_rot_max = min(ys_rot), max(ys_rot)
            
            x_min = width - 1 - y_rot_max
            x_max = width - 1 - y_rot_min
            y_min = x_rot_min
            y_max = x_rot_max
            
            denormalized_texts.append(BoundingBox(
                topX=x_min - padding_text,
                topY=y_min - padding_text,
                bottomX=x_max + padding_text,
                bottomY=y_max + padding_text
            ))
    except Exception as e:
        print(f"Rotated OCR error: {e}", file=sys.stderr)
        
    return denormalized_texts

def calculate_iou(boxA, boxB):
    xA = max(boxA[0], boxB[0]); yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2]); yB = min(boxA[3], boxB[3])
    interArea = max(0, xB - xA) * max(0, yB - yA)
    boxAArea = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1])
    boxBArea = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1])
    unionArea = float(boxAArea + boxBArea - interArea)
    return interArea / unionArea if unionArea > 0 else 0

def nms(boxes, iou_threshold=0.3):
    if not boxes: return []
    boxes = sorted(boxes, key=lambda x: x['confidence'], reverse=True)
    keep = []
    while boxes:
        best = boxes.pop(0)
        keep.append(best)
        boxes = [b for b in boxes if calculate_iou(
            (best['x'], best['y'], best['x'] + best['w'], best['y'] + best['h']),
            (b['x'], b['y'], b['x'] + b['w'], b['y'] + b['h'])
        ) < iou_threshold]
    return keep

def update_progress(percent, status):
    try:
        import tempfile
        progress_path = os.path.join(tempfile.gettempdir(), "pid_extraction_progress.json")
        with open(progress_path, "w") as f:
            json.dump({"percent": percent, "status": status}, f)
    except Exception:
        pass

def run_inference(image_path, model_path):
    update_progress(5, "Loading YOLO model...")
    try:
        model = YOLO(model_path)
        img = cv2.imread(image_path)
        if img is None:
            print(json.dumps({"error": "Could not read image"}))
            return
        
        height, width, _ = img.shape
        update_progress(15, "Running YOLO symbol detection...")
        results = model.predict(image_path, conf=0.02, verbose=False)
        
        raw_bboxes = []
        for r in results:
            boxes = r.boxes
            for i, box in enumerate(boxes):
                xyxy = box.xyxy[0].tolist()
                x_min, y_min, x_max, y_max = xyxy
                
                confidence = float(box.conf[0]) * 100
                cls_idx = int(box.cls[0])
                class_name = model.names.get(cls_idx, f"Class {cls_idx}")
                
                w_box = x_max - x_min
                h_box = y_max - y_min
                
                raw_bboxes.append({
                    "id": f"box-yolo-{i}",
                    "label": class_name,
                    "x": x_min / width,
                    "y": y_min / height,
                    "w": w_box / width,
                    "h": h_box / height,
                    "confidence": round(confidence, 1),
                    "tag": ""
                })

        # Apply NMS
        bboxes = nms(raw_bboxes, iou_threshold=0.3)

        # Run high-precision text correlation to associate tags with symbols
        from app.models.symbol_detection.symbol_detection_inference_response import SymbolDetectionInferenceResponse
        from app.models.symbol_detection.label import Label
        from app.models.text_detection.text_recognized import TextRecognized
        from app.utils.image_utils import normalize_coordinates
        from app.services.text_detection.symbol_to_text_correlation_service import correlate_symbols_with_text
        from app.models.image_details import ImageDetails
        import re

        def clean_tag_text(text: str) -> str:
            text = text.strip()
            text = re.sub(r'^1([A-Z]-)', r'I\1', text)
            text = re.sub(r'^([A-Z])\1([A-Z]-)', r'\1\2', text)
            text = re.sub(r'^([A-Z])\1([A-Z]{2})', r'\1\2', text)
            text = re.sub(r'^([A-Z])\1([A-Z]{2}\s+[0-9])', r'\1\2', text)
            text = text.replace('DOL', 'DDL')
            return text

        def is_inner_text_symbol(label: str) -> bool:
            label_lower = label.lower()
            return 'indicator' in label_lower or 'recorder' in label_lower or 'discrete' in label_lower or 'shared' in label_lower

        def get_tag_quality(text: str) -> int:
            text = text.strip()
            if len(text) < 2: return 0
            has_letter = bool(re.search(r'[a-zA-Z]', text))
            has_number = bool(re.search(r'[0-9]', text))
            if re.search(r'[0-9]+[\s]*[xX\"][\s]*.*[0-9]+', text) or '"' in text or 'x' in text.lower():
                return 1
            if has_letter and has_number:
                if len(text) >= 4: return 3
                return 2
            if has_letter: return 2
            return 1

        with open(image_path, "rb") as f:
            img_bytes = f.read()

        # Run global horizontal OCR
        update_progress(25, "Running horizontal text recognition...")
        ocr_results_h = list(ocr_client.read_text(io.BytesIO(img_bytes)))
        text_details = []
        for text, bbox in ocr_results_h:
            xs = [p[0] for p in bbox]
            ys = [p[1] for p in bbox]
            tx1, ty1, tx2, ty2 = normalize_coordinates(min(xs), min(ys), max(xs), max(ys), height, width)
            text_details.append(TextRecognized(
                text=clean_tag_text(text),
                topX=tx1, topY=ty1, bottomX=tx2, bottomY=ty2
            ))

        # Rotated CW 90 OCR Scan for vertical text details
        update_progress(35, "Scanning rotated text layouts...")
        image_bgr = cv2.imdecode(np.frombuffer(img_bytes, np.uint8), cv2.IMREAD_COLOR)
        img_90 = cv2.rotate(image_bgr, cv2.ROTATE_90_CLOCKWISE)
        _, encoded_img_90 = cv2.imencode('.jpg', img_90)
        ocr_results_90 = list(ocr_client.read_text(io.BytesIO(encoded_img_90.tobytes())))
        for text, bbox in ocr_results_90:
            xs_rot = [p[0] for p in bbox]
            ys_rot = [p[1] for p in bbox]
            x_rot_min, x_rot_max = min(xs_rot), max(xs_rot)
            y_rot_min, y_rot_max = min(ys_rot), max(ys_rot)
            x_min = y_rot_min
            x_max = y_rot_max
            y_min = height - 1 - x_rot_max
            y_max = height - 1 - x_rot_min
            tx1, ty1, tx2, ty2 = normalize_coordinates(x_min, y_min, x_max, y_max, height, width)
            text_details.append(TextRecognized(
                text=clean_tag_text(text),
                topX=tx1, topY=ty1, bottomX=tx2, bottomY=ty2
            ))

        # Rotated CCW 90 OCR Scan
        img_270 = cv2.rotate(image_bgr, cv2.ROTATE_90_COUNTERCLOCKWISE)
        _, encoded_img_270 = cv2.imencode('.jpg', img_270)
        ocr_results_270 = list(ocr_client.read_text(io.BytesIO(encoded_img_270.tobytes())))
        for text, bbox in ocr_results_270:
            xs_rot = [p[0] for p in bbox]
            ys_rot = [p[1] for p in bbox]
            x_rot_min, x_rot_max = min(xs_rot), max(xs_rot)
            y_rot_min, y_rot_max = min(ys_rot), max(ys_rot)
            x_min = width - 1 - y_rot_max
            x_max = width - 1 - y_rot_min
            y_min = x_rot_min
            y_max = x_rot_max
            tx1, ty1, tx2, ty2 = normalize_coordinates(x_min, y_min, x_max, y_max, height, width)
            text_details.append(TextRecognized(
                text=clean_tag_text(text),
                topX=tx1, topY=ty1, bottomX=tx2, bottomY=ty2
            ))

        # Build symbol labels for correlation
        symbol_labels_list = []
        for i, box in enumerate(bboxes):
            symbol_labels_list.append(Label(
                id=i,
                label=box["label"],
                score=box["confidence"] / 100.0,
                topX=box["x"],
                topY=box["y"],
                bottomX=box["x"] + box["w"],
                bottomY=box["y"] + box["h"]
            ))

        symbol_detection_response = SymbolDetectionInferenceResponse(
            image_url="dummy.jpg",
            image_details=ImageDetails(format="jpg", width=width, height=height),
            label=symbol_labels_list
        )

        from app.config import config
        config.symbol_label_prefixes_with_text = {'Equipment/', 'Instrument/'}
        config.flow_direction_asset_prefixes = {'Equipment/', 'Instrument/'}
        config.valve_symbol_prefix = 'Instrument/Valve/'
        prefixes_lowered = tuple(sorted([elem.lower() for elem in config.symbol_label_prefixes_with_text]))

        update_progress(45, "Matching symbols with text labels...")
        symbols_list = correlate_symbols_with_text(
            located_text=text_details,
            located_symbols=symbol_detection_response,
            area_threshold=0.5,
            distance_threshold=0.02,
            symbols_label_prefixes_with_text_lowered_tuple=prefixes_lowered
        )

        for sym in symbols_list:
            sym.text_associated = None

        # Local Crop scan pass
        update_progress(50, "Running high-precision crop scan correlation...")
        for sym in symbols_list:
            is_inner = is_inner_text_symbol(sym.label)
            if is_inner:
                pad_x = int((sym.bottomX - sym.topX) * width * 0.20)
                pad_y = int((sym.bottomY - sym.topY) * height * 0.20)
            else:
                pad_x = max(int((sym.bottomX - sym.topX) * width * 1.5), 150)
                pad_y = max(int((sym.bottomY - sym.topY) * height * 1.5), 150)
                
            x1 = int(sym.topX * width)
            y1 = int(sym.topY * height)
            x2 = int(sym.bottomX * width)
            y2 = int(sym.bottomY * height)
            
            crop_x1 = max(0, x1 - pad_x)
            crop_y1 = max(0, y1 - pad_y)
            crop_x2 = min(width, x2 + pad_x)
            crop_y2 = min(height, y2 + pad_y)
            
            crop = image_bgr[crop_y1:crop_y2, crop_x1:crop_x2]
            if crop.size > 0:
                upscaled = cv2.resize(crop, (0, 0), fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
                crop_candidates = []
                symbol_center_crop_x = (x1 + x2) / 2.0 - crop_x1
                symbol_center_crop_y = (y1 + y2) / 2.0 - crop_y1
                
                _, encoded_h = cv2.imencode('.jpg', upscaled)
                results_h_crop = list(ocr_client.read_text(io.BytesIO(encoded_h.tobytes())))
                for text, bbox in results_h_crop:
                    clean_t = clean_tag_text(text)
                    if len(clean_t) > 0:
                        xs = [p[0] / 2.0 for p in bbox]
                        ys = [p[1] / 2.0 for p in bbox]
                        text_center_x = (min(xs) + max(xs)) / 2.0
                        text_center_y = (min(ys) + max(ys)) / 2.0
                        dist = ((text_center_x - symbol_center_crop_x)**2 + (text_center_y - symbol_center_crop_y)**2)**0.5
                        quality = get_tag_quality(clean_t)
                        crop_candidates.append((clean_t, quality, dist))
                
                if not is_inner:
                    upscaled_90 = cv2.rotate(upscaled, cv2.ROTATE_90_CLOCKWISE)
                    _, encoded_v = cv2.imencode('.jpg', upscaled_90)
                    results_v_crop = list(ocr_client.read_text(io.BytesIO(encoded_v.tobytes())))
                    for text, bbox in results_v_crop:
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
                        sym.text_associated = valid_candidates[0][0]

        # Global Proximity Fallback
        from app.utils.shapely_utils import bounding_box_to_polygon
        symbol_polygon_list = [bounding_box_to_polygon(sym) for sym in symbols_list]
        for idx, sym in enumerate(symbols_list):
            if sym.text_associated is not None:
                continue
            symbol_poly = symbol_polygon_list[idx]
            closest_text = None
            closest_dist = None
            closest_quality = 0
            for text_obj in text_details:
                txt = text_obj.text
                quality = get_tag_quality(txt)
                if quality < 2:
                    continue
                text_poly = bounding_box_to_polygon(text_obj)
                dist = text_poly.distance(symbol_poly)
                if dist > 0.02:
                    continue
                if (closest_text is None or 
                    quality > closest_quality or 
                    (quality == closest_quality and dist < closest_dist)):
                    closest_text = txt
                    closest_dist = dist
                    closest_quality = quality
            if closest_text is not None:
                sym.text_associated = closest_text

        # Re-assign the tags back to the response dicts and use fallback names
        for idx, sym in enumerate(symbols_list):
            tag_val = sym.text_associated
            if tag_val is None:
                clean_label = sym.label.split('/')[-1]
                tag_val = f"{clean_label}_{idx}"
            bboxes[idx]["tag"] = tag_val

        # Build denormalized_symbols from the boxes
        denormalized_symbols = []
        for box in bboxes:
            x_min = box["x"] * width
            y_min = box["y"] * height
            x_max = (box["x"] + box["w"]) * width
            y_max = (box["y"] + box["h"]) * height
            
            padding_symbols = 15
            denormalized_symbols.append(BoundingBox(
                topX=max(0, x_min - padding_symbols),
                topY=max(0, y_min - padding_symbols),
                bottomX=min(width, x_max + padding_symbols),
                bottomY=min(height, y_max + padding_symbols)
            ))

        # Build denormalized_texts from populated text_details to erase them for line detection
        denormalized_texts = []
        for t in text_details:
            denormalized_texts.append(BoundingBox(
                topX=t.topX * width - 20,
                topY=t.topY * height - 20,
                bottomX=t.bottomX * width + 20,
                bottomY=t.bottomY * height + 20
            ))

        update_progress(60, "Running morphological pipeline preprocessing...")
        preprocessed_image = LineDetectionImagePreprocessor.preprocess(
            img_bytes,
            symbol_bounding_boxes=denormalized_symbols,
            text_bounding_boxes=denormalized_texts
        )

        # Secondary manual erasure on binary image
        for bb in denormalized_symbols:
            cv2.rectangle(preprocessed_image, (int(bb.topX), int(bb.topY)), (int(bb.bottomX), int(bb.bottomY)), (0,0,0), -1)
        for bb in denormalized_texts:
            cv2.rectangle(preprocessed_image, (int(bb.topX), int(bb.topY)), (int(bb.bottomX), int(bb.bottomY)), (0,0,0), -1)

        # Morphological dual-stage cleanup
        kernel_open = np.ones((2,2), np.uint8)
        preprocessed_image = cv2.morphologyEx(preprocessed_image, cv2.MORPH_OPEN, kernel_open)

        num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(preprocessed_image, connectivity=8)
        
        # Optimized vector-based shape filtering
        if num_labels > 1:
            widths = stats[:, cv2.CC_STAT_WIDTH]
            heights = stats[:, cv2.CC_STAT_HEIGHT]
            areas = stats[:, cv2.CC_STAT_AREA]
            
            min_dim = np.minimum(widths, heights)
            min_dim[min_dim == 0] = 1
            aspect_ratios = np.maximum(widths, heights) / min_dim
            
            to_delete = np.zeros(num_labels, dtype=bool)
            # Find which component labels to delete
            for i in range(1, num_labels):
                a = areas[i]
                ar = aspect_ratios[i]
                if a < 15:
                    to_delete[i] = True
                elif a < 100 and ar < 2.5:
                    to_delete[i] = True
            
            # Fast vectorized erasure
            preprocessed_image[to_delete[labels]] = 0

        # Morphological closing
        kernel_close = np.ones((7,7), np.uint8)
        preprocessed_image = cv2.morphologyEx(preprocessed_image, cv2.MORPH_CLOSE, kernel_close)

        # Title blocks & margins erasure
        margin_top = int(height * 0.06)
        margin_bottom = int(height * 0.08)
        margin_left = int(width * 0.06)
        margin_right_start = int(width * 0.75)

        cv2.rectangle(preprocessed_image, (0, 0), (width, margin_top), (0,0,0), -1)
        cv2.rectangle(preprocessed_image, (0, height - margin_bottom), (width, height), (0,0,0), -1)
        cv2.rectangle(preprocessed_image, (0, 0), (margin_left, height), (0,0,0), -1)
        cv2.rectangle(preprocessed_image, (margin_right_start, 0), (width, height), (0,0,0), -1)

        # Thinning
        thinned_image = LineDetectionImagePreprocessor.apply_thinning(preprocessed_image)

        # Hough line detection with Bounding Box drawing area
        drawing_area = BoundingBox(
            topX=0.06 * width,    
            topY=0.06 * height,    
            bottomX=0.75 * width,
            bottomY=0.92 * height
        )

        update_progress(70, "Detecting pipeline segments (Hough)...")
        detected_lines = detect_line_segments(
            pid_id="test",
            preprocessed_image=thinned_image,
            image_height=height,
            image_width=width,
            max_line_gap=30, 
            threshold=15,
            min_line_length=15, 
            rho=0.1,
            theta_param=1080.0,
            bounding_box_inclusive=drawing_area
        )

        lines_output = []
        for i, line in enumerate(detected_lines):
            lines_output.append({
                "id": f"line-{i}",
                "startX": float(line.startX),
                "startY": float(line.startY),
                "endX": float(line.endX),
                "endY": float(line.endY)
            })

        def point_to_box_dist(x, y, bx1, by1, bx2, by2):
            cx = max(bx1, min(x, bx2))
            cy = max(by1, min(y, by2))
            return ((x - cx)**2 + (y - cy)**2)**0.5

        def lines_close(l1, l2, threshold=40):
            pts1 = [(l1['startX'], l1['startY']), (l1['endX'], l1['endY'])]
            pts2 = [(l2['startX'], l2['startY']), (l2['endX'], l2['endY'])]
            for p1 in pts1:
                for p2 in pts2:
                    dist = ((p1[0] - p2[0])**2 + (p1[1] - p2[1])**2)**0.5
                    if dist < threshold:
                        return True
            return False

        def compute_topology_graph(bboxes, lines, width, height):
            nodes = []
            for box in bboxes:
                unique_id = box["id"]
                tag_label = box.get("tag") or box["id"]
                label_lower = box["label"].lower()
                node_type = "other"
                if "sensor" in label_lower or "indicator" in label_lower or "instrument" in label_lower:
                    node_type = "sensor"
                elif "valve" in label_lower:
                    node_type = "valve"
                elif "pump" in label_lower:
                    node_type = "pump"
                elif "tank" in label_lower:
                    node_type = "tank"
                elif "filter" in label_lower:
                    node_type = "filter"
                elif "exchanger" in label_lower:
                    node_type = "heatexchanger"
                elif "mixer" in label_lower:
                    node_type = "mixer"
                    
                nodes.append({
                    "id": unique_id,
                    "label": f"[{tag_label}]",
                    "type": node_type,
                    "status": "green",
                    "properties": {
                        "id": unique_id,
                        "tag": box.get("tag", ""),
                        "type": node_type.capitalize(),
                        "confidence": box["confidence"]
                    },
                    "px1": box["x"] * width,
                    "py1": box["y"] * height,
                    "px2": (box["x"] + box["w"]) * width,
                    "py2": (box["y"] + box["h"]) * height
                })

            edges = []
            try:
                from app.services.agent_topology.annotated_tile_generator import generate_annotated_image, slice_into_tiles
                from app.services.agent_topology.vision_agent import run_vision_agent_pipeline
                from app.models.image_details import ImageDetails

                image_details = ImageDetails(format="jpg", width=width, height=height)
                
                annotated_full = generate_annotated_image(
                    img_bytes, 
                    symbols_list, 
                    detected_lines, 
                    image_details
                )
                
                tiles = slice_into_tiles(annotated_full, tile_size=2048, overlap=300)
                
                raw_connections = run_vision_agent_pipeline(
                    img_bytes,
                    symbols_list,
                    detected_lines,
                    image_details,
                    tiles,
                    annotated_full
                )
                
                sym_id_to_box_id = {}
                for idx, sym in enumerate(symbols_list):
                    sym_id_to_box_id[sym.id] = bboxes[idx]["id"]
                    
                edges_set = set()
                for conn in raw_connections:
                    from_sym_id = conn.get("from_id")
                    to_sym_id = conn.get("to_id")
                    if from_sym_id in sym_id_to_box_id and to_sym_id in sym_id_to_box_id:
                        src_id = sym_id_to_box_id[from_sym_id]
                        tgt_id = sym_id_to_box_id[to_sym_id]
                        edge_key = (min(src_id, tgt_id), max(src_id, tgt_id))
                        if edge_key not in edges_set:
                            edges_set.add(edge_key)
                            edges.append({
                                "source": src_id,
                                "target": tgt_id,
                                "label": "pipe"
                            })
            except Exception as ve:
                print(f"Gemini VLM topology construction failed: {ve}. Falling back to geometric line-tracing.", file=sys.stderr)
                
            if not edges:
                # Lines are normalized (0-1); denormalize to pixel space for comparison
                def denorm_line(l):
                    return {
                        'startX': l['startX'] * width,
                        'startY': l['startY'] * height,
                        'endX': l['endX'] * width,
                        'endY': l['endY'] * height
                    }

                pixel_lines = [denorm_line(l) for l in lines]

                # Build a graph of direct line-to-node connections
                # For each line segment, find which nodes its endpoints touch
                line_node_map = {}  # line_idx -> set of touching node ids
                proximity_threshold = 50

                for idx, line in enumerate(pixel_lines):
                    touching = set()
                    pts = [(line['startX'], line['startY']), (line['endX'], line['endY'])]
                    for node in nodes:
                        for pt in pts:
                            dist = point_to_box_dist(pt[0], pt[1], node["px1"], node["py1"], node["px2"], node["py2"])
                            if dist < proximity_threshold:
                                touching.add(node["id"])
                                break
                    line_node_map[idx] = touching

                # Union-find to group connected line segments
                num_lines = len(pixel_lines)
                parent = list(range(num_lines))

                def find(i):
                    while parent[i] != i:
                        parent[i] = parent[parent[i]]
                        i = parent[i]
                    return i

                def union(i, j):
                    ri, rj = find(i), find(j)
                    if ri != rj:
                        parent[ri] = rj

                for i in range(num_lines):
                    for j in range(i + 1, num_lines):
                        if lines_close(pixel_lines[i], pixel_lines[j], threshold=40):
                            union(i, j)

                # Group lines into connected components
                components = {}
                for i in range(num_lines):
                    root = find(i)
                    if root not in components:
                        components[root] = []
                    components[root].append(i)

                # For each component, only create edges between nodes that are
                # ADJACENT — i.e. reachable through a chain of line segments
                # without passing through another node in between.
                edges_set = set()
                for root, line_indices in components.items():
                    # Collect all nodes touched by this pipe path
                    all_nodes_in_path = set()
                    for idx in line_indices:
                        all_nodes_in_path.update(line_node_map[idx])

                    if len(all_nodes_in_path) < 2:
                        continue

                    # Build adjacency: two nodes are adjacent if there exists
                    # a chain of line segments connecting them with no other
                    # symbol node in between.
                    # Simple approach: build a node-to-node graph from individual
                    # line segments that touch exactly 2 nodes.
                    for idx in line_indices:
                        touching = line_node_map[idx]
                        if len(touching) == 2:
                            pair = list(touching)
                            u, v = pair[0], pair[1]
                            edge_key = (min(u, v), max(u, v))
                            if edge_key not in edges_set:
                                edges_set.add(edge_key)
                                edges.append({
                                    "source": u,
                                    "target": v,
                                    "label": "pipe"
                                })

                    # Also handle chains: lines that only touch 1 node at one end
                    # propagate along the chain to find the next node
                    if len(edges_set) < len(all_nodes_in_path) - 1:
                        # Build line adjacency graph
                        from collections import defaultdict, deque
                        line_adj = defaultdict(set)
                        for i_idx in range(len(line_indices)):
                            for j_idx in range(i_idx + 1, len(line_indices)):
                                li, lj = line_indices[i_idx], line_indices[j_idx]
                                if lines_close(pixel_lines[li], pixel_lines[lj], threshold=40):
                                    line_adj[li].add(lj)
                                    line_adj[lj].add(li)

                        # BFS from each node-touching line to find nearest other node
                        node_lines = defaultdict(set)  # node_id -> set of line indices
                        for idx in line_indices:
                            for nid in line_node_map[idx]:
                                node_lines[nid].add(idx)

                        for src_node in all_nodes_in_path:
                            visited_lines = set()
                            queue = deque()
                            for start_line in node_lines[src_node]:
                                queue.append(start_line)
                                visited_lines.add(start_line)

                            while queue:
                                cur_line = queue.popleft()
                                # Check if this line touches another node
                                for nid in line_node_map[cur_line]:
                                    if nid != src_node:
                                        edge_key = (min(src_node, nid), max(src_node, nid))
                                        if edge_key not in edges_set:
                                            edges_set.add(edge_key)
                                            edges.append({
                                                "source": src_node,
                                                "target": nid,
                                                "label": "pipe"
                                            })
                                        # Don't continue past this node (it's a stop)
                                        continue

                                for neighbor_line in line_adj[cur_line]:
                                    if neighbor_line not in visited_lines:
                                        visited_lines.add(neighbor_line)
                                        queue.append(neighbor_line)
                                    
            out_nodes = []
            for node in nodes:
                node_copy = {k: v for k, v in node.items() if k not in ["px1", "py1", "px2", "py2"]}
                out_nodes.append(node_copy)
                
            return {"nodes": out_nodes, "edges": edges}

        update_progress(99, "Finalizing topology graph...")
        topology = compute_topology_graph(bboxes, lines_output, width, height)
        update_progress(100, "Done")
        
        print(json.dumps({
            "width": width,
            "height": height,
            "bboxes": bboxes,
            "lines": lines_output,
            "topology": topology
        }))
        
    except Exception as e:
        import traceback
        print(json.dumps({"error": traceback.format_exc()}))

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Missing arguments"}))
    else:
        run_inference(sys.argv[1], sys.argv[2])
