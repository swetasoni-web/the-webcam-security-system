import pytest
import os
import sys
from pathlib import Path

# Add backend directory to sys.path
backend_path = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_path))

from app.main import init_db_and_seed

@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    init_db_and_seed()
    yield
