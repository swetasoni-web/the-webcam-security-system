import os
import time
import logging
import numpy as np
import torch
from typing import List, Dict, Any, Optional
from pathlib import Path
from ultralytics import YOLO
from app.config import settings, BASE_DIR, WORKSPACE_DIR

logger = logging.getLogger(__name__)

# Configure PyTorch CPU thread count to 2 (prevents thread contention/thrashing on cloud containers)
try:
    torch.set_num_threads(2)
    torch.set_num_interop_threads(1)
except Exception:
    pass

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

    def __init__(self, model_name: str = "yolov8n.pt", confidence_threshold: float = 0.25):
        self.model_name = model_name
        self.confidence_threshold = confidence_threshold
        self.model: Optional[YOLO] = None
        self.is_loaded = False
        self.load_error: Optional[str] = None
        self.last_inference_time_ms = 0.0
        self.target_class_ids = list(self.SUPPORTED_CLASSES.keys())

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
            try:
                self.model = YOLO(model_target)
            except Exception as load_err:
                logger.warning(f"Failed loading from {model_target}: {load_err}. Falling back to '{self.model_name}'")
                self.model = YOLO(self.model_name)

            # Fuse layers if supported to speed up forward pass
            try:
                if hasattr(self.model, "fuse"):
                    self.model.fuse()
                elif hasattr(self.model, "model") and hasattr(self.model.model, "fuse"):
                    self.model.model.fuse()
            except Exception:
                pass

            # Warm up model weights on lightweight input
            dummy = np.zeros((240, 320, 3), dtype=np.uint8)
            with torch.inference_mode():
                self.model(
                    dummy,
                    conf=self.confidence_threshold,
                    imgsz=320,
                    verbose=False,
                    device="cpu",
                    classes=self.target_class_ids
                )

            self.is_loaded = True
            self.load_error = None
            logger.info(f"YOLO detector successfully loaded and warmed up from: {model_target}")
        except Exception as e:
            self.is_loaded = False
            self.load_error = str(e)
            logger.error(f"Failed to load YOLO model: {e}")

    def detect(self, frame: np.ndarray, conf_override: Optional[float] = None) -> List[Dict[str, Any]]:
        """
        Perform high-speed object detection on a BGR image frame.
        Uses torch.inference_mode() and filtered class NMS for minimal latency.
        """
        if not self.is_loaded or self.model is None or frame is None or frame.size == 0:
            return []

        conf = conf_override if conf_override is not None else self.confidence_threshold
        start_time = time.time()
        detections: List[Dict[str, Any]] = []

        try:
            with torch.inference_mode():
                results = self.model(
                    frame,
                    conf=conf,
                    imgsz=320,
                    verbose=False,
                    device="cpu",
                    classes=self.target_class_ids
                )

            for result in results:
                boxes = result.boxes
                if boxes is None or len(boxes) == 0:
                    continue

                # Fast vectorized extraction of bounding boxes and confidences
                cls_list = boxes.cls.int().tolist()
                conf_list = boxes.conf.tolist()
                xyxy_list = boxes.xyxy.int().tolist()

                for cls_id, score, xyxy in zip(cls_list, conf_list, xyxy_list):
                    cls_name = self.SUPPORTED_CLASSES.get(cls_id, result.names.get(cls_id, f"class_{cls_id}"))
                    detections.append({
                        "class_name": cls_name,
                        "class_id": cls_id,
                        "confidence": round(score, 3),
                        "bbox": xyxy,
                    })

            self.last_inference_time_ms = round((time.time() - start_time) * 1000, 1)
        except Exception as e:
            logger.error(f"Inference error in YOLO detector: {e}")

        return detections
