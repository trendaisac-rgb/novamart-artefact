"""HTTP API for the web UI.

A thin layer over the same Agent the CLI uses: no logic lives here that the
evals do not exercise. The one thing it adds is streaming: every agent step
(search, order lookup, ticket) is sent to the browser as it happens, so the
employee sees what the assistant checked before it answers.

    uvicorn novamart.server:app --port 8000
"""

from __future__ import annotations

import asyncio
import json
import os
import threading
from collections import Counter
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from . import gaps
from .agent import Agent
from .config import AGENT_MODEL, EVAL_RESULTS_DIR, GAPS_FILE
from .knowledge import KnowledgeBase


class Turn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=4000)


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    store_id: str | None = Field(default=None, max_length=20)
    history: list[Turn] = Field(default_factory=list, max_length=6)


def create_app(agent: Agent | None = None, gaps_file: Path = GAPS_FILE,
               eval_dir: Path = EVAL_RESULTS_DIR) -> FastAPI:
    app = FastAPI(title="NovaMart Assist API", version="0.1.0")
    kb = agent.kb if agent else KnowledgeBase()
    state: dict = {"agent": agent, "error": None}

    # Local prototype: the UI may be served from localhost or from the Lovable preview,
    # which is an HTTPS page calling this API on localhost (hence private network).
    # Production puts this behind SSO instead (see PRODUCTION_NOTE.md).
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
                       allow_private_network=True)

    def get_agent() -> Agent:
        if state["agent"] is None:
            if not os.getenv("ANTHROPIC_API_KEY"):
                state["error"] = "ANTHROPIC_API_KEY is not set (agent/.env)"
                raise HTTPException(status_code=503, detail=state["error"])
            try:
                state["agent"] = Agent(kb=kb, gaps_file=gaps_file)
                state["error"] = None
            except Exception as exc:  # most often: ANTHROPIC_API_KEY not set
                state["error"] = str(exc)
                raise HTTPException(status_code=503, detail=f"Agent not ready: {exc}")
        return state["agent"]

    @app.get("/api/health")
    def health() -> dict:
        ready = True
        try:
            get_agent()
        except HTTPException:
            ready = False
        return {
            "status": "ok",
            "agent_ready": ready,
            "reason": state["error"],
            "model": AGENT_MODEL,
            "documents": len(kb.documents),
            "sections": len(kb.sections),
        }

    @app.get("/api/catalog")
    def catalog() -> list[dict]:
        return [
            {"doc_id": d.doc_id, "title": d.title, "summary": d.summary,
             "sections": [s.heading for s in d.sections]}
            for d in kb.documents
        ]

    @app.get("/api/policies/{doc_id}")
    def policy(doc_id: str) -> dict:
        doc = next((d for d in kb.documents if d.doc_id == doc_id), None)
        if doc is None:
            raise HTTPException(status_code=404, detail="Unknown document")
        return {"doc_id": doc.doc_id, "title": doc.title, "summary": doc.summary,
                "sections": [{"heading": s.heading, "text": s.text} for s in doc.sections]}

    @app.post("/api/ask")
    async def ask(req: AskRequest) -> StreamingResponse:
        agent_ = get_agent()
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue = asyncio.Queue()

        def push(event: dict) -> None:
            loop.call_soon_threadsafe(queue.put_nowait, event)

        def work() -> None:
            # The agent loop is synchronous; run it in a thread and stream its events.
            try:
                agent_.run(req.question, store_id=req.store_id,
                           history=[t.model_dump() for t in req.history], on_event=push)
            except Exception as exc:
                push({"type": "error", "message": f"{type(exc).__name__}: {exc}"})
            finally:
                push({"type": "done"})

        threading.Thread(target=work, daemon=True).start()

        async def stream():
            while True:
                event = await queue.get()
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
                if event["type"] == "done":
                    break

        return StreamingResponse(stream(), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    @app.get("/api/gaps")
    def gap_list() -> dict:
        entries = gaps.load_gaps(gaps_file)
        by_reason = Counter(e.get("decline_reason") or e.get("status") or "unspecified" for e in entries)
        return {"total": len(entries), "by_reason": dict(by_reason.most_common()),
                "entries": list(reversed(entries))}

    @app.post("/api/gaps/summarize")
    def gap_summary() -> dict:
        entries = gaps.load_gaps(gaps_file)
        if not entries:
            return {"markdown": "", "count": 0}
        return {"markdown": gaps.summarize(entries, get_agent().client), "count": len(entries)}

    @app.get("/api/evals/latest")
    def evals_latest() -> dict:
        path = eval_dir / "latest.json"
        if not path.exists():
            raise HTTPException(status_code=404, detail="No eval run yet. Run `make evals`.")
        return json.loads(path.read_text(encoding="utf-8"))

    return app


app = create_app()
