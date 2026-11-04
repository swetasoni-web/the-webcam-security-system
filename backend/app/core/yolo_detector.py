import os
import time
import logging
import numpy as np
from typing import List, Dict, Any, Optional
from pathlib import Path
from ultralytics import YOLO
from app.config import settings, BASE_DIR, WORKSPACE_DIR

logger = logging.getLogger(__name__)

class YOLODetector:
    """
    Ultralytics YOLO object detector optimized for CPU real-time surveillance.
    Detects relevant surveillance classes with confidence filtering.
    """

    SUPPORTED_CLASSES = {
        0: "person",
        1: "bicycle",
        2: "car",
        3: "motorcycle",
        5: "bus",
        7: "truck",
        24: "backpack",
        25: "umbrella",
        26: "handbag",
        28: "suitcase",
        39: "bottle",
        63: "laptop",
        67: "cell phone",
    }

    def __init__(self, model_name: str = "yolov8n.pt", confidence_threshold: float = 0.40):
        self.model_name = model_name
        self.confidence_threshold = confidence_threshold
        self.model: Optional[YOLO] = None
        self.is_loaded = False
        self.load_error: Optional[str] = None
        self.last_inference_time_ms = 0.0

        self._initialize_model()

    def _initialize_model(self) -> None:
        """Load YOLO model on CPU with fallback error reporting."""
        try:
            # Check candidate local paths to reuse already downloaded weights
            candidates = [
                settings.MODELS_DIR / self.model_name,
                BASE_DIR / self.model_name,
                WORKSPACE_DIR / self.model_name,
                Path(self.model_name),
                Path(f"backend/{self.model_name}"),
            ]
            chosen_path = None
            for p in candidates:
                if p.exists() and p.is_file():
                    chosen_path = str(p.resolve())
                    break

            model_target = chosen_path if chosen_path else self.model_name
            self.model = YOLO(model_target)
            # Run a dummy inference pass on zeros to warm up weights
            dummy = np.zeros((320, 320, 3), dtype=np.uint8)
            self.model(dummy, verbose=False, device="cpu")
            self.is_loaded = True
            self.load_error = None
            logger.info(f"YOLO detector successfully loaded from: {model_target}")
        except Exception as e:
            self.is_loaded = False
            self.load_error = str(e)
            logger.error(f"Failed to load YOLO model: {e}")

    def detect(self, frame: np.ndarray, conf_override: Optional[float] = None) -> List[Dict[str, Any]]:
        """
        Perform object detection on a BGR image frame.
        Returns a list of detected objects with class name, confidence, and [x1, y1, x2, y2] bbox.
        """
        if not self.is_loaded or self.model is None or frame is None:
            return []

        conf = conf_override if conf_override is not None else self.confidence_threshold
        start_time = time.time()
        detections: List[Dict[str, Any]] = []

        try:
            # Perform inference on CPU
            results = self.model(frame, conf=conf, verbose=False, device="cpu")
            
            for result in results:
                boxes = result.boxes
                if boxes is None:
                    continue

                for box in boxes:
                    cls_id = int(box.cls[0].item())
                    score = float(box.conf[0].item())
                    xyxy = box.xyxy[0].tolist()
                    x1, y1, x2, y2 = [int(v) for v in xyxy]

                    # Map class name (fallback to model's class dictionary if not in custom list)
                    cls_name = self.SUPPORTED_CLASSES.get(cls_id, result.names.get(cls_id, f"class_{cls_id}"))

                    detections.append({
                        "class_name": cls_name,
                        "class_id": cls_id,
                        "confidence": round(score, 3),
                        "bbox": [x1, y1, x2, y2],
                    })

            self.last_inference_time_ms = round((time.time() - start_time) * 1000, 1)
        except Exception as e:
            logger.error(f"Inference error in YOLO detector: {e}")

        return detections
