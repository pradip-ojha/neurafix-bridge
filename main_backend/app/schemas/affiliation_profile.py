from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel


class AffiliationProfileOut(BaseModel):
    id: str
    user_id: str
    bank_name: str | None
    account_number: str | None
    account_name: str | None
    qr_image_url: str | None
    total_referrals: int
    total_earnings: Decimal
    created_at: datetime

    model_config = {"from_attributes": True}
