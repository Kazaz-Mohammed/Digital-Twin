import sys
import os
import cv2
import numpy as np

try:
    import fitz
except ImportError:
    print("PyMuPDF is not installed. Please run: pip install PyMuPDF")
    sys.exit(1)

# Import necessary modules from the app
from app.services.line_detection.utils.line_detection_image_preprocessor import LineDetectionImagePreprocessor
from app.services.line_detection.line_segments_service import detect_line_segments

def main():
    # The P&ID image we tested YOLO on
    image_dir = r"C:\Users\Asus\Desktop\pid extraction\MLOpsManufacturing-main\samples\amlv2_pid_symbol_detection_train\src\app\dataset\val\images"
    import glob
    test_images = glob.glob(os.path.join(image_dir, '*.jpg'))
    if not test_images:
        print("Could not find validation images.")
        return
        
    image_path = test_images[0]
    print(f"Loading P&ID image: {image_path}...")
    
    # Read image using OpenCV directly (no PDF conversion needed!)
    image_bgr = cv2.imread(image_path)
    
    # We need the raw bytes to pass to the preprocessor function
    with open(image_path, "rb") as f:
        img_bytes = f.read()
    
    # Read image using OpenCV
    image_bgr = cv2.imdecode(np.frombuffer(img_bytes, np.uint8), cv2.IMREAD_COLOR)
    image_height, image_width = image_bgr.shape[:2]

    print("Preprocessing image (grayscale & binarization)...")
    # Preprocess image (we pass empty lists for bounding boxes since we just want to test raw line detection)
    preprocessed_image = LineDetectionImagePreprocessor.preprocess(
        img_bytes,
        symbol_bounding_boxes=[],
        text_bounding_boxes=[]
    )

    print("Applying thinning (skeletonization)...")
    thinned_image = LineDetectionImagePreprocessor.apply_thinning(preprocessed_image)

    print("Detecting lines using Hough Transform...")
    # These are the default config values from config.py
    lines = detect_line_segments(
        pid_id="test",
        preprocessed_image=thinned_image,
        image_height=image_height,
        image_width=image_width,
        max_line_gap=10,        # Connect small gaps
        threshold=5,
        min_line_length=10,
        rho=0.1,
        theta_param=1080.0,
        bounding_box_inclusive=None
    )

    print(f"Detected {len(lines)} line segments!")

    print("Drawing lines on image...")
    # Draw lines on original image
    output_image = image_bgr.copy()
    for line in lines:
        # The coordinates returned are normalized (0 to 1), so we multiply by width/height
        startX = int(line.startX * image_width)
        startY = int(line.startY * image_height)
        endX = int(line.endX * image_width)
        endY = int(line.endY * image_height)
        
        # Draw the detected line in thick RED so it is easily visible
        cv2.line(output_image, (startX, startY), (endX, endY), (0, 0, 255), 4)

    output_path = r"C:\Users\Asus\Desktop\pid extraction\line_detection_result.jpg"
    cv2.imwrite(output_path, output_image)
    print(f"Success! Result saved to: {output_path}")

if __name__ == "__main__":
    main()
