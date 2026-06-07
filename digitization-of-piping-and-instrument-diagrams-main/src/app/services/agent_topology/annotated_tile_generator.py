import cv2
import numpy as np
import os
import copy
from typing import List, Tuple
from app.models.text_detection.symbol_and_text_associated import SymbolAndTextAssociated
from app.models.line_detection.line_segment import LineSegment
from app.models.image_details import ImageDetails

def generate_annotated_image(
    image_bytes: bytes,
    symbols: List[SymbolAndTextAssociated],
    lines: List[LineSegment],
    image_details: ImageDetails
) -> np.ndarray:
    """
    Draws pipelines and symbol boxes with clear IDs and tags on the image for VLM consumption.
    """
    # Decode image
    image = cv2.imdecode(np.frombuffer(image_bytes, np.uint8), cv2.IMREAD_COLOR)
    h, w = image.shape[:2]

    # 1. Draw all lines in bright Blue
    for line in lines:
        x1 = int(line.startX * w)
        y1 = int(line.startY * h)
        x2 = int(line.endX * w)
        y2 = int(line.endY * h)
        cv2.line(image, (x1, y1), (x2, y2), (255, 0, 0), 2)

    # 2. Draw all symbols in bright Red/Orange with clear ID/Tag labels
    for s in symbols:
        x1 = int(s.topX * w)
        y1 = int(s.topY * h)
        x2 = int(s.bottomX * w)
        y2 = int(s.bottomY * h)

        # Draw bounding box
        cv2.rectangle(image, (x1, y1), (x2, y2), (0, 0, 255), 2)

        # Build label: e.g., "ID:12 (Gate Valve)" or "ID:12 [TAG:UV-924]"
        tag = s.text_associated if s.text_associated else "No Tag"
        short_label = s.label.split('/')[-1] if '/' in s.label else s.label
        label_text = f"#{s.id} {short_label} [{tag}]"

        # Background rectangle for the text to ensure high contrast and readability for the VLM
        font = cv2.FONT_HERSHEY_SIMPLEX
        font_scale = 0.5
        thickness = 1
        text_size, baseline = cv2.getTextSize(label_text, font, font_scale, thickness)
        
        # Position label just above the bounding box
        text_x = x1
        text_y = max(y1 - 5, text_size[1] + 5)
        
        cv2.rectangle(
            image, 
            (text_x, text_y - text_size[1] - baseline), 
            (text_x + text_size[0], text_y + baseline), 
            (0, 0, 0), 
            -1
        )
        cv2.putText(
            image, 
            label_text, 
            (text_x, text_y), 
            font, 
            font_scale, 
            (255, 255, 255), 
            thickness, 
            cv2.LINE_AA
        )

    return image

def slice_into_tiles(
    annotated_image: np.ndarray,
    tile_size: int = 1024,
    overlap: int = 150
) -> List[Tuple[np.ndarray, int, int, int, int]]:
    """
    Slices the annotated image into overlapping tiles.
    Returns a list of tuples: (tile_image, start_x, start_y, end_x, end_y)
    """
    h, w = annotated_image.shape[:2]
    tiles = []
    
    y_starts = []
    y = 0
    while y < h:
        y_starts.append(y)
        if y + tile_size >= h:
            break
        y += tile_size - overlap
    
    x_starts = []
    x = 0
    while x < w:
        x_starts.append(x)
        if x + tile_size >= w:
            break
        x += tile_size - overlap

    for ys in y_starts:
        for xs in x_starts:
            ye = min(ys + tile_size, h)
            xe = min(xs + tile_size, w)
            
            # If the tile is smaller than tile_size at the edges, we can adjust start points
            # to make sure we keep constant tile sizes (optional, but good for VLM consistency)
            tile_ys = ys
            tile_xs = xs
            if ye - ys < tile_size and h >= tile_size:
                tile_ys = h - tile_size
            if xe - xs < tile_size and w >= tile_size:
                tile_xs = w - tile_size
                
            tile = annotated_image[tile_ys:ye, tile_xs:xe]
            tiles.append((tile, tile_xs, tile_ys, xe, ye))
            
    return tiles

def save_tiles_to_disk(
    tiles: List[Tuple[np.ndarray, int, int, int, int]],
    output_dir: str
) -> List[str]:
    """
    Saves tiles to the specified output directory and returns their file paths.
    """
    os.makedirs(output_dir, exist_ok=True)
    paths = []
    for idx, (tile, x1, y1, x2, y2) in enumerate(tiles):
        tile_filename = f"tile_{idx}_x{x1}_y{y1}.jpg"
        tile_path = os.path.join(output_dir, tile_filename)
        cv2.imwrite(tile_path, tile, [int(cv2.IMWRITE_JPEG_QUALITY), 95])
        paths.append(tile_path)
    return paths
