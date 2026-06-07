# Copyright (c) Microsoft Corporation.
# Licensed under the MIT license.
import easyocr
import numpy as np
import cv2
import io
from PIL import Image
from app.config import config

class OcrClient(object):
    '''
    Client for reading text from an image using EasyOCR (Local replacement for Azure).
    '''
    def __init__(self):
        # Initialize EasyOCR Reader with English (CPU only for maximum stability on Windows)
        print("Initializing Local EasyOCR Reader (CPU mode)...")
        self.reader = easyocr.Reader(['en'], gpu=False)

    def read_text(self, image_stream):
        '''
        Reads text from an image and returns a generator of tuples containing the text and bounding box.
        :param image_stream: Image stream to read in the form of bytes.
        '''
        # Convert stream to numpy array for EasyOCR
        image_bytes = image_stream.read()
        image_np = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(image_np, cv2.IMREAD_COLOR)
        if img is None:
            return
            
        orig_h, orig_w = img.shape[:2]
        max_dim = 2500
        scale = 1.0
        if max(orig_h, orig_w) > max_dim:
            scale = max_dim / max(orig_h, orig_w)
            img = cv2.resize(img, (0, 0), fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        
        # EasyOCR returns [([[x,y],[x,y],[x,y],[x,y]], text, confidence), ...]
        results = self.reader.readtext(img)
        
        for (bbox, text, prob) in results:
            if scale != 1.0:
                # Scale coordinates back to original size
                scaled_bbox = []
                for pt in bbox:
                    scaled_bbox.append([pt[0] / scale, pt[1] / scale])
                yield (text, scaled_bbox)
            else:
                yield (text, bbox)

# Initialize OCR client
ocr_client = OcrClient()
