"""Train and save a separate version of a personal LoRA adapter."""

import argparse
import hashlib
import json
import os
from pathlib import Path


def run(folder, model_path):
    """Train only the adapter parameters on local observations.

    Parameters
    ----------
    folder : Path
        Private job directory containing the dataset and job state.
    model_path : Path
        Local base model loaded without executing remote code.
    """
    os.environ.update(HF_HUB_OFFLINE="1", TRANSFORMERS_OFFLINE="1",
                      HF_HUB_DISABLE_TELEMETRY="1", WANDB_MODE="disabled")
    import torch
    from peft import LoraConfig, PeftModel, get_peft_model
    from transformers import AutoModelForCausalLM, AutoTokenizer

    torch.set_num_threads(2)
    torch.manual_seed(17)
    os.nice(10)
    state = json.loads((folder / "state.json").read_text(encoding="utf-8"))
    tokenizer = AutoTokenizer.from_pretrained(model_path, local_files_only=True,
                                            trust_remote_code=False)
    base = AutoModelForCausalLM.from_pretrained(model_path, local_files_only=True,
                                              trust_remote_code=False)
    parent_id = state.get("parentId")
    if parent_id:
        parent = folder.parent / parent_id
        previous = json.loads((parent / "state.json").read_text(encoding="utf-8"))
        if previous["owner"] != state["owner"] or not previous.get("adapterReady"):
            raise ValueError("invalid_parent_adapter")
        model = PeftModel.from_pretrained(base, parent / "adapter", is_trainable=True)
    else:
        model = get_peft_model(base, LoraConfig(r=4, lora_alpha=8, lora_dropout=.05,
                                              target_modules=["q_proj", "v_proj"],
                                              task_type="CAUSAL_LM"))
    model.config.use_cache = False
    model.gradient_checkpointing_enable(gradient_checkpointing_kwargs={"use_reentrant": False})
    model.enable_input_require_grads()
    rows = [json.loads(line) for line in (folder / "data/train.jsonl").read_text(encoding="utf-8").splitlines() if line.strip()]
    examples = []
    for row in rows:
        messages = row["messages"]
        prefix = tokenizer.apply_chat_template(messages[:-1], tokenize=True,
                                               add_generation_prompt=True)
        prefix = prefix[-128:]
        target = tokenizer(messages[-1]["content"], add_special_tokens=False)["input_ids"][:127] + [tokenizer.eos_token_id]
        tensor = torch.tensor([prefix + target])
        labels = tensor.clone()
        labels[:, :len(prefix)] = -100
        examples.append((tensor, labels))
    if not examples:
        raise ValueError("no_training_tokens")
    optimizer = torch.optim.AdamW((p for p in model.parameters() if p.requires_grad), lr=1e-4)
    model.train()
    model.peft_config["default"].base_model_name_or_path = "HuggingFaceTB/SmolLM2-135M-Instruct"
    adapter = folder / "adapter"
    first_loss = None
    last_loss = None
    for step in range(1, 201):
        ids, labels = examples[(step - 1) % len(examples)]
        optimizer.zero_grad(set_to_none=True)
        loss = model(input_ids=ids, labels=labels).loss
        if not torch.isfinite(loss):
            raise ValueError("nonfinite_training_loss")
        loss.backward()
        torch.nn.utils.clip_grad_norm_((p for p in model.parameters() if p.requires_grad), 1.)
        optimizer.step()
        last_loss = float(loss.detach())
        first_loss = first_loss if first_loss is not None else last_loss
        print(f"Iter {step}: Train loss {last_loss:.6f}", flush=True)
        if step % 20 == 0:
            model.save_pretrained(adapter, safe_serialization=True)
    weights = adapter / "adapter_model.safetensors"
    manifest = {"baseModel": "HuggingFaceTB/SmolLM2-135M-Instruct", "parentId": parent_id,
                "steps": 200, "examples": len(examples), "firstLoss": first_loss,
                "lastLoss": last_loss, "validation": None,
                "purpose": "Longitudinal astronaut behavior research; next-observation objective",
                "objective": "observations-next-v1", "predictionQuality": "not evaluated",
                "weightsSha256": hashlib.sha256(weights.read_bytes()).hexdigest(),
                "datasetSha256": hashlib.sha256((folder / "data/train.jsonl").read_bytes()).hexdigest()}
    (adapter / "training_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--job", type=Path, required=True)
    parser.add_argument("--model", type=Path, required=True)
    args = parser.parse_args()
    run(args.job, args.model)
