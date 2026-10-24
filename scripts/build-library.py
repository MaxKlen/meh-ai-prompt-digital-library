#!/usr/bin/env python3
"""Build source-specific local JSON files from pinned, licensed prompt datasets."""

from __future__ import annotations

import csv
import hashlib
import io
import json
import re
import sys
import urllib.request
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "public" / "data"
USER_AGENT = "PromptShelf-local-dataset-builder/1.1"
MAX_STATIC_JSON_BYTES = 4_500_000
CC_BY = "https://creativecommons.org/licenses/by/4.0/"
CC0 = "https://creativecommons.org/publicdomain/zero/1.0/"
CC_BY_NC = "https://creativecommons.org/licenses/by-nc/4.0/"

THINKWITHPROMPT_REV = "f8cc3e82c23712bfdbb37ebe5c54365fd65f06d4"
PROMPTTENSOR_REV = "6239133d43d2463e3f1316c835e3bbe79c2cedfd"
PROMPTS_CHAT_REV = "9a4f2d4ee58349129bd2e6d7831912a91e579b2c"
WEGENBENCH_REV = "6b03f1c088e971f12b2a048751eedb8a9a814d4d"

PROMPT_TITLE_EXCLUSIONS = re.compile(
    r"\b(?:dan|jailbreak|developer\s*mode|do\s*anything\s*now|unfiltered|uncensored|"
    r"system\s*prompt|prompt\s*injection|bypass|ignore\s+(?:all\s+)?(?:previous|prior)\s+instructions|"
    r"global\s+rules|red\s*team|escape\s+the\s+box|access\s+unlimited)\b",
    re.IGNORECASE,
)

SOURCE_SPECS = {
    "thinkwithprompt": {
        "name": "ThinkWithPrompt AI Prompt Library",
        "organization": "ThinkWithPrompt editorial team at Synottic",
        "repository": "https://github.com/amitsoni-ai/thinkwithprompt-prompts",
        "revision": THINKWITHPROMPT_REV,
        "file": "prompts.jsonl",
        "version": "2026-10-16",
        "license": "CC BY 4.0",
        "license_url": CC_BY,
        "attribution": "ThinkWithPrompt by Synottic (https://www.thinkwithprompt.com)",
        "canonical_url": "https://github.com/amitsoni-ai/thinkwithprompt-prompts",
        "platform_coverage": ["ChatGPT", "Claude", "Gemini", "other assistants"],
        "coverage_note": "The dataset README names these platforms at library level; individual prompts have not been tested against each model.",
        "output_file": "prompts-thinkwithprompt.json",
        "url": f"https://raw.githubusercontent.com/amitsoni-ai/thinkwithprompt-prompts/{THINKWITHPROMPT_REV}/prompts.jsonl",
    },
    "prompttensor": {
        "name": "PromptTensor Prompt Bank",
        "organization": "PromptTensor",
        "repository": "https://github.com/PromptTensor/prompttensor-promptbank",
        "revision": PROMPTTENSOR_REV,
        "file": "data/prompts_public.jsonl",
        "version": "v1.0.1",
        "license": "CC BY 4.0 with row-level license markers",
        "license_url": CC_BY,
        "attribution": "PromptTensor. PromptTensor Prompt Bank (v1.0.1). DOI: 10.5281/zenodo.18665254. https://prompttensor.com/datasets/prompttensor-promptbank-v1",
        "canonical_url": "https://prompttensor.com/datasets/prompttensor-promptbank-v1",
        "platform_coverage": ["general LLM assistants"],
        "coverage_note": "The source describes a general English LLM user-prompt bank; no individual platform compatibility has been tested.",
        "output_file": "prompts-prompttensor.json",
        "url": f"https://raw.githubusercontent.com/PromptTensor/prompttensor-promptbank/{PROMPTTENSOR_REV}/data/prompts_public.jsonl",
    },
    "prompts-chat": {
        "name": "prompts.chat community prompt data",
        "organization": "prompts.chat contributors",
        "repository": "https://github.com/f/prompts.chat",
        "revision": PROMPTS_CHAT_REV,
        "file": "prompts.csv",
        "version": "main snapshot at pinned commit",
        "license": "CC0 1.0",
        "license_url": CC0,
        "attribution": "prompts.chat contributors (https://github.com/f/prompts.chat); prompt data is dedicated to the public domain under CC0 1.0.",
        "canonical_url": "https://github.com/f/prompts.chat",
        "platform_coverage": ["ChatGPT", "Claude", "Gemini", "Llama", "Mistral", "other modern assistants"],
        "coverage_note": "The repository describes cross-assistant prompt use. The app has not tested compatibility with any model.",
        "output_file": "prompts-chat.json",
        "url": f"https://raw.githubusercontent.com/f/prompts.chat/{PROMPTS_CHAT_REV}/prompts.csv",
    },
    "wegenbench": {
        "name": "WeGenBench image-generation prompt dataset",
        "organization": "WeGenBench authors",
        "repository": "https://github.com/WeChatCV/WeGenBench",
        "revision": WEGENBENCH_REV,
        "file": "data/prompts/*.jsonl",
        "version": "current selected prompt splits at pinned commit",
        "license": "CC BY-NC 4.0",
        "license_url": CC_BY_NC,
        "attribution": "WeGenBench authors; cite WeGenBench and indicate changes. Dataset source: https://github.com/WeChatCV/WeGenBench",
        "canonical_url": "https://github.com/WeChatCV/WeGenBench",
        "platform_coverage": ["text-to-image generation models"],
        "coverage_note": "These are text-to-image benchmark prompts, not platform-specific compatibility recommendations. Dataset use is noncommercial under CC BY-NC 4.0.",
        "output_file": "prompts-wegenbench.json",
        "files": [
            {"name": "wegenbench_general_en.jsonl", "language": "en", "group": "general"},
            {"name": "wegenbench_general_cn.jsonl", "language": "zh", "group": "general"},
            {"name": "wegenbench_text_en_v2.jsonl", "language": "en", "group": "text-rendering"},
            {"name": "wegenbench_text_cn.jsonl", "language": "zh", "group": "text-rendering"},
        ],
    },
}


def download(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=180) as response:
        return response.read()


def parse_jsonl(raw: bytes, source_label: str) -> list[dict]:
    try:
        rows = [json.loads(line) for line in raw.splitlines() if line.strip()]
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ValueError(f"Invalid JSONL in {source_label}") from error
    if not rows:
        raise ValueError(f"No rows received from {source_label}")
    return rows


def slug(value: str) -> str:
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", value.casefold())).strip("-")


def display_words(value: str) -> str:
    return " ".join(word.capitalize() for word in value.replace("_", " ").split())


def category_entry(categories: dict[str, dict], name: str, description: str) -> str:
    category_id = slug(name)
    categories.setdefault(category_id, {"id": category_id, "name": name, "description": description})
    return category_id


def record_source(source_id: str, file: str, line: int, license_name: str, license_url: str, record_url: str | None = None, **extra: object) -> dict:
    source = SOURCE_SPECS[source_id]
    result = {
        "sourceId": source_id,
        "repository": source["repository"],
        "revision": source["revision"],
        "file": file,
        "line": line,
        "recordUrl": record_url or f"{source['repository']}/blob/{source['revision']}/{file}#L{line}",
        "license": license_name,
        "licenseUrl": license_url,
        "attribution": source["attribution"],
    }
    result.update(extra)
    return result


def empty_prompt_record(
    *, prompt_id: str, title: str, category_id: str, category: str, description: str,
    tags: list[str], content: str, modality: str, source: dict, source_type: str = "",
    framework: str = "", difficulty: str = "", variables: list[str] | None = None,
    constraints: list[str] | None = None, intent: str = "", language: str | None = None,
    target_text: list[str] | None = None, alternates: list[dict] | None = None,
    developer_oriented: bool = False,
) -> dict:
    return {
        "id": prompt_id,
        "title": title,
        "categoryId": category_id,
        "category": category,
        "description": description,
        "tags": tags,
        "content": content,
        "modality": modality,
        "sourceType": source_type,
        "framework": framework,
        "difficulty": difficulty,
        "variables": variables or [],
        "constraints": constraints or [],
        "intent": intent,
        "language": language,
        "targetText": target_text or [],
        "alternates": alternates or [],
        "developerOriented": developer_oriented,
        "source": source,
    }


def build_thinkwithprompt(categories: dict[str, dict]) -> tuple[list[dict], dict]:
    source = SOURCE_SPECS["thinkwithprompt"]
    raw = download(source["url"])
    rows = parse_jsonl(raw, "ThinkWithPrompt")
    if len(rows) != 2663:
        raise ValueError(f"Expected 2,663 ThinkWithPrompt rows; received {len(rows)}")
    prompts = []
    for line, row in enumerate(rows, start=1):
        category = str(row.get("category") or "Uncategorized")
        category_id = category_entry(categories, category, f"Prompt templates categorized by ThinkWithPrompt under {category}.")
        prompts.append(empty_prompt_record(
            prompt_id=f"twp-{row.get('id', line)}",
            title=str(row.get("title") or f"ThinkWithPrompt prompt {row.get('id', line)}"),
            category_id=category_id,
            category=category,
            description=str(row.get("description") or "Reusable task prompt template."),
            tags=[str(tag) for tag in (row.get("tags") or []) if str(tag).strip()],
            content=str(row.get("prompt") or ""),
            modality=str(row.get("type") or "TEXT").upper(),
            framework=str(row.get("framework") or ""),
            difficulty=str(row.get("level") or ""),
            variables=[str(value) for value in (row.get("variables") or [])],
            source=record_source("thinkwithprompt", source["file"], line, source["license"], source["license_url"], str(row.get("url") or "") or None),
        ))
    summary = {"recordsInSource": len(rows), "recordsIncluded": len(prompts), "recordsExcludedForLicense": 0, "recordsExcludedByTitleMarkers": 0, "sha256": hashlib.sha256(raw).hexdigest()}
    return prompts, summary


def build_prompttensor(categories: dict[str, dict]) -> tuple[list[dict], dict, Counter[str]]:
    source = SOURCE_SPECS["prompttensor"]
    raw = download(source["url"])
    rows = parse_jsonl(raw, "PromptTensor")
    if len(rows) != 7040:
        raise ValueError(f"Expected 7,040 PromptTensor rows; received {len(rows)}")
    allowed = {"CC-BY-4.0": ("CC BY 4.0", CC_BY), "CC0-1.0": ("CC0 1.0", CC0)}
    prompts = []
    license_markers: Counter[str] = Counter()
    for line, row in enumerate(rows, start=1):
        marker = str(row.get("license") or "").strip()
        license_markers[marker or "(blank)"] += 1
        if marker not in allowed:
            continue
        license_name, license_url = allowed[marker]
        domain = str(row.get("domain") or "general")
        category = display_words(domain)
        category_id = category_entry(categories, category, f"Prompt records in PromptTensor's {category} domain.")
        subdomain = str(row.get("subdomain") or "")
        intent = str(row.get("intent") or "")
        tags = [value for value in [category, display_words(subdomain), display_words(intent), str(row.get("difficulty") or ""), str(row.get("output_style") or "")] if value]
        description_parts = [display_words(intent) if intent else "General", "prompt"]
        if subdomain:
            description_parts.append(f"in {display_words(subdomain)}")
        prompts.append(empty_prompt_record(
            prompt_id=f"pt-{row.get('prompt_id', line)}",
            title=f"{category} · {display_words(intent) if intent else 'General'}",
            category_id=category_id,
            category=category,
            description=" ".join(description_parts),
            tags=tags,
            content=str(row.get("prompt_text") or ""),
            modality="TEXT",
            difficulty=str(row.get("difficulty") or ""),
            constraints=[str(value) for value in (row.get("constraints") or [])],
            intent=intent,
            language=str(row.get("language") or "") or None,
            source=record_source("prompttensor", source["file"], line, license_name, license_url),
        ))
    summary = {"recordsInSource": len(rows), "recordsIncluded": len(prompts), "recordsExcludedForLicense": len(rows) - len(prompts), "recordsExcludedByTitleMarkers": 0, "sha256": hashlib.sha256(raw).hexdigest()}
    return prompts, summary, license_markers


def build_prompts_chat(categories: dict[str, dict]) -> tuple[list[dict], dict]:
    source = SOURCE_SPECS["prompts-chat"]
    raw = download(source["url"])
    csv.field_size_limit(sys.maxsize)
    reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig")))
    if reader.fieldnames != ["act", "prompt", "for_devs", "type", "contributor"]:
        raise ValueError(f"Unexpected prompts.chat header: {reader.fieldnames}")
    prompts = []
    excluded = 0
    row_count = 0
    for row in reader:
        row_count += 1
        title = str(row.get("act") or "").strip()
        if not title or PROMPT_TITLE_EXCLUSIONS.search(title):
            excluded += 1
            continue
        source_type = str(row.get("type") or "TEXT").strip().upper()
        modality = "IMAGE" if source_type == "IMAGE" else "TEXT"
        category_suffix = {"IMAGE": "Image", "STRUCTURED": "Structured", "TEXT": "Text"}.get(source_type, "Text")
        category = f"Community · {category_suffix}"
        category_id = category_entry(categories, category, f"Public-domain community prompt records labeled {category_suffix.lower()} by prompts.chat.")
        line = reader.line_num
        contributor = str(row.get("contributor") or "").strip()
        tags = ["Community prompt", "CC0 1.0"]
        if source_type == "STRUCTURED":
            tags.append("Structured output")
        developer_oriented = str(row.get("for_devs") or "").strip().casefold() == "true"
        if developer_oriented:
            tags.append("Developer-oriented")
        prompts.append(empty_prompt_record(
            prompt_id=f"chat-{line}",
            title=title,
            category_id=category_id,
            category=category,
            description=f"Community prompt from prompts.chat{f' by {contributor}' if contributor else ''}.",
            tags=tags,
            content=str(row.get("prompt") or ""),
            modality=modality,
            source_type=source_type,
            developer_oriented=developer_oriented,
            source=record_source("prompts-chat", source["file"], line, source["license"], source["license_url"], **({"contributor": contributor} if contributor else {})),
        ))
    if row_count != 2627:
        raise ValueError(f"Expected 2,627 prompts.chat rows; received {row_count}")
    if excluded != 10:
        raise ValueError(f"Expected 10 prompts.chat title-marker exclusions; received {excluded}")
    summary = {"recordsInSource": row_count, "recordsIncluded": len(prompts), "recordsExcludedForLicense": 0, "recordsExcludedByTitleMarkers": excluded, "sha256": hashlib.sha256(raw).hexdigest()}
    return prompts, summary


def build_wegenbench(categories: dict[str, dict]) -> tuple[list[dict], dict]:
    source = SOURCE_SPECS["wegenbench"]
    prompts = []
    hashes = []
    source_count = 0
    for file_spec in source["files"]:
        file_name = file_spec["name"]
        relative_file = f"data/prompts/{file_name}"
        url = f"https://raw.githubusercontent.com/WeChatCV/WeGenBench/{WEGENBENCH_REV}/{relative_file}"
        raw = download(url)
        rows = parse_jsonl(raw, f"WeGenBench {file_name}")
        hashes.append(file_name.encode() + hashlib.sha256(raw).digest())
        source_count += len(rows)
        for line, row in enumerate(rows, start=1):
            group = file_spec["group"]
            category = "Image Generation · General Scenes" if group == "general" else "Image Generation · Text Rendering"
            category_id = category_entry(categories, category, "Noncommercial WeGenBench text-to-image benchmark prompts grouped by source split.")
            source_type = str(row.get("type") or "")
            tags = [str(tag) for tag in (row.get("tag") or []) if str(tag).strip()]
            if row.get("style"):
                tags.append(str(row["style"]))
            target = row.get("text") or []
            if isinstance(target, str):
                target = [target] if target else []
            alternates = []
            if row.get("prompt_zh"):
                alternates.append({"language": "zh", "content": str(row["prompt_zh"])})
            prompts.append(empty_prompt_record(
                prompt_id=f"wgb-{slug(file_name.removesuffix('.jsonl'))}-{row.get('id', line)}",
                title=f"WeGenBench image prompt · {row.get('id', line)}",
                category_id=category_id,
                category=category,
                description=f"Text-to-image benchmark record from the {group.replace('-', ' ')} split; source scenario: {source_type}.",
                tags=tags,
                content=str(row.get("prompt") or ""),
                modality="IMAGE",
                source_type=source_type,
                difficulty=str(row.get("difficulty") or ""),
                language=file_spec["language"],
                target_text=[str(value) for value in target if str(value).strip()],
                alternates=alternates,
                source=record_source("wegenbench", relative_file, line, source["license"], source["license_url"]),
            ))
    if source_count != 3972:
        raise ValueError(f"Expected 3,972 selected WeGenBench rows; received {source_count}")
    summary = {"recordsInSource": source_count, "recordsIncluded": len(prompts), "recordsExcludedForLicense": 0, "recordsExcludedByTitleMarkers": 0, "sha256": hashlib.sha256(b"".join(hashes)).hexdigest()}
    return prompts, summary


def source_info(source_id: str, summary: dict) -> dict:
    spec = SOURCE_SPECS[source_id]
    return {
        "id": source_id,
        "name": spec["name"],
        "organization": spec["organization"],
        "repository": spec["repository"],
        "revision": spec["revision"],
        "file": spec["file"],
        "version": spec["version"],
        "license": spec["license"],
        "licenseUrl": spec["license_url"],
        "attribution": spec["attribution"],
        "canonicalUrl": spec["canonical_url"],
        "platformCoverage": spec["platform_coverage"],
        "coverageNote": spec["coverage_note"],
        **summary,
    }


def main() -> None:
    categories: dict[str, dict] = {}
    dataset_records: dict[str, list[dict]] = {}
    summaries: dict[str, dict] = {}

    dataset_records["thinkwithprompt"], summaries["thinkwithprompt"] = build_thinkwithprompt(categories)
    dataset_records["prompttensor"], summaries["prompttensor"], license_markers = build_prompttensor(categories)
    dataset_records["prompts-chat"], summaries["prompts-chat"] = build_prompts_chat(categories)
    dataset_records["wegenbench"], summaries["wegenbench"] = build_wegenbench(categories)

    for records in dataset_records.values():
        records.sort(key=lambda item: (item["category"].casefold(), item["title"].casefold(), item["id"]))

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    for stale in DATA_DIR.glob("prompts-*.json"):
        stale.unlink()
    (DATA_DIR / "prompts.json").unlink(missing_ok=True)
    data_files = []
    for source_id, records in dataset_records.items():
        file_prefix = SOURCE_SPECS[source_id]["output_file"].removesuffix(".json")
        chunks: list[list[str]] = []
        current: list[str] = []
        current_bytes = 3  # opening/closing brackets plus trailing newline
        for record in records:
            serialized = json.dumps(record, ensure_ascii=False, separators=(",", ":"))
            extra_bytes = len(serialized.encode("utf-8")) + (1 if current else 0)
            if current and current_bytes + extra_bytes > MAX_STATIC_JSON_BYTES:
                chunks.append(current)
                current = []
                current_bytes = 3
                extra_bytes = len(serialized.encode("utf-8"))
            if current_bytes + extra_bytes > MAX_STATIC_JSON_BYTES:
                raise ValueError(f"Single record in {source_id} exceeds the static asset size limit")
            current.append(serialized)
            current_bytes += extra_bytes
        if current:
            chunks.append(current)
        for part, chunk in enumerate(chunks, start=1):
            file_name = f"{file_prefix}-{part:02d}.json"
            content = "[" + ",".join(chunk) + "]\n"
            output = DATA_DIR / file_name
            output.write_text(content, encoding="utf-8")
            if output.stat().st_size > MAX_STATIC_JSON_BYTES:
                raise ValueError(f"Generated static asset exceeds size limit: {output.name}")
            data_files.append({"sourceId": source_id, "file": f"/data/{file_name}", "records": len(chunk), "bytes": output.stat().st_size, "part": part, "parts": len(chunks)})

    total_prompts = sum(len(records) for records in dataset_records.values())
    manifest = {
        "title": "Prompt Shelf local library",
        "generatedAt": "2026-10-24",
        "dataPolicy": "Prompt strings are stored and displayed as inert text records. They are never interpreted, evaluated, executed, or sent to an AI service by this app.",
        "compatibilityNote": "Platform coverage is descriptive source metadata only. No prompt has been independently tested against any model.",
        "sources": [source_info(source_id, summaries[source_id]) for source_id in SOURCE_SPECS],
        "categories": sorted(categories.values(), key=lambda item: item["name"].casefold()),
        "dataFiles": data_files,
        "sourceLicenseMarkersExcluded": dict(license_markers),
        "records": total_prompts,
    }
    manifest_path = DATA_DIR / "library.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(json.dumps({"manifest": str(manifest_path), "prompts": total_prompts, "categories": len(categories), "sources": summaries, "dataFiles": data_files}, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
