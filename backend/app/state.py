from typing import Dict
from .models.schemas import BuildingModel

_models: Dict[str, BuildingModel] = {}
_ifc_data: Dict[str, bytes] = {}


def save_model(model: BuildingModel) -> None:
    _models[model.id] = model


def get_model(model_id: str) -> BuildingModel | None:
    return _models.get(model_id)


def save_ifc(model_id: str, data: str) -> None:
    _ifc_data[model_id] = data.encode("utf-8")


def get_ifc(model_id: str) -> bytes | None:
    return _ifc_data.get(model_id)
