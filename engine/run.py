"""Local, offline inference and FFN measurements. Never substitutes demo data."""
import csv
import hashlib
import json
import sys
import time
from pathlib import Path

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from measurements import linear_cka
from guard import Guard, MODEL_NAME


def emit(**data):
    print(json.dumps(data, ensure_ascii=False), flush=True)


def run(config):
    torch.manual_seed(0)
    torch.set_num_threads(4)
    root = Path(__file__).resolve().parents[1]
    model_path = Path(config["modelPath"]).resolve()
    group = config.get("dataset", "benign")
    defaults = {
        "benign": {"path": "data/JBB-Behaviors/benign-behaviors.csv", "promptColumn": "Goal", "categoryColumn": "Category"},
        "harmful": {"path": "data/JBB-Behaviors/harmful-behaviors.csv", "promptColumn": "Goal", "categoryColumn": "Category"},
    }
    sources_config = config.get("datasetSources", {})
    groups = ["benign", "harmful"] if group == "mixed" else [group]
    sources = [root / (sources_config.get("analysisBenign" if g == "benign" else "analysisHarmful") or defaults[g])["path"] for g in groups]
    pools = []
    for g, dataset in zip(groups, sources):
        source_config = sources_config.get("analysisBenign" if g == "benign" else "analysisHarmful") or defaults[g]
        with dataset.open(encoding="utf-8-sig") as handle:
            pools.append([{**r,"group":g,"__prompt":r[source_config["promptColumn"]],"__category":r.get(source_config.get("categoryColumn", ""), "") or "未分类"} for r in csv.DictReader(handle) if r.get(source_config["promptColumn"], "").strip()])
    records = ([r for pair in zip(*pools) for r in pair] if group == "mixed" else pools[0])[:config.get("count", 4)]
    emit(progress=0, message="正在加载本地模型")
    tokenizer = AutoTokenizer.from_pretrained(model_path, local_files_only=True, trust_remote_code=False)
    model = AutoModelForCausalLM.from_pretrained(model_path, local_files_only=True, trust_remote_code=False, dtype=torch.float32)
    model.eval()
    layers = model.model.layers
    index = config.get("layer", 17)
    if not 0 <= index < len(layers):
        raise ValueError(f"分析层超出模型范围：可用 1–{len(layers)} 层")
    down = layers[index].mlp.down_proj
    # Intermediate FFN neurons are COLUMNS of down_proj [hidden, intermediate].
    for parameter in model.parameters():
        parameter.requires_grad_(False)
    downs = [layer.mlp.down_proj for layer in layers]
    for module in downs:
        module.weight.requires_grad_(True)
    activations = []
    rows, hidden, sensitivity = [], [], []
    for i, record in enumerate(records):
        started = time.perf_counter()
        prompt = record["__prompt"]
        text = tokenizer.apply_chat_template([{"role":"user", "content":prompt}], tokenize=False, add_generation_prompt=True)
        inputs = tokenizer(text, return_tensors="pt", truncation=True, max_length=256)
        current_acts = {}
        def capture(k):
            def callback(module, inputs):
                current_acts[k] = inputs[0].detach().float().mean(dim=1).squeeze(0).cpu()
            return callback
        hooks = [module.register_forward_pre_hook(capture(k)) for k,module in enumerate(downs)]
        try:
            with torch.no_grad():
                outputs = model(**inputs, output_hidden_states=True, use_cache=False)
            hidden.append(torch.stack([h[0, -1].float().cpu() for h in outputs.hidden_states[1:]]))
            activations.append(torch.stack([current_acts[k] for k in range(len(layers))]))
        finally:
            for hook in hooks:
                hook.remove()
        with torch.no_grad():
            generated = model.generate(**inputs, max_new_tokens=config.get("tokens", 24), do_sample=False, pad_token_id=tokenizer.eos_token_id)
        labels = generated.clone()
        labels[:, :inputs["input_ids"].shape[1]] = -100
        model.zero_grad(set_to_none=True)
        loss = model(input_ids=generated, attention_mask=torch.ones_like(generated), labels=labels, use_cache=False).loss
        if not torch.isfinite(loss):
            raise ValueError("Non-finite response loss")
        loss.backward()
        scores = torch.stack([(module.weight.detach() * module.weight.grad).sum(dim=0).abs().cpu() for module in downs])
        sensitivity.append(scores)
        output = tokenizer.decode(generated[0, inputs["input_ids"].shape[1]:], skip_special_tokens=True)
        generated_count = generated.shape[1]-inputs["input_ids"].shape[1]
        truncated_output = generated_count >= config.get("tokens", 24) and generated[0, -1].item() != tokenizer.eos_token_id
        rows.append({"id":record["group"]+"-"+str(record.get("Index") or i+1), "group":record["group"], "prompt":prompt, "output":output, "category":record["__category"], "loss":float(loss.detach()), "latency":round((time.perf_counter()-started)*1000), "inputTokens":inputs["input_ids"].shape[1], "generatedTokens":generated_count, "truncatedInput":len(tokenizer.encode(text))>256, "truncatedOutput":truncated_output})
        emit(progress=round((i+1)/len(records)*85), message=f"已完成 {i+1}/{len(records)} 个样本的神经元测量")
    matrix = torch.stack(hidden)  # samples, layers, hidden
    shared = matrix.reshape(-1, matrix.shape[-1])
    shared = shared - shared.mean(dim=0)
    u_shared, s_shared, _ = torch.linalg.svd(shared, full_matrices=False)
    semantic_projection = (u_shared[:, 0] * s_shared[0]).reshape(len(rows), len(layers)).tolist()
    coordinates = []
    for layer in range(len(layers)):
        x = matrix[:,layer] - matrix[:,layer].mean(dim=0)
        u, s, _ = torch.linalg.svd(x, full_matrices=False)
        coordinates.append((u[:,:2]*s[:2]).tolist())
    acts = torch.stack(activations)
    sensitivities = torch.stack(sensitivity)
    measurements = []
    for k,module in enumerate(downs):
        mean_scores = sensitivities[:,k].mean(0)
        top = mean_scores.topk(min(48,len(mean_scores))).indices.tolist()
        weights = module.weight.detach().norm(dim=0).cpu()
        measurements.append({"neurons":[{"id":n,"activation":float(acts[:,k,n].mean()),"sensitivity":float(mean_scores[n]),"weightNorm":float(weights[n])} for n in top],"activations":acts[:,k,top].tolist(),"sensitivities":sensitivities[:,k,top].tolist(),"dominant":acts[:,k].abs().argmax(-1).tolist()})
    # Biased linear CKA on centered sample Gram matrices; undefined with zero variance.
    similarity = linear_cka(matrix)
    emit(progress=86, message="正在加载 Qwen3Guard 裁判模型")
    del model
    guard = Guard(root / "models" / MODEL_NAME)
    for i, row in enumerate(rows):
        automatic = guard.judge(row["prompt"], row["output"])
        row["judgment"] = automatic["label"]
        row["automaticJudgment"] = automatic
        emit(progress=86 + round((i+1)/len(rows)*13), message=f"已判定 {i+1}/{len(rows)} 个回复")
    return {"source":"computed", "schemaVersion":4, "modelPath":str(model_path), "model":model_path.name, "judgeModel":MODEL_NAME, "dataset":group, "datasets":[{"path":str(p.relative_to(root)),"sha256":hashlib.sha256(p.read_bytes()).hexdigest()} for p in sources], "layer":index+1, "layers":len(layers), "intermediate":down.weight.shape[1], "samples":rows, "projection":coordinates, "semanticProjection":semantic_projection, "hiddenNorms":matrix.norm(dim=-1).tolist(), "layerNorms":matrix.norm(dim=-1).mean(dim=0).tolist(), "similarity":similarity, "measurements":measurements, "neurons":measurements[index]["neurons"], "method":"Shared all-layer PCA first component of prompt last-token hidden states; per-layer PCA; per-sample mean prompt FFN activation; abs(sum_hidden(weight * gradient)) for generated-response NLL; biased linear CKA. Qwen3Guard-Gen-0.6B response moderation over user prompt and generated response; no trained safety probe.", "versions":{"torch":torch.__version__}}


if __name__ == "__main__":
    try:
        request = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
        result = run(request)
        target = Path(sys.argv[2])
        temporary = target.with_suffix(".tmp")
        temporary.write_text(json.dumps(result,ensure_ascii=False,allow_nan=False),encoding="utf-8")
        temporary.replace(target)
        emit(progress=100,message="分析完成")
    except Exception as exc:
        emit(error=str(exc))
        raise
