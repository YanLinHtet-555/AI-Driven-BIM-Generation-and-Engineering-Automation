import json
from pathlib import Path
from typing import Dict
from .models.schemas import BuildingModel

_STORE_DIR = Path(__file__).parent.parent / ".model_store"

_models:   Dict[str, BuildingModel] = {}
_ifc_data: Dict[str, bytes]         = {}


def _model_path(model_id: str) -> Path:
    return _STORE_DIR / f"{model_id}.json"


def _ifc_path(model_id: str) -> Path:
    return _STORE_DIR / f"{model_id}.ifc"


def save_model(model: BuildingModel) -> None:
    _models[model.id] = model
    _STORE_DIR.mkdir(exist_ok=True)
    _model_path(model.id).write_text(model.model_dump_json(), encoding="utf-8")


def get_model(model_id: str) -> BuildingModel | None:
    if model_id in _models:
        return _models[model_id]
    path = _model_path(model_id)
    if path.exists():
        try:
            m = BuildingModel.model_validate_json(path.read_text(encoding="utf-8"))
            _models[model_id] = m
            return m
        except Exception:
            pass
    return None


def save_ifc(model_id: str, data: str) -> None:
    _ifc_data[model_id] = data.encode("utf-8")
    _STORE_DIR.mkdir(exist_ok=True)
    _ifc_path(model_id).write_bytes(data.encode("utf-8"))


def get_ifc(model_id: str) -> bytes | None:
    if model_id in _ifc_data:
        return _ifc_data[model_id]
    path = _ifc_path(model_id)
    if path.exists():
        data = path.read_bytes()
        _ifc_data[model_id] = data
        return data
    return None
