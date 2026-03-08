"""
API router aggregation module.

This module aggregates all API routers from the v1 endpoints.
"""

from fastapi import APIRouter

from app.api.v1 import admin
from app.api.v1 import auth
from app.api.v1 import batch_import
from app.api.v1 import emails
from app.api.v1 import mailboxes
from app.api.v1 import rules
from app.api.v1 import system
from app.api.v1 import users

api_router = APIRouter()

api_router.include_router(auth.router, prefix='/auth', tags=['authentication'])
api_router.include_router(users.router, prefix='/users', tags=['users'])
api_router.include_router(mailboxes.router, prefix='/mailboxes', tags=['mailboxes'])
api_router.include_router(emails.router, prefix='/emails', tags=['emails'])
api_router.include_router(rules.router, prefix='/rules', tags=['rules'])
api_router.include_router(admin.router, prefix='/admin', tags=['admin'])
api_router.include_router(system.router, prefix='/system', tags=['system'])
api_router.include_router(batch_import.router, prefix='/batch-import', tags=['batch-import'])
