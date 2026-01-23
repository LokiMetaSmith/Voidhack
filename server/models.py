from typing import Optional
from pydantic import BaseModel

class CommandRequest(BaseModel):
    text: str
    user_id: str
    skipTTS: Optional[bool] = False

class UserRegister(BaseModel):
    user_id: str
    name: str

class LocationUpdate(BaseModel):
    user_id: str
    token: str

class RadiationCleared(BaseModel):
    user_id: str
