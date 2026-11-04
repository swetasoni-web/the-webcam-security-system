import pytest
from app.auth.security import verify_password, get_password_hash, create_access_token, decode_access_token

def test_password_hashing():
    pwd = "SecretSurveillancePassword99!"
    hashed = get_password_hash(pwd)
    
    assert hashed != pwd
    assert verify_password(pwd, hashed) is True
    assert verify_password("WrongPassword!", hashed) is False

def test_jwt_token_generation_and_decoding():
    token = create_access_token(subject="commander", role="ADMIN")
    assert isinstance(token, str)
    assert len(token) > 20

    payload = decode_access_token(token)
    assert payload is not None
    assert payload.get("sub") == "commander"
    assert payload.get("role") == "ADMIN"

def test_invalid_jwt_token():
    invalid_payload = decode_access_token("this.is.an.invalid.token")
    assert invalid_payload is None
