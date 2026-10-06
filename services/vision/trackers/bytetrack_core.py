"""ByteTrack core (class-aware) — clean-room implementation of the BYTE association algorithm.

Algorithm reference: Zhang et al., "ByteTrack: Multi-Object Tracking by Associating Every
Detection Box" (arXiv:2110.06864). Original reference repo is MIT-licensed
(https://github.com/ifzhang/ByteTrack). This module reimplements the association logic
with NumPy only — no GPL/AGPL dependencies.

VisionLayer implementation: project code implementing a published algorithm.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field

import numpy as np

from trackers.config import TrackerConfig


def iou_batch(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """IoU between Nx4 and Mx4 xyxy boxes → N×M."""
    if a.size == 0 or b.size == 0:
        return np.zeros((a.shape[0], b.shape[0]), dtype=np.float32)
    tl = np.maximum(a[:, None, :2], b[None, :, :2])
    br = np.minimum(a[:, None, 2:], b[None, :, 2:])
    wh = np.clip(br - tl, 0, None)
    inter = wh[:, :, 0] * wh[:, :, 1]
    area_a = (a[:, 2] - a[:, 0]) * (a[:, 3] - a[:, 1])
    area_b = (b[:, 2] - b[:, 0]) * (b[:, 3] - b[:, 1])
    union = area_a[:, None] + area_b[None, :] - inter
    return (inter / np.clip(union, 1e-6, None)).astype(np.float32)


def linear_assignment(cost: np.ndarray, thresh: float) -> tuple[list[tuple[int, int]], list[int], list[int]]:
    """Greedy assignment on cost (lower better). Accept match if cost <= thresh."""
    if cost.size == 0:
        return [], list(range(cost.shape[0])), list(range(cost.shape[1]))
    matches: list[tuple[int, int]] = []
    used_r: set[int] = set()
    used_c: set[int] = set()
    flat = [(float(cost[r, c]), r, c) for r in range(cost.shape[0]) for c in range(cost.shape[1])]
    flat.sort()
    for val, r, c in flat:
        if r in used_r or c in used_c:
            continue
        if val > thresh:
            break
        matches.append((r, c))
        used_r.add(r)
        used_c.add(c)
    unmatched_r = [i for i in range(cost.shape[0]) if i not in used_r]
    unmatched_c = [j for j in range(cost.shape[1]) if j not in used_c]
    return matches, unmatched_r, unmatched_c


def xyxy_to_xyah(box: np.ndarray) -> np.ndarray:
    w = float(box[2] - box[0])
    h = float(box[3] - box[1])
    cx = float(box[0] + w / 2.0)
    cy = float(box[1] + h / 2.0)
    a = w / max(h, 1e-6)
    return np.array([cx, cy, a, h], dtype=np.float32)


def xyah_to_xyxy(xyah: np.ndarray) -> np.ndarray:
    cx, cy, a, h = map(float, xyah)
    w = a * h
    return np.array([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], dtype=np.float32)


class KalmanFilterXYAH:
    """Constant-velocity Kalman filter on (cx, cy, aspect, height)."""

    def __init__(self) -> None:
        self._std_weight_pos = 1.0 / 20
        self._std_weight_vel = 1.0 / 160

    def initiate(self, measurement: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        mean = np.asarray([*measurement, 0, 0, 0, 0], dtype=np.float32)
        std = [
            2 * self._std_weight_pos * measurement[3],
            2 * self._std_weight_pos * measurement[3],
            1e-2,
            2 * self._std_weight_pos * measurement[3],
            10 * self._std_weight_vel * measurement[3],
            10 * self._std_weight_vel * measurement[3],
            1e-5,
            10 * self._std_weight_vel * measurement[3],
        ]
        covariance = np.diag(np.square(std)).astype(np.float32)
        return mean, covariance

    def predict(self, mean: np.ndarray, covariance: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        std_pos = [
            self._std_weight_pos * mean[3],
            self._std_weight_pos * mean[3],
            1e-2,
            self._std_weight_pos * mean[3],
        ]
        std_vel = [
            self._std_weight_vel * mean[3],
            self._std_weight_vel * mean[3],
            1e-5,
            self._std_weight_vel * mean[3],
        ]
        motion_cov = np.diag(np.square(np.asarray([*std_pos, *std_vel]))).astype(np.float32)
        mean = mean.copy()
        mean[:4] = mean[:4] + mean[4:]
        covariance = covariance + motion_cov
        return mean, covariance

    def update(
        self, mean: np.ndarray, covariance: np.ndarray, measurement: np.ndarray
    ) -> tuple[np.ndarray, np.ndarray]:
        projected = mean[:4]
        std = [
            self._std_weight_pos * mean[3],
            self._std_weight_pos * mean[3],
            1e-1,
            self._std_weight_pos * mean[3],
        ]
        innovation_cov = np.diag(np.square(std)).astype(np.float32)
        p00 = covariance[:4, :4]
        s = p00 + innovation_cov
        try:
            inv_s = np.linalg.inv(s)
        except np.linalg.LinAlgError:
            inv_s = np.linalg.pinv(s)
        kg = np.zeros((8, 4), dtype=np.float32)
        kg[:4, :] = p00 @ inv_s
        kg[4:, :] = covariance[4:, :4] @ inv_s
        innovation = measurement - projected
        new_mean = mean + kg @ innovation
        new_cov = covariance.copy()
        new_cov[:4, :] = covariance[:4, :] - kg[:4, :] @ covariance[:4, :]
        new_cov[4:, :] = covariance[4:, :] - kg[4:, :] @ covariance[:4, :]
        return new_mean.astype(np.float32), new_cov.astype(np.float32)


@dataclass
class STrack:
    track_id: int
    class_name: str
    mean: np.ndarray
    covariance: np.ndarray
    score: float
    hits: int = 1
    age: int = 1
    time_since_update: int = 0
    state: str = "tracked"  # tracked | lost | removed
    start_frame: int = 0
    frames_seen: int = 1

    @property
    def tlbr(self) -> np.ndarray:
        return xyah_to_xyxy(self.mean[:4])


@dataclass
class TrackStats:
    creations: int = 0
    losses: int = 0
    lifetimes: list[int] = field(default_factory=list)
    unique_ids: set[int] = field(default_factory=set)


class ByteTrackerCore:
    """Per-class ByteTrack association with Kalman prediction."""

    def __init__(
        self,
        config: TrackerConfig,
        *,
        frame_rate: float,
        id_factory: Callable[[], int] | None = None,
    ) -> None:
        self.config = config
        self.frame_rate = max(1.0, float(frame_rate))
        self.buffer_size = max(1, int(self.frame_rate / 30.0 * config.lost_track_buffer))
        self.max_time_lost = self.buffer_size
        self.frame_id = 0
        self._next_id_local = 1
        self._id_factory = id_factory
        self.tracked: list[STrack] = []
        self.lost: list[STrack] = []
        self.kf = KalmanFilterXYAH()
        self.stats = TrackStats()

    def reset(self) -> None:
        self.frame_id = 0
        self._next_id_local = 1
        self.tracked = []
        self.lost = []
        self.stats = TrackStats()

    def _alloc_id(self) -> int:
        if self._id_factory is not None:
            return int(self._id_factory())
        tid = self._next_id_local
        self._next_id_local += 1
        return tid

    def update(
        self, boxes_xyxy: np.ndarray, scores: np.ndarray, class_name: str
    ) -> list[STrack]:
        self.frame_id += 1
        if boxes_xyxy.size == 0:
            boxes_xyxy = np.zeros((0, 4), dtype=np.float32)
            scores = np.zeros((0,), dtype=np.float32)

        high_mask = scores > self.config.track_activation_threshold
        low_mask = (scores > self.config.min_confidence) & (~high_mask)
        dets_high = boxes_xyxy[high_mask]
        scores_high = scores[high_mask]
        dets_low = boxes_xyxy[low_mask]
        scores_low = scores[low_mask]

        # Predict all existing tracks
        for t in self.tracked + self.lost:
            t.mean, t.covariance = self.kf.predict(t.mean, t.covariance)
            t.age += 1

        track_pool = list(self.tracked) + list(self.lost)
        matches_h, u_tr_h, u_det_h = self._associate(track_pool, dets_high, self.config.match_threshold)

        matched_ids: set[int] = set()
        for it, idet in matches_h:
            track = track_pool[it]
            self._apply_detection(track, dets_high[idet], float(scores_high[idet]))
            matched_ids.add(track.track_id)

        # Stage-2: remaining tracked (not lost-only) vs low-score dets
        rem_tracks = [
            track_pool[i]
            for i in u_tr_h
            if track_pool[i].state == "tracked" and track_pool[i].track_id not in matched_ids
        ]
        matches_l, u_tr_l, _u_det_l = self._associate(rem_tracks, dets_low, self.config.match_threshold)
        for it, idet in matches_l:
            track = rem_tracks[it]
            self._apply_detection(track, dets_low[idet], float(scores_low[idet]))
            matched_ids.add(track.track_id)

        # Mark unmatched as lost / bump time_since_update
        for track in track_pool:
            if track.track_id in matched_ids:
                continue
            track.time_since_update += 1
            if track.state == "tracked":
                track.state = "lost"
                self.stats.losses += 1

        # New tracks from unmatched high detections
        for idet in u_det_h:
            mean, cov = self.kf.initiate(xyxy_to_xyah(dets_high[idet]))
            tid = self._alloc_id()
            tr = STrack(
                track_id=tid,
                class_name=class_name,
                mean=mean,
                covariance=cov,
                score=float(scores_high[idet]),
                hits=1,
                age=1,
                time_since_update=0,
                state="tracked",
                start_frame=self.frame_id,
                frames_seen=1,
            )
            self.stats.creations += 1
            self.stats.unique_ids.add(tid)
            track_pool.append(tr)
            matched_ids.add(tid)

        # Partition + expire
        new_tracked: list[STrack] = []
        new_lost: list[STrack] = []
        for track in track_pool:
            if track.state == "removed":
                continue
            if track.time_since_update > self.max_time_lost:
                track.state = "removed"
                self.stats.lifetimes.append(max(1, self.frame_id - track.start_frame + 1))
                continue
            if track.state == "tracked":
                new_tracked.append(track)
                self.stats.unique_ids.add(track.track_id)
            elif track.state == "lost":
                new_lost.append(track)
                self.stats.unique_ids.add(track.track_id)

        self.tracked = new_tracked
        self.lost = new_lost
        return list(self.tracked)

    def _apply_detection(self, track: STrack, box: np.ndarray, score: float) -> None:
        mean, cov = self.kf.update(track.mean, track.covariance, xyxy_to_xyah(box))
        track.mean = mean
        track.covariance = cov
        track.score = score
        track.hits += 1
        track.time_since_update = 0
        track.state = "tracked"
        track.frames_seen += 1

    def _associate(
        self,
        tracks: list[STrack],
        dets: np.ndarray,
        match_thresh: float,
    ) -> tuple[list[tuple[int, int]], list[int], list[int]]:
        if not tracks or dets.size == 0:
            return [], list(range(len(tracks))), list(range(0 if dets.size == 0 else len(dets)))
        track_boxes = np.stack([t.tlbr for t in tracks], axis=0)
        ious = iou_batch(track_boxes, dets)
        # BYTETracker uses iou_distance (= 1 - IoU) with thresh≈0.8 → accept IoU ≥ ~0.2
        cost = 1.0 - ious
        return linear_assignment(cost, float(match_thresh))
