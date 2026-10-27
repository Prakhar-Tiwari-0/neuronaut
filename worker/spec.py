"""Model access, from lyramakesmusic/neuron-explorer (generalized in ishaanko/neuron-explorer): where a decoder keeps its
MLP neurons, norms and attention. Everything architecture-specific goes through Spec, which is built by looking at the
loaded modules, so Qwen2/3/3.5, Llama, Mistral and Gemma 1-4 share one code path.

    spec = Spec.load("google/gemma-3-1b-it")   # weights on the best device
    spec = Spec.meta("google/gemma-3-1b-it")   # shapes only, no weights: the explorer's arch without a live model

A neuron is one input of a layer's down_proj, act(gate) * up. Its write direction is the direction a push on it adds
to the residual stream: W_down[:, n], times the post-FFN norm's gain on models that norm the MLP output (Gemma 2-4).
"""
import os
from functools import cached_property

import torch
from transformers import AutoConfig, AutoModelForCausalLM, AutoModelForImageTextToText, AutoTokenizer

MODEL = os.environ.get("GAME_MODEL", "Qwen/Qwen3.5-4B")


def best_device():
    return "mps" if torch.backends.mps.is_available() else "cuda" if torch.cuda.is_available() else "cpu"


def _auto_class(cfg):
    multimodal = any(a.endswith("ForConditionalGeneration") for a in cfg.architectures or [])
    return AutoModelForImageTextToText if multimodal else AutoModelForCausalLM


class SoftmaxAttn:
    """Per-head weight slices of one softmax attention layer. q / k / v rows read the pre-attention norm's output;
    o columns write into the residual (after the post-attention norm's gain on sandwich-norm models)."""

    def __init__(self, a, o_gain):
        self.mod, self.o_gain = a, o_gain
        self.hd = a.head_dim
        self.nq = a.o_proj.in_features // self.hd
        self.nkv = a.k_proj.out_features // self.hd
        self.rep = self.nq // self.nkv
        self.gated = a.q_proj.out_features == 2 * self.nq * self.hd  # Qwen3.5 / Qwen3-Next: q_proj also emits a gate

    def q(self, h):
        W = self.mod.q_proj.weight
        return W.view(self.nq, 2 * self.hd, -1)[h, :self.hd] if self.gated else W[h * self.hd:(h + 1) * self.hd]

    def q_all(self):
        """[nq, hd, hidden]"""
        W = self.mod.q_proj.weight
        return W.view(self.nq, 2 * self.hd, -1)[:, :self.hd] if self.gated else W.view(self.nq, self.hd, -1)

    def k(self, kv):
        return self.mod.k_proj.weight[kv * self.hd:(kv + 1) * self.hd]

    def v(self, kv):
        return self.mod.v_proj.weight[kv * self.hd:(kv + 1) * self.hd]

    def o(self, h):
        W = self.mod.o_proj.weight[:, h * self.hd:(h + 1) * self.hd].float()
        return W if self.o_gain is None else W * self.o_gain[:, None]


class Spec:
    def __init__(self, model, name, tok=None):
        self.model, self.name, self.tok = model, name, tok
        self.cfg = model.config.get_text_config()
        self.lm = model.get_decoder()
        self.layers = self.lm.layers
        self.final_norm = self.lm.norm
        self.lm_head = model.get_output_embeddings()
        self.n_layers = len(self.layers)
        self.layer_types = list(getattr(self.cfg, "layer_types", None) or ["full_attention"] * self.n_layers)
        self._gains = {}
        for i, layer in enumerate(self.layers):
            mlp = getattr(layer, "mlp", None)
            if getattr(layer, "enable_moe_block", False) or not all(hasattr(mlp, p) for p in ("gate_proj", "up_proj", "down_proj")):
                raise NotImplementedError(f"{name} layer {i}: the MLP is not a dense gate/up/down MLP (MoE or fused "
                                          "projections), so a neuron has no single meaning here")
            if not hasattr(layer, "input_layernorm"):
                raise NotImplementedError(f"{name}: post-norm-only blocks (OLMo 2 style) are not supported")

    @classmethod
    def load(cls, name=MODEL, device=None, dtype=torch.bfloat16):
        cfg = AutoConfig.from_pretrained(name)
        model = _auto_class(cfg).from_pretrained(name, dtype=dtype).to(device or best_device()).eval().requires_grad_(False)
        return cls(model, name, AutoTokenizer.from_pretrained(name))

    @classmethod
    def meta(cls, name=MODEL):
        cfg = AutoConfig.from_pretrained(name)
        with torch.device("meta"):
            model = _auto_class(cfg).from_config(cfg)
        return cls(model, name)

    @property
    def device(self):
        return self.final_norm.weight.device

    # ---------- per layer ----------
    def _sandwich(self, l):
        """Gemma 2-4 norm both sides of each sublayer; there post_attention_layernorm norms the attention output and
        pre_feedforward_layernorm is the MLP's input norm."""
        return hasattr(self.layers[l], "pre_feedforward_layernorm")

    def pre_attn(self, l):
        return self.layers[l].input_layernorm

    def post_attn(self, l):
        return self.layers[l].post_attention_layernorm if self._sandwich(l) else None

    def pre_mlp(self, l):
        L = self.layers[l]
        return L.pre_feedforward_layernorm if self._sandwich(l) else L.post_attention_layernorm

    def post_mlp(self, l):
        return self.layers[l].post_feedforward_layernorm if self._sandwich(l) else None

    def mlp(self, l):
        return self.layers[l].mlp

    def down(self, l):
        return self.layers[l].mlp.down_proj

    def width(self, l):
        return self.layers[l].mlp.down_proj.in_features

    def branch(self, l):
        """The module whose output is the MLP's addition to the residual stream: where steering pushes land (the
        fork's post_block hook adds at the same point)."""
        return self.post_mlp(l) or self.mlp(l)

    def out_scale(self, l):
        """Gemma 4 multiplies each block's output by a learned scalar after the point where pushes land; residual
        norms measured at a block's output are divided by it, so dose units refer to the residual the push joins."""
        return float(getattr(self.layers[l], "layer_scalar", 1.0))

    def gain(self, norm):
        """An RMSNorm's per-channel gain as float32: w, or 1 + w on Gemma-style norms (Qwen3.5 too). Found by running the
        norm on a vector of ones, so no norm class needs to be known."""
        if norm is None:
            return None
        if id(norm) not in self._gains:
            w = getattr(norm, "weight", None)
            if w is None:
                g = torch.ones(self.cfg.hidden_size, device=self.device)
            else:
                with torch.inference_mode():  # forward(), not __call__: the explorer's hooks stay out of it
                    y = norm.forward(torch.ones(1, w.numel(), dtype=w.dtype, device=w.device))[0].float()
                wf = w.detach().float()
                g = 1.0 + wf if (y - (1.0 + wf)).abs().max() < (y - wf).abs().max() else wf
            self._gains[id(norm)] = g
        return self._gains[id(norm)]

    def write_cols(self, l):
        """[hidden, N] float32: every neuron's write direction into the residual."""
        W = self.down(l).weight.float()
        g = self.gain(self.post_mlp(l))
        return W if g is None else W * g[:, None]

    def write_col(self, l, n):
        d = self.down(l).weight[:, n].float()
        g = self.gain(self.post_mlp(l))
        return d if g is None else d * g

    def read_rows(self, l, n=None):
        """Gate and up rows (one neuron's, or [N, hidden] for all) times the pre-MLP norm gain: what the neuron reads
        from the normed residual, in residual coordinates."""
        mlp, g = self.mlp(l), self.gain(self.pre_mlp(l))
        sl = slice(None) if n is None else n
        return mlp.gate_proj.weight[sl].float() * g, mlp.up_proj.weight[sl].float() * g

    def act(self, l):
        return self.layers[l].mlp.act_fn

    # ---------- attention ----------
    def attn_kind(self, l):
        """'linear' (Gated DeltaNet in Qwen3.5 / Qwen3-Next) or 'softmax' (full or sliding window)."""
        return "linear" if hasattr(self.layers[l], "linear_attn") else "softmax"

    def attn(self, l):
        L = self.layers[l]
        return L.linear_attn if hasattr(L, "linear_attn") else L.self_attn

    def softmax_attn(self, l):
        return SoftmaxAttn(self.layers[l].self_attn, self.gain(self.post_attn(l)))

    def n_heads(self, l):
        a = self.attn(l)
        return a.num_v_heads if self.attn_kind(l) == "linear" else a.o_proj.in_features // a.head_dim

    def n_kv_heads(self, l):
        a = self.attn(l)
        if self.attn_kind(l) == "linear":
            return a.num_k_heads
        k = getattr(a, "k_proj", None)  # Gemma 4's KV-shared layers reuse an earlier layer's keys
        return k.out_features // a.head_dim if k is not None else self.cfg.num_key_value_heads

    def attn_out_proj(self, l):
        a = self.attn(l)
        return a.out_proj if self.attn_kind(l) == "linear" else a.o_proj

    @cached_property
    def heads_supported(self):
        """Whether head-level analysis (patterns, attribution, weight links) understands this model's attention.
        Gemma 4's cross-layer KV sharing and k = v layers are not handled."""
        if getattr(self.cfg, "num_kv_shared_layers", 0) or getattr(self.cfg, "attention_k_eq_v", False):
            return False
        for l in range(self.n_layers):
            a = self.attn(l)
            need = ("in_proj_qkv", "out_proj", "norm") if self.attn_kind(l) == "linear" else ("q_proj", "k_proj", "v_proj", "o_proj")
            if not all(getattr(a, p, None) is not None for p in need):
                return False
        return True

    def arch(self):
        """What the explorer's pages need to draw the model."""
        return {"model": self.name, "n_layers": self.n_layers, "hidden": self.cfg.hidden_size,
                "widths": [self.width(l) for l in range(self.n_layers)],
                "inter": max(self.width(l) for l in range(self.n_layers)),
                "layer_types": self.layer_types,
                "heads": [self.n_heads(l) for l in range(self.n_layers)],
                "kv_heads": [self.n_kv_heads(l) for l in range(self.n_layers)],
                "heads_supported": self.heads_supported}

    # ---------- chat ----------
    def stop_ids(self):
        """Token ids that end an assistant turn: the generation config's eos ids plus the tokenizer's."""
        ids = getattr(self.model.generation_config, "eos_token_id", None)
        ids = set(ids if isinstance(ids, (list, tuple)) else [ids] if ids is not None else [])
        if self.tok.eos_token_id is not None:
            ids.add(self.tok.eos_token_id)
        return ids

    def chat_ids(self, messages):
        enc = self.tok.apply_chat_template(messages, add_generation_prompt=True, enable_thinking=False, tokenize=True)
        return list(enc["input_ids"] if hasattr(enc, "keys") else enc)
