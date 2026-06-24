"""Agent ask endpoint — natural-language Q&A over the sentiment archive.

This is the demo-magnet endpoint for the beta. A customer POSTs either
a free-form question or a template name. The endpoint loads a small
Groq-hosted Llama model, exposes the archive tools defined in
`services.agent_tools`, and lets the model call those tools to gather
the data it needs to answer. The response includes the synthesized
answer, the structured sources cited, and the raw tool-call trace for
auditability.

Endpoints
---------

  POST /v1/agent/ask
       Body:
         { question?: str, template?: str, variables?: object,
           commodity?: str, max_tool_calls?: int }
       Either `question` or `template` is required.

  GET  /v1/agent/templates
       List the named templates available, with default variables.

Auth: Bearer api_key. The Groq call uses the server's GROQ_API_KEY;
customer cost is one API-call unit per request.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from services.agent_templates import describe as templates_describe, render as render_template
from services.agent_tools import TOOL_SCHEMAS, call_tool
from services.api_key_auth import verify_api_key

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/agent", tags=["agent"])

DEFAULT_MAX_TOOL_CALLS = 6
DEFAULT_MODEL = "llama-3.3-70b-versatile"


class AskRequest(BaseModel):
    question: Optional[str] = Field(default=None, description="Free-form NL question.")
    template: Optional[str] = Field(default=None, description="Named template; one of interpret_today/trend_30d/divergence_check.")
    variables: Optional[Dict[str, Any]] = Field(default=None, description="Template variables (overrides defaults).")
    commodity: Optional[str] = Field(default=None, description="Convenience: same as variables.commodity.")
    max_tool_calls: int = Field(default=DEFAULT_MAX_TOOL_CALLS, ge=1, le=12)


class AskResponse(BaseModel):
    answer: str
    sources: List[Dict[str, Any]]
    tool_calls: List[Dict[str, Any]]
    model: str
    template_used: Optional[str] = None


def _build_initial_prompt(req: AskRequest) -> str:
    """Resolve `question` from either a template or the free-form field."""
    if req.template:
        variables = dict(req.variables or {})
        if req.commodity and "commodity" not in variables:
            variables["commodity"] = req.commodity
        try:
            return render_template(req.template, variables=variables)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    if req.question:
        prefix = (
            "You are Integra, a commodity-markets sentiment analyst. "
            "Use the provided tools to ground every claim in archive data. "
            "Cite specific article ids and market tickers in your sources list.\n\n"
            "User question: "
        )
        return prefix + req.question.strip()
    raise HTTPException(status_code=400, detail="either 'question' or 'template' is required")


@router.get("/templates")
async def list_templates(_auth: Dict[str, Any] = Depends(verify_api_key)) -> Dict[str, Any]:
    return {"templates": templates_describe()}


@router.post("/ask", response_model=AskResponse)
async def ask(
    req: AskRequest,
    _auth: Dict[str, Any] = Depends(verify_api_key),
) -> AskResponse:
    try:
        from groq import Groq  # type: ignore
    except ImportError as exc:
        raise HTTPException(status_code=503, detail="groq SDK not installed") from exc

    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="GROQ_API_KEY not configured on server")

    initial_prompt = _build_initial_prompt(req)
    messages: List[Dict[str, Any]] = [{"role": "user", "content": initial_prompt}]

    client = Groq(api_key=api_key)
    tool_trace: List[Dict[str, Any]] = []

    # Iterative tool-calling loop. The model may ask for several tools
    # before producing its final answer; we cap at max_tool_calls to
    # bound latency and cost.
    for _ in range(req.max_tool_calls):
        try:
            response = client.chat.completions.create(
                model=DEFAULT_MODEL,
                messages=messages,
                tools=TOOL_SCHEMAS,
                tool_choice="auto",
                max_tokens=2048,
                temperature=0.2,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("groq chat call failed: %s", exc)
            raise HTTPException(status_code=502, detail=f"upstream LLM error: {exc}") from exc

        choice = response.choices[0]
        msg = choice.message

        if not getattr(msg, "tool_calls", None):
            # Model produced a final answer.
            answer_text = msg.content or ""
            sources = _extract_sources_from_trace(tool_trace)
            return AskResponse(
                answer=answer_text,
                sources=sources,
                tool_calls=tool_trace,
                model=DEFAULT_MODEL,
                template_used=req.template,
            )

        # Execute every tool call the model requested in this turn.
        messages.append({
            "role": "assistant",
            "content": msg.content or "",
            "tool_calls": [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                }
                for tc in msg.tool_calls
            ],
        })
        for tc in msg.tool_calls:
            tool_result = call_tool(tc.function.name, tc.function.arguments)
            tool_trace.append({
                "name": tc.function.name,
                "arguments": tc.function.arguments,
                "result_bytes": len(tool_result),
            })
            messages.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "name": tc.function.name,
                "content": tool_result,
            })

    # Hit the tool-call cap without a final answer. Ask for a wrap-up.
    messages.append({
        "role": "user",
        "content": "You've used the tool budget. Produce your best final answer now using only the data you've already retrieved.",
    })
    try:
        wrap = client.chat.completions.create(
            model=DEFAULT_MODEL,
            messages=messages,
            max_tokens=1024,
            temperature=0.2,
        )
        answer_text = wrap.choices[0].message.content or ""
    except Exception as exc:  # noqa: BLE001
        logger.warning("groq wrap-up call failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"upstream LLM error on wrap-up: {exc}") from exc

    return AskResponse(
        answer=answer_text,
        sources=_extract_sources_from_trace(tool_trace),
        tool_calls=tool_trace,
        model=DEFAULT_MODEL,
        template_used=req.template,
    )


def _extract_sources_from_trace(trace: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Best-effort extraction of document_ids and market_ids from tool outputs.

    Today this returns just the trace entry names + sizes. A future
    revision will parse the tool JSON results to surface the underlying
    article ids and market tickers as a flat list of citations.
    """
    return trace
