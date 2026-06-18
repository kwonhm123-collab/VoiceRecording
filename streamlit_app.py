from pathlib import Path
import json
import shutil

import streamlit as st
import streamlit.components.v1 as components


ROOT = Path(__file__).parent
STATIC_DIR = ROOT / "static"


def prepare_static_site() -> None:
    STATIC_DIR.mkdir(exist_ok=True)

    files = [
        "mobile.css",
        "upload-addon.css",
        "upload-addon.js",
        "favicon.svg",
        "icons.svg",
        "coi-serviceworker.js",
    ]

    for filename in files:
        source = ROOT / filename
        target = STATIC_DIR / filename
        if source.exists():
            shutil.copy2(source, target)

    source_index = ROOT / "index.html"
    target_index = STATIC_DIR / "index.html"
    if source_index.exists():
        index_html = source_index.read_text(encoding="utf-8")
        gemini_api_key = get_secret("GEMINI_API_KEY") or get_secret("gemini_api_key")
        if gemini_api_key:
            secret_bootstrap = f"""
    <script>
      localStorage.setItem("geminiApiKey", {json.dumps(gemini_api_key)});
    </script>"""
            index_html = index_html.replace("</head>", f"{secret_bootstrap}\n  </head>")
        target_index.write_text(index_html, encoding="utf-8")

    source_assets = ROOT / "assets"
    target_assets = STATIC_DIR / "assets"
    if source_assets.exists():
        shutil.copytree(source_assets, target_assets, dirs_exist_ok=True)


def get_secret(name: str) -> str:
    try:
        value = st.secrets.get(name, "")
    except FileNotFoundError:
        return ""
    return str(value).strip()


st.set_page_config(
    page_title="MeetNote",
    page_icon="favicon.svg",
    layout="wide",
    initial_sidebar_state="collapsed",
)

prepare_static_site()

st.markdown(
    """
    <style>
      #MainMenu, footer, header { visibility: hidden; }
      .block-container {
        padding: 0;
        max-width: none;
      }
      iframe {
        display: block;
      }
    </style>
    """,
    unsafe_allow_html=True,
)

components.iframe("./app/static/index.html", height=900, scrolling=True)
