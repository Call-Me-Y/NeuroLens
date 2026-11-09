"""Local name/address NER using the token classifier migrated from the old app."""
import json
import os
import re
import sys
from pathlib import Path

import torch
from transformers import AutoModelForTokenClassification, AutoTokenizer

MODEL_DIR = Path(__file__).resolve().parents[1] / "models" / "chinese-ner-per-addr-rbt3"
TYPES = {"PER": "姓名", "ADDR": "地址"}


class Ner:
    def __init__(self):
        if not (MODEL_DIR / "model.safetensors").is_file():
            raise FileNotFoundError(f"缺少脱敏模型：{MODEL_DIR}")
        torch.set_num_threads(min(4, os.cpu_count() or 1))
        self.tokenizer = AutoTokenizer.from_pretrained(MODEL_DIR, local_files_only=True, use_fast=True)
        self.model = AutoModelForTokenClassification.from_pretrained(MODEL_DIR, local_files_only=True)
        self.model.eval()

    def predict(self, text):
        if not text.strip():
            return []
        encoding = self.tokenizer(
            text, truncation=True, max_length=512, stride=48,
            return_overflowing_tokens=True, return_offsets_mapping=True,
        )
        found = []
        labels = self.model.config.id2label
        for ids, mask, offsets in zip(encoding["input_ids"], encoding["attention_mask"], encoding["offset_mapping"]):
            with torch.inference_mode():
                predictions = self.model(
                    input_ids=torch.tensor([ids]), attention_mask=torch.tensor([mask])
                ).logits.argmax(-1)[0].tolist()
            active = None
            for label_id, (start, end) in zip(predictions, offsets):
                label = labels.get(label_id, labels.get(str(label_id), "O"))
                tag = label.split("-", 1)[-1]
                if start == end or tag not in TYPES:
                    if active:
                        found.append(active)
                        active = None
                    continue
                if label.startswith("B-") or active is None or active["label"] != tag:
                    if active:
                        found.append(active)
                    active = {"label": tag, "start": start, "end": end}
                else:
                    active["end"] = end
            if active:
                found.append(active)
        unique = {(item["start"], item["end"], item["label"]): item for item in found}
        entities = []
        for item in sorted(unique.values(), key=lambda item: (item["start"], item["end"])):
            start, end = item["start"], item["end"]
            if item["label"] == "ADDR":
                while start < end and text[start] in "，。；、,.; \t\r\n":
                    start += 1
                while end > start and text[end - 1] in "，。；、,.; \t\r\n":
                    end -= 1
                if not re.search(r"[\u4e00-\u9fff]", text[start:end]):
                    continue
            if start < end:
                entities.append({"label": item["label"], "start": start, "end": end, "type": TYPES[item["label"]], "text": text[start:end]})
        return entities


def serve():
    model = None
    for line in sys.stdin:
        request = None
        try:
            request = json.loads(line)
            if model is None:
                model = Ner()
            response = {"id": request["id"], "entities": model.predict(request["text"])}
        except Exception as exc:
            response = {"id": request.get("id") if isinstance(request, dict) else None, "error": str(exc)}
        print(json.dumps(response, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    serve()
