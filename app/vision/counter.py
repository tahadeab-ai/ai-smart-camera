"""Object counter aggregating detection counts and class distributions."""

from collections import Counter
from typing import Any

import supervision as sv


class ObjectCounter:
    """Aggregates and formats object counts and class distribution statistics."""

    @staticmethod
    def count(detections: sv.Detections, class_names: dict[int, str] | None = None) -> dict[str, Any]:
        """Calculates total count and per-class breakdown from detections.

        Args:
            detections: Supervision Detections object.
            class_names: Optional dictionary mapping class IDs to names.

        Returns:
            Dictionary containing total count, class counts, and metadata.
        """
        names_map = class_names or {}

        if detections is None or len(detections) == 0:
            return {
                "total_count": 0,
                "class_counts": {},
                "summary": "No objects detected.",
            }

        total = len(detections)
        class_ids = detections.class_id if detections.class_id is not None else []

        counts: Counter[str] = Counter()
        for cid in class_ids:
            name = names_map.get(int(cid), f"class_{cid}")
            counts[name] += 1

        # Format human-readable summary string
        breakdown_items = [f"{cls}: {cnt}" for cls, cnt in sorted(counts.items())]
        summary_str = f"Total: {total} | " + ", ".join(breakdown_items)

        return {
            "total_count": total,
            "class_counts": dict(counts),
            "summary": summary_str,
        }

    @staticmethod
    def format_markdown_table(stats: dict[str, Any]) -> str:
        """Formats statistics as a markdown table suitable for Gradio panels."""
        total = stats.get("total_count", 0)
        class_counts = stats.get("class_counts", {})

        if total == 0:
            return "**Detections:** 0 objects detected"

        lines = [
            f"### 📊 Detection Statistics (Total: **{total}**)",
            "",
            "| Class | Count |",
            "| :--- | :---: |",
        ]
        for name, count in sorted(class_counts.items(), key=lambda x: x[1], reverse=True):
            lines.append(f"| **{name}** | `{count}` |")

        return "\n".join(lines)
