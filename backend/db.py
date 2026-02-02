import os
from tortoise import Tortoise
from pathlib import Path

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite://./data/db.sqlite3")

# Ensure sqlite directory exists when using sqlite URL
if DATABASE_URL.startswith("sqlite://"):
    # Extract the file path from the URL
    db_file = DATABASE_URL.replace("sqlite://", "", 1)
    if db_file.startswith("./"):
        db_file = db_file[2:]  # Remove "./" prefix
    db_dir = Path(db_file).parent
    db_dir.mkdir(parents=True, exist_ok=True)

MODELS_MODULES = [
    "api.models.notification",
    "api.models.alert_preference",
]

async def init_db():
    await Tortoise.init(
        db_url=DATABASE_URL,
        modules={"models": MODELS_MODULES},
    )
    await Tortoise.generate_schemas()

async def close_db():
    await Tortoise.close_connections()

