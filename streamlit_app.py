from pathlib import Path
import shutil

import streamlit as st
import streamlit.components.v1 as components


ROOT = Path(__file__).parent
STATIC_DIR = ROOT / "static"


def prepare_static_site() -> None:
    STATIC_DIR.mkdir(exist_ok=True)

    files = [
        "index.html",
        "favicon.svg",
        "icons.svg",
        "coi-serviceworker.js",
    ]

    for filename in files:
        source = ROOT / filename
        target = STATIC_DIR / filename
        if source.exists():
            shutil.copy2(source, target)

    source_assets = ROOT / "assets"
    target_assets = STATIC_DIR / "assets"
    if source_assets.exists():
        shutil.copytree(source_assets, target_assets, dirs_exist_ok=True)


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
