# app/core/llm.py
import os
import json
import re
import logging
from typing import List, Callable, Dict, Any

log = logging.getLogger("uvicorn.error")

# -----------------------
# Env & defaults
# -----------------------
LLM_PROVIDER   = os.getenv("LLM_PROVIDER", "fake").lower()     # fake | groq | together | openai
EMBED_PROVIDER = os.getenv("EMBED_PROVIDER", "local").lower()  # local | together | openai | fake

# Optional chat envs (you may use these elsewhere)
CHAT_PROVIDER  = os.getenv("CHAT_PROVIDER", "").lower() or LLM_PROVIDER
CHAT_MODEL     = os.getenv("CHAT_MODEL", "")

# Embeddings
EMBED_MODEL    = os.getenv("EMBED_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
EMBED_DIM      = int(os.getenv("EMBED_DIM", "1536"))

# Generation (flashcards, quizzes, etc.)
GEN_MODEL      = os.getenv("GEN_MODEL", "llama-3.3-70b-versatile")
GEN_T          = float(os.getenv("GEN_T", "0.2"))

QUIZ_MODEL = os.getenv("QUIZ_MODEL", GEN_MODEL)
QUIZ_T     = float(os.getenv("QUIZ_T", str(GEN_T)))

log.info(
    "[llm] LLM_PROVIDER=%s GEN_MODEL=%s GEN_T=%s CHAT_PROVIDER=%s CHAT_MODEL=%s EMBED_PROVIDER=%s EMBED_MODEL=%s EMBED_DIM=%s",
    LLM_PROVIDER, GEN_MODEL, GEN_T, CHAT_PROVIDER, CHAT_MODEL, EMBED_PROVIDER, EMBED_MODEL, EMBED_DIM
)

def _pad_to_dim(vecs: List[List[float]], dim: int) -> List[List[float]]:
    out = []
    for v in vecs:
        if len(v) == dim:
            out.append(v)
        elif len(v) > dim:
            out.append(v[:dim])
        else:
            out.append(v + [0.0] * (dim - len(v)))
    return out

# -----------------------
# Embeddings
# -----------------------
class Embedder:
    def __init__(self, fn: Callable[[List[str]], Any], dim: int):
        self._fn = fn
        self.dim = dim

    async def embed_texts(self, texts: List[str]) -> List[List[float]]:
        return await self._fn(texts)

def get_embedder() -> Embedder:
    if EMBED_PROVIDER == "local":
        try:
            from sentence_transformers import SentenceTransformer
        except Exception as e:
            raise RuntimeError(
                "sentence-transformers is required for EMBED_PROVIDER=local. "
                "Run: pip install 'sentence-transformers==2.7.0'"
            ) from e

        model = SentenceTransformer(EMBED_MODEL)

        async def _embed(texts: List[str]) -> List[List[float]]:
            vecs = model.encode(texts, normalize_embeddings=True).tolist()
            return _pad_to_dim(vecs, EMBED_DIM)

        return Embedder(_embed, EMBED_DIM)

    if EMBED_PROVIDER == "together":
        import openai
        openai.api_key = os.environ["TOGETHER_API_KEY"]
        openai.base_url = os.getenv("TOGETHER_BASE_URL", "https://api.together.xyz/v1")
        together_embed_model = os.getenv(
            "TOGETHER_EMBED_MODEL", "mixedbread-ai/mxbai-embed-large-v1"
        )

        async def _embed(texts: List[str]) -> List[List[float]]:
            resp = openai.embeddings.create(model=together_embed_model, input=texts)
            vecs = [d.embedding for d in resp.data]
            return _pad_to_dim(vecs, EMBED_DIM)

        return Embedder(_embed, EMBED_DIM)

    if EMBED_PROVIDER == "openai":
        from openai import OpenAI
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        openai_embed_model = os.getenv("OPENAI_EMBED_MODEL", "text-embedding-3-small")

        async def _embed(texts: List[str]) -> List[List[float]]:
            resp = client.embeddings.create(model=openai_embed_model, input=texts)
            return [d.embedding for d in resp.data]

        return Embedder(_embed, EMBED_DIM)

    async def _fake(texts: List[str]) -> List[List[float]]:
        return [[0.0] * EMBED_DIM for _ in texts]

    return Embedder(_fake, EMBED_DIM)

# -----------------------
# Card generator (flashcards)
# -----------------------
class CardGenerator:
    def __init__(self, fn: Callable[[str, str], Any]):
        self._fn = fn

    # ✅ NEW (safe helper): raw access for quizzes or other modules
    async def generate_raw(self, system: str, user: str) -> str:
        return await self._fn(system, user)

    def _extract_json_candidate(self, raw: str) -> str:
        if not raw:
            return ""
        text = raw.strip()

        # If model wrapped JSON in ```json fences
        fenced = re.search(r"```(?:json)?\s*(\{.*?\}|\[.*?\])\s*```", text, re.S | re.I)
        if fenced:
            return fenced.group(1).strip()

        # Otherwise attempt to slice from first {..} or [..]
        start_obj = text.find("{")
        end_obj = text.rfind("}")
        if start_obj != -1 and end_obj != -1 and end_obj > start_obj:
            return text[start_obj:end_obj + 1].strip()

        start_arr = text.find("[")
        end_arr = text.rfind("]")
        if start_arr != -1 and end_arr != -1 and end_arr > start_arr:
            return text[start_arr:end_arr + 1].strip()

        return text

    def _normalize_card(self, c: Dict[str, Any]) -> Dict[str, Any] | None:
        # Accept multiple common key variants
        q = (c.get("question") or c.get("q") or c.get("front") or "").strip()
        a = (c.get("answer") or c.get("a") or c.get("back") or "").strip()
        if not q or not a:
            return None

        hint = c.get("hint")
        diff = (c.get("difficulty") or c.get("level") or "medium")
        tags = c.get("tags") or c.get("tag") or []
        if isinstance(tags, str):
            tags = [t.strip() for t in tags.split(",") if t.strip()]
        if not isinstance(tags, list):
            tags = []

        diff = str(diff).lower().strip()
        if diff not in ("easy", "medium", "hard"):
            diff = "medium"

        return {
            "question": q,
            "answer": a,
            "hint": hint,
            "difficulty": diff,
            "tags": tags,
            "source_chunk_id": c.get("source_chunk_id"),
        }

    def _parse_cards(self, raw: str) -> List[Dict[str, Any]]:
        if not raw:
            return []

        candidate = self._extract_json_candidate(raw)
        try:
            data = json.loads(candidate)
        except Exception:
            return []

        # Root can be dict or list
        if isinstance(data, dict):
            cards = (
                data.get("cards")
                or data.get("flashcards")
                or data.get("items")
                or []
            )
        elif isinstance(data, list):
            cards = data
        else:
            return []

        if not isinstance(cards, list):
            return []

        out: List[Dict[str, Any]] = []
        for item in cards:
            if not isinstance(item, dict):
                continue
            norm = self._normalize_card(item)
            if norm:
                out.append(norm)
        return out

    async def generate(self, joined_context: str, n_cards: int, style: str = "mixed") -> List[Dict[str, Any]]:
        system = (
            "You create concise, exam-style flashcards.\n"
            "Return ONLY valid JSON. No markdown, no extra text.\n"
            "Schema:\n"
            '{"cards":[{"question":"...","answer":"...","hint":"optional","difficulty":"easy|medium|hard","tags":["..."]}]}\n'
        )

        style_note = {
            "definitions": "Focus on crisp definitions and key terms.",
            "conceptual": "Focus on conceptual understanding and why/how questions.",
            "qa": "Use direct Q&A style with specific prompts.",
            "mixed": "Mix definitions, conceptual, and practical Q&A.",
        }.get(style or "mixed", "Mix definitions, conceptual, and practical Q&A.")

        user = (
            f"Context:\n{joined_context}\n\n"
            f"Make exactly {n_cards} high-yield flashcards. "
            f"{style_note} "
            "Avoid fluff; prefer precise definitions, cause-effect, and contrasts."
        )

        raw = await self._fn(system, user)
        cards = self._parse_cards(raw)
        if cards:
            return cards

        # Repair pass: if model returned non-JSON / wrong format, convert it
        repair_system = "You are a JSON formatter. Output ONLY valid JSON. No markdown, no extra text."
        repair_user = (
            "Convert the following into STRICT JSON in this exact schema:\n"
            '{"cards":[{"question":"...","answer":"...","hint":"optional","difficulty":"easy|medium|hard","tags":["..."]}]}\n\n'
            f"TEXT TO CONVERT:\n{raw}"
        )
        raw2 = await self._fn(repair_system, repair_user)
        return self._parse_cards(raw2)

def get_card_generator() -> "CardGenerator":
    if LLM_PROVIDER == "groq":
        try:
            from groq import Groq
        except ImportError as e:
            raise ImportError(
                "Missing dependency 'groq'. Add `groq>=0.31.0` to requirements.txt and reinstall."
            ) from e

        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise RuntimeError("GROQ_API_KEY is not set.")

        client = Groq(api_key=api_key)

        # IMPORTANT: flashcards use GEN_MODEL from env/compose
        model = GEN_MODEL
        temperature = GEN_T

        async def _chat(system: str, user: str) -> str:
            r = client.chat.completions.create(
                model=model,
                temperature=temperature,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            )
            out = (r.choices[0].message.content or "").strip()
            log.info("[flashcards][groq model=%s] raw_out=%s", model, out[:1200])
            return out

        return CardGenerator(_chat)

    if LLM_PROVIDER == "together":
        import openai
        openai.api_key = os.environ["TOGETHER_API_KEY"]
        openai.base_url = os.getenv("TOGETHER_BASE_URL", "https://api.together.xyz/v1")
        model = os.getenv("GEN_MODEL", "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo")
        temperature = float(os.getenv("GEN_T", "0.2"))

        async def _chat(system: str, user: str) -> str:
            r = openai.chat.completions.create(
                model=model,
                temperature=temperature,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            )
            out = (r.choices[0].message.content or "").strip()
            log.info("[flashcards][together model=%s] raw_out=%s", model, out[:1200])
            return out

        return CardGenerator(_chat)

    if LLM_PROVIDER == "openai":
        from openai import OpenAI
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        model = os.getenv("GEN_MODEL", "gpt-4o-mini")
        temperature = float(os.getenv("GEN_T", "0.2"))

        async def _chat(system: str, user: str) -> str:
            r = client.chat.completions.create(
                model=model,
                temperature=temperature,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            )
            out = (r.choices[0].message.content or "").strip()
            log.info("[flashcards][openai model=%s] raw_out=%s", model, out[:1200])
            return out

        return CardGenerator(_chat)

    if LLM_PROVIDER == "fake":
        async def _heuristic_generator(system: str, user: str) -> str:
            # Extract target count
            match_count = re.search(r"Make exactly (\d+) high-yield flashcards", user)
            target_count = int(match_count.group(1)) if match_count else 5

            # Extract context
            # The user prompt is "Context:\n{joined_context}\n\nMake exactly..."
            match_ctx = re.search(r"Context:\n(.*?)\n\nMake exactly", user, re.S)
            text = match_ctx.group(1) if match_ctx else ""

            if not text.strip():
                return json.dumps({"cards": []})

            # Heuristic extraction
            import random
            cards = []
            
            # Split context by newline and parse chunks
            raw_lines = text.split("\n")
            current_chunk_id = None
            lines_with_source = []

            for line in raw_lines:
                line = line.strip()
                if not line: continue
                
                # Check for chunk marker [CHUNK:123]
                m_chunk = re.match(r"^\[CHUNK:(\d+)\]\s*(.*)", line)
                if m_chunk:
                    try:
                        current_chunk_id = int(m_chunk.group(1))
                    except ValueError:
                        pass
                    content = m_chunk.group(2).strip()
                else:
                    content = line
                
                # Strip leading dashes/bullets
                content = content.lstrip("- ").strip()
                
                if len(content) > 20:
                    lines_with_source.append((content, current_chunk_id))
            
            # 1. Look for definitions "X is Y"
            for line, chunk_id in lines_with_source:
                # Regex for "Term is/refers to Definition"
                # We limit Term to be somewhat short (up to 40 chars)
                m = re.match(r"^([A-Z][\w\s\']{1,40}) (is|is a|is an|refers to|means|is defined as|stands for|states that|states) (.+)", line)
                if m:
                    term = m.group(1).strip()
                    verb = m.group(2).strip()
                    defn = m.group(3).strip()
                    
                    # Refine question phrasing
                    if verb in ("stands for",):
                        question = f"What does '{term}' stand for?"
                    elif verb in ("states that", "states"):
                        question = f"What does '{term}' state?"
                    elif verb in ("means", "is defined as", "refers to"):
                        question = f"What does '{term}' mean?"
                    else:
                        # is, is a, is an
                        question = f"What is '{term}'?"

                    cards.append({
                        "question": question,
                        "answer": defn,
                        "difficulty": "easy",
                        "tags": ["definition", "generated"],
                        "source_chunk_id": chunk_id
                    })

                # Regex for "Term: Definition"
                m2 = re.match(r"^([A-Z][\w\s\']{1,40}): (.+)", line)
                if m2:
                    term = m2.group(1).strip()
                    defn = m2.group(2).strip()
                    cards.append({
                        "question": f"Define '{term}'",
                        "answer": defn,
                        "difficulty": "easy",
                        "tags": ["definition", "generated"],
                        "source_chunk_id": chunk_id
                    })

            # 2. Look for conceptual sentences (longer, contain key terms)
            # Shuffle lines to get random sampling
            random.shuffle(lines_with_source)
            for line, chunk_id in lines_with_source:
                if len(cards) >= target_count * 2: break
                if len(line) < 30: continue
                
                # Deduplicate if we already have this as an answer
                is_duplicate = False
                for c in cards:
                    if c["answer"] == line:
                        is_duplicate = True
                        break
                if is_duplicate:
                    continue

                # Turn sentence into a question
                # "The mitochondria is the powerhouse of the cell." -> Q: Explain the function of mitochondria.
                # This is hard to do heuristically.
                # Fallback: "Fill in the blank" or "Explain this statement"
                
                cards.append({
                    "question": f"Explain the following concept: {line[:50]}...",
                    "answer": line,
                    "difficulty": "medium",
                    "tags": ["concept", "generated"],
                    "source_chunk_id": chunk_id
                })

            # Deduplicate by question
            unique_cards = {}
            for c in cards:
                if c["question"] not in unique_cards:
                    unique_cards[c["question"]] = c
            
            final_cards = list(unique_cards.values())
            # Limit to target
            final_cards = final_cards[:target_count]
            
            return json.dumps({"cards": final_cards})

        return CardGenerator(_heuristic_generator)

# -----------------------
# Quiz generator (quizzes)
# -----------------------
def get_quiz_generator() -> Callable[[str], Any]:
    """
    Returns an async function that takes a prompt (string) and returns a parsed JSON dict.

    IMPORTANT:
    - We reuse the Groq/Together/OpenAI code paths you already have.
    - Your get_card_generator() does NOT accept model/temperature args.
      So we temporarily override GEN_MODEL / GEN_T to QUIZ_MODEL / QUIZ_T,
      create a CardGenerator, then restore GEN_MODEL / GEN_T.
    """

    # Fast path for local development without external LLMs: synthesize a valid quiz
    if LLM_PROVIDER == "fake":
        async def _fake_quiz(prompt: str) -> Dict[str, Any]:
            # Try to infer counts from the prompt
            import re as _re
            import random
            
            n_questions = 8
            mcq_count = 4
            m_total = _re.search(r"TOTAL:\s*EXACTLY\s*(\d+)\s*questions", prompt, _re.I)
            if m_total:
                try:
                    n_questions = int(m_total.group(1))
                except Exception:
                    pass
            m_mcq = _re.search(r"EXACTLY\s*(\d+)\s*questions with type=\"mcq\"", prompt, _re.I)
            if m_mcq:
                try:
                    mcq_count = int(m_mcq.group(1))
                except Exception:
                    pass
            subjective_count = max(0, n_questions - mcq_count)

            # Extract context
            context_match = prompt.split("CONTEXT:\n")
            text = context_match[-1] if len(context_match) > 1 else ""
            
            # Parse chunks and lines
            raw_lines = text.split("\n")
            current_chunk_id = None
            sentences_with_source = []
            definitions = []

            for line in raw_lines:
                line = line.strip()
                if not line: continue
                
                # Check for chunk marker [CHUNK:123]
                m_chunk = _re.match(r"^\[CHUNK:(\d+)\]\s*(.*)", line)
                if m_chunk:
                    try:
                        current_chunk_id = int(m_chunk.group(1))
                    except ValueError:
                        pass
                    content = m_chunk.group(2).strip()
                else:
                    content = line
                
                content = content.lstrip("- ").strip()
                if len(content) > 20:
                    sentences_with_source.append((content, current_chunk_id))
                    
                    # Try to extract definitions for MCQs
                    # "Term is Definition"
                    m_def = _re.match(r"^([A-Z][\w\s\']{1,40}) (is|refers to|means|is defined as) (.+)", content)
                    if m_def:
                        term = m_def.group(1).strip()
                        defn = m_def.group(3).strip()
                        if len(defn) > 10:
                            definitions.append({
                                "term": term,
                                "definition": defn,
                                "chunk_id": current_chunk_id
                            })

            items: List[Dict[str, Any]] = []
            used_indices = set()
            
            # --- Generate MCQs ---
            # If we have definitions, use them
            random.shuffle(definitions)
            
            for i in range(mcq_count):
                if i < len(definitions):
                    # Use a real definition
                    d = definitions[i]
                    term = d["term"]
                    correct_def = d["definition"]
                    
                    # Create distractors from other definitions
                    distractors = [x["definition"] for x in definitions if x["term"] != term]
                    # If not enough, pad with generic
                    while len(distractors) < 3:
                        distractors.append(f"Generic distractor {len(distractors)+1}")
                    
                    random.shuffle(distractors)
                    opts = distractors[:3] + [correct_def]
                    random.shuffle(opts)
                    correct_idx = opts.index(correct_def)
                    
                    items.append({
                        "type": "mcq",
                        "question": f"What is the definition of '{term}'?",
                        "options": opts,
                        "correct_index": correct_idx,
                        "answer_key": correct_def,
                        "explanation": f"'{term}' is defined as: {correct_def}",
                        "difficulty": "easy",
                        "source": {"chunk_id": d["chunk_id"], "page_start": 1, "page_end": 1},
                    })
                else:
                    # Fallback if ran out of definitions: use sentences
                    if not sentences_with_source:
                        # Absolute fallback
                        items.append({
                            "type": "mcq",
                            "question": f"Demo MCQ {i+1}: What is 2 + 2?",
                            "options": ["1", "2", "3", "4"],
                            "correct_index": 3,
                            "answer_key": "4",
                            "explanation": "Basic arithmetic fallback",
                            "difficulty": "easy",
                            "source": {"chunk_id": 1, "page_start": 1, "page_end": 1},
                        })
                        continue
                        
                    # Pick a random sentence
                    idx = random.randint(0, len(sentences_with_source) - 1)
                    sent, chunk_id = sentences_with_source[idx]
                    
                    # Cloze deletion (blank out a word)
                    words = sent.split()
                    if len(words) > 5:
                        blank_idx = random.randint(0, len(words)-1)
                        correct_word = words[blank_idx]
                        words[blank_idx] = "______"
                        q_text = " ".join(words)
                        
                        # Fake distractors
                        opts = ["incorrect", "wrong", "false", correct_word]
                        random.shuffle(opts)
                        
                        items.append({
                            "type": "mcq",
                            "question": f"Fill in the blank: {q_text}",
                            "options": opts,
                            "correct_index": opts.index(correct_word),
                            "answer_key": correct_word,
                            "explanation": f"The complete sentence is: {sent}",
                            "difficulty": "medium",
                            "source": {"chunk_id": chunk_id, "page_start": 1, "page_end": 1},
                        })
                    else:
                        # Fallback
                        items.append({
                            "type": "mcq",
                            "question": f"True or False: {sent}",
                            "options": ["True", "False", "Maybe", "Unknown"],
                            "correct_index": 0,
                            "answer_key": "True",
                            "explanation": "This statement is directly from the text.",
                            "difficulty": "easy",
                            "source": {"chunk_id": chunk_id, "page_start": 1, "page_end": 1},
                        })

            # --- Generate Subjective ---
            random.shuffle(sentences_with_source)
            subjective_generated = 0
            
            for sent, chunk_id in sentences_with_source:
                if subjective_generated >= subjective_count:
                    break
                    
                # Skip if very short
                if len(sent) < 30: continue
                
                items.append({
                    "type": "conceptual",
                    "question": f"Explain the significance of the following statement: '{sent[:60]}...'",
                    "answer_key": f"The statement '{sent}' is a key concept from the text.",
                    "explanation": f"This concept is discussed in the material.",
                    "difficulty": "medium",
                    "source": {"chunk_id": chunk_id, "page_start": 1, "page_end": 1},
                })
                subjective_generated += 1
            
            # Fill remaining subjective if needed
            while subjective_generated < subjective_count:
                items.append({
                    "type": "conceptual",
                    "question": f"Discuss key concept #{subjective_generated+1} from the material.",
                    "answer_key": "This is a demo conceptual answer key.",
                    "explanation": "Demo explanation",
                    "difficulty": "medium",
                    "source": {"chunk_id": 1, "page_start": 1, "page_end": 1},
                })
                subjective_generated += 1

            return {"title": "Generated Quiz", "items": items[:n_questions]}

        return _fake_quiz

    global GEN_MODEL, GEN_T

    old_model, old_t = GEN_MODEL, GEN_T
    try:
        GEN_MODEL = QUIZ_MODEL
        GEN_T = QUIZ_T

        # This will now use QUIZ_MODEL/QUIZ_T internally
        cg = get_card_generator()

    finally:
        # Restore immediately so flashcards remain unaffected
        GEN_MODEL = old_model
        GEN_T = old_t

    async def _gen(prompt: str) -> Dict[str, Any]:
        system = (
            "You generate exam-quality quizzes.\n"
            "Return ONLY valid JSON. No markdown, no extra text.\n"
            "Schema:\n"
            '{'
            '"title":"Quiz title",'
            '"items":[{'
            '"type":"mcq|conceptual|definition|scenario|short_qa",'
            '"question":"...",'
            '"options":["A","B","C","D"],'
            '"correct_index":0,'
            '"answer_key":"...",'
            '"explanation":"optional",'
            '"difficulty":"easy|medium|hard",'
            '"source":{"chunk_id":123,"page_start":1,"page_end":1}'
            '}]}'
        )

        raw = await cg.generate_raw(system, prompt)
        candidate = cg._extract_json_candidate(raw)

        try:
            data = json.loads(candidate)
        except Exception:
            # Repair pass (same idea as flashcards)
            repair_system = "You are a JSON formatter. Output ONLY valid JSON. No markdown, no extra text."
            repair_user = (
                "Convert the following into STRICT JSON in this exact schema:\n"
                '{'
                '"title":"Quiz title",'
                '"items":[{'
                '"type":"mcq|conceptual|definition|scenario|short_qa",'
                '"question":"...",'
                '"options":["A","B","C","D"],'
                '"correct_index":0,'
                '"answer_key":"...",'
                '"explanation":"optional",'
                '"difficulty":"easy|medium|hard",'
                '"source":{"chunk_id":123,"page_start":1,"page_end":1}'
                '}]}'
                "\n\n"
                f"TEXT TO CONVERT:\n{raw}"
            )
            raw2 = await cg.generate_raw(repair_system, repair_user)
            candidate2 = cg._extract_json_candidate(raw2)
            data = json.loads(candidate2)

        if not isinstance(data, dict):
            raise ValueError("Quiz JSON root must be an object")

        if "items" not in data or not isinstance(data["items"], list):
            raise ValueError("Quiz JSON must contain an 'items' list")

        return data

    return _gen

__all__ = ["get_embedder", "get_card_generator", "get_quiz_generator", "EMBED_DIM"]
