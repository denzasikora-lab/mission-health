# LoRA research checkpoint

[Download weights and the complete run](https://github.com/denzasikora-lab/mission-health/releases/tag/lora-preflight-v1) · [Training code](../../local/train_peft.py)

- Base: `HuggingFaceTB/SmolLM2-135M-Instruct`, revision `12fd25f77366fa6b3b4b768ec3050bf629380bac`.
- Adapter: 937,056 bytes; LoRA rank 4, alpha 8; `q_proj` and `v_proj`.
- Latest run: 200 CPU steps, continued from the included earlier adapter.
- Data: 18 synthetic Preflight training records and 2 unused validation records.
- Objective: model the next recorded observation from earlier observations.
- Libraries: PyTorch, Transformers and PEFT. Exact versions are in the download.

This is an experimental training artifact. Prediction quality was not evaluated; training loss is not a health or accuracy score. These weights are separate from the Azure agent and are not active in production answers.

## Reproduce the latest run

Extract the release ZIP. From its directory, use Linux with Python 3.12:

```bash
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -c "from huggingface_hub import snapshot_download; snapshot_download('HuggingFaceTB/SmolLM2-135M-Instruct', revision='12fd25f77366fa6b3b4b768ec3050bf629380bac', local_dir='base-model')"
.venv/bin/python code/train_peft.py --model base-model --job jobs/current
```

The published weights are in `adapter/`; rerun output goes to `jobs/current/adapter/`. The bundle includes the required parent adapter, exact data, training manifest, loss trace, file checksums and compatibility-check results. CPU/library differences can change numerical results. It contains no private health records, credentials or server addresses.
