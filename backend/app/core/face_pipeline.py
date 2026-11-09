import os
import cv2
import json
import logging
import numpy as np
import torch
import torchvision.models as models
import torchvision.transforms as transforms
from PIL import Image
from typing import List, Dict, Any, Optional, Tuple
from app.config import settings

logger = logging.getLogger(__name__)

class FaceRecognitionPipeline:
    """
    Robust Face Detection & 512-dimensional Embedding Recognition Pipeline.
    Uses OpenCV face detection paired with deep convolutional feature representation (512-dim L2-normalized)
    and vectorized cosine similarity matching against enrolled identity databases.
    """

    def __init__(self, match_threshold: float = 0.60):
        self.match_threshold = match_threshold
        self.face_cascade = None
        self.feature_extractor = None
        self.transform = None
        self.is_loaded = False
        self.load_error: Optional[str] = None
        
        self._initialize_pipeline()

    def _initialize_pipeline(self) -> None:
        """Initialize face detector and 512-d feature extractor model on CPU."""
        try:
            # 1. OpenCV Frontal Face Haar Cascade (Safe Resolution across Linux / Windows)
            self.face_cascade = None
            cascade_path = None
            if hasattr(cv2, "data") and hasattr(cv2.data, "haarcascades"):
                cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"

            classifier_cls = getattr(cv2, "CascadeClassifier", None)
            if classifier_cls is None:
                try:
                    import cv2.objdetect
                    classifier_cls = getattr(cv2.objdetect, "CascadeClassifier", None)
                except Exception:
                    pass

            if classifier_cls and cascade_path and os.path.exists(cascade_path):
                try:
                    cascade = classifier_cls(cascade_path)
                    if not cascade.empty():
                        self.face_cascade = cascade
                except Exception as ce:
                    logger.warning(f"Could not initialize CascadeClassifier: {ce}")

            # 2. ResNet-18 512-dimensional Feature Extractor (Offline & Fast)
            try:
                backbone = models.resnet18(weights=models.ResNet18_Weights.DEFAULT)
            except Exception:
                # Fallback to offline architecture (no network download required)
                backbone = models.resnet18(weights=None)
            
            # Remove the final classification layer, retaining the 512-d pooling output
            self.feature_extractor = torch.nn.Sequential(*(list(backbone.children())[:-1]))
            self.feature_extractor.eval()

            # Image preprocessing pipeline for face crops
            self.transform = transforms.Compose([
                transforms.Resize((160, 160)),
                transforms.ToTensor(),
                transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
            ])

            self.is_loaded = True
            self.load_error = None
            logger.info("Face recognition pipeline successfully initialized.")
        except Exception as e:
            self.is_loaded = False
            self.load_error = str(e)
            logger.error(f"Failed to initialize Face Pipeline: {e}")

    def detect_faces(self, frame: np.ndarray) -> List[List[int]]:
        """
        Detect face bounding boxes in a BGR frame.
        Returns list of [x1, y1, x2, y2].
        """
        if not self.is_loaded or self.face_cascade is None or frame is None:
            return []

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray = cv2.equalizeHist(gray)

        # Scale factor 1.1, minNeighbors 4, minSize 24x24
        faces = self.face_cascade.detectMultiScale(
            gray,
            scaleFactor=1.1,
            minNeighbors=4,
            minSize=(24, 24),
            flags=cv2.CASCADE_SCALE_IMAGE
        )

        boxes = []
        for (x, y, w, h) in faces:
            boxes.append([int(x), int(y), int(x + w), int(y + h)])
        return boxes

    def compute_embedding(self, face_bgr: np.ndarray) -> Optional[np.ndarray]:
        """
        Extract a 512-dimensional L2-normalized embedding vector from a cropped face image.
        """
        if not self.is_loaded or self.feature_extractor is None or face_bgr is None:
            return None

        if face_bgr.shape[0] < 10 or face_bgr.shape[1] < 10:
            return None

        try:
            # Convert BGR to RGB PIL Image
            face_rgb = cv2.cvtColor(face_bgr, cv2.COLOR_BGR2RGB)
            pil_img = Image.fromarray(face_rgb)
            tensor = self.transform(pil_img).unsqueeze(0)  # Shape: (1, 3, 160, 160)

            with torch.no_grad():
                feat = self.feature_extractor(tensor)  # Shape: (1, 512, 1, 1)
                feat = torch.flatten(feat, 1)          # Shape: (1, 512)
                # L2 normalize
                norm_feat = torch.nn.functional.normalize(feat, p=2, dim=1)
                embedding = norm_feat.squeeze(0).numpy()

            return embedding
        except Exception as e:
            logger.error(f"Error computing face embedding: {e}")
            return None

    def match_face(self, query_embedding: np.ndarray, enrolled_faces: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Match a query embedding against a list of enrolled faces with cosine similarity.
        Each enrolled dict must contain: 'name', 'identity_code', 'embedding' (512-d list or array).
        """
        if query_embedding is None or not enrolled_faces:
            return {
                "is_known": False,
                "name": "Unknown",
                "identity_code": None,
                "confidence": 0.0,
            }

        best_score = -1.0
        best_match = None

        q_norm = query_embedding / np.linalg.norm(query_embedding)

        for enrolled in enrolled_faces:
            emb = enrolled.get("embedding")
            if emb is None:
                continue
            
            if isinstance(emb, str):
                emb = json.loads(emb)
            emb = np.array(emb, dtype=np.float32)

            # Cosine similarity
            e_norm = emb / (np.linalg.norm(emb) + 1e-9)
            score = float(np.dot(q_norm, e_norm))

            if score > best_score:
                best_score = score
                best_match = enrolled

        confidence = round(max(0.0, min(1.0, (best_score + 1.0) / 2.0)), 3)
        if best_score >= self.match_threshold and best_match is not None:
            return {
                "is_known": True,
                "name": best_match["name"],
                "identity_code": best_match.get("identity_code"),
                "confidence": confidence,
            }
        else:
            return {
                "is_known": False,
                "name": "Unknown",
                "identity_code": None,
                "confidence": confidence,
            }

    def process_frame(self, frame: np.ndarray, enrolled_faces: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Full frame face detection and recognition pass.
        Returns list of detected faces with bounding box, recognized identity, and confidence.
        """
        results = []
        boxes = self.detect_faces(frame)
        h, w = frame.shape[:2]

        for bbox in boxes:
            x1, y1, x2, y2 = bbox
            # Safe clamping
            x1, y1 = max(0, x1), max(0, y1)
            x2, y2 = min(w, x2), min(h, y2)

            if (x2 - x1) < 15 or (y2 - y1) < 15:
                continue

            face_crop = frame[y1:y2, x1:x2]
            emb = self.compute_embedding(face_crop)
            
            match_res = self.match_face(emb, enrolled_faces)
            results.append({
                "bbox": [x1, y1, x2, y2],
                "is_known": match_res["is_known"],
                "name": match_res["name"],
                "identity_code": match_res["identity_code"],
                "confidence": match_res["confidence"],
            })

        return results
