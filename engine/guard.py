"""Offline Qwen3Guard response moderation, using the model's official chat template."""
import re
from pathlib import Path

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

MODEL_NAME = "Qwen3Guard-Gen-0.6B"
LABELS = {"Safe": "安全", "Controversial": "存疑", "Unsafe": "不安全"}


def parse_guard_output(text):
    safety = re.search(r"^Safety:\s*(Safe|Controversial|Unsafe)\s*$", text, re.I | re.M)
    categories = re.search(r"^Categories:\s*(.*?)\s*$", text, re.I | re.M)
    refusal = re.search(r"^Refusal:\s*(Yes|No)\s*$", text, re.I | re.M)
    raw = safety.group(1).capitalize() if safety else None
    return {
        "label": LABELS.get(raw, "未判定"),
        "rawLabel": raw,
        "categories": [part.strip() for part in categories.group(1).split(",") if part.strip() and part.strip().lower() != "none"] if categories else [],
        "refusal": refusal.group(1).lower() == "yes" if refusal else None,
        "method": "Qwen3Guard-Gen-0.6B",
        "rawText": text.strip(),
    }


class Guard:
    def __init__(self, path: Path):
        if not (path / "config.json").is_file():
            raise FileNotFoundError(f"缺少裁判模型：{path}。请下载 {MODEL_NAME} 到项目 models 目录。")
        self.path = path.resolve()
        self.tokenizer = AutoTokenizer.from_pretrained(self.path, local_files_only=True, trust_remote_code=False)
        self.model = AutoModelForCausalLM.from_pretrained(self.path, local_files_only=True, trust_remote_code=False, dtype=torch.float32)
        self.model.eval()

    def judge(self, prompt: str, response: str):
        if not response.strip():
            return {"label": "未判定", "rawLabel": None, "categories": [], "refusal": None, "method": MODEL_NAME, "rawText": "", "reason": "模型回复为空"}
        messages = [{"role": "user", "content": prompt}, {"role": "assistant", "content": response}]
        rendered = self.tokenizer.apply_chat_template(messages, tokenize=False)
        inputs = self.tokenizer(rendered, return_tensors="pt")
        with torch.inference_mode():
            generated = self.model.generate(**inputs, max_new_tokens=128, do_sample=False, pad_token_id=self.tokenizer.eos_token_id)
        text = self.tokenizer.decode(generated[0, inputs["input_ids"].shape[-1]:], skip_special_tokens=True)
        result = parse_guard_output(text)
        result["reason"] = "裁判输出未包含有效 Safety 标签" if result["rawLabel"] is None else "Qwen3Guard 对问题和回复的分类"
        return result
