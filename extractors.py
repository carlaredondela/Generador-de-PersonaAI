import io
import re
from typing import Iterable

import requests
import streamlit as st
from bs4 import BeautifulSoup
from docx import Document
from pypdf import PdfReader


def clean_text(text: str, max_chars: int = 20000) -> str:
    text = re.sub(r"\s+", " ", text or "").strip()
    return text[:max_chars]


@st.cache_data(show_spinner=False, ttl=3600)
def extract_url_text(url: str) -> str:
    if not url:
        return ""
    response = requests.get(url, timeout=15, headers={"User-Agent": "PersonaAI-Generator/1.0"})
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "html.parser")
    for tag in soup(["script", "style", "nav", "footer", "header", "form"]):
        tag.decompose()
    main = soup.find("main") or soup.find("article") or soup.body or soup
    return clean_text(main.get_text(" "), max_chars=18000)


def extract_uploaded_file(uploaded_file) -> str:
    if uploaded_file is None:
        return ""

    name = uploaded_file.name.lower()
    raw = uploaded_file.getvalue()
    if name.endswith(".txt"):
        return clean_text(raw.decode("utf-8", errors="ignore"), max_chars=18000)
    if name.endswith(".pdf"):
        reader = PdfReader(io.BytesIO(raw))
        pages = [page.extract_text() or "" for page in reader.pages]
        return clean_text("\n".join(pages), max_chars=18000)
    if name.endswith(".docx"):
        document = Document(io.BytesIO(raw))
        paragraphs = [paragraph.text for paragraph in document.paragraphs]
        return clean_text("\n".join(paragraphs), max_chars=18000)
    raise ValueError(f"Formato no soportado: {uploaded_file.name}")


def combine_context(parts: Iterable[str], max_chars: int = 30000) -> str:
    usable = [part.strip() for part in parts if part and part.strip()]
    return "\n\n".join(usable)[:max_chars]
