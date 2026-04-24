from pydantic import BaseModel


class UserUpdate(BaseModel):
    full_name: str | None = None
    phone: str | None = None
