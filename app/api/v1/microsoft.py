from fastapi import APIRouter, HTTPException, status

router = APIRouter()

_DEPRECATION_MESSAGE = (
    'Deprecated Microsoft OAuth endpoint. '
    'Use /api/v1/mailboxes/providers/oauth/microsoft/start and '
    '/api/v1/mailboxes/providers/oauth/microsoft/callback instead.'
)


@router.get('/auth')
async def microsoft_auth_redirect():
    raise HTTPException(status_code=status.HTTP_410_GONE, detail=_DEPRECATION_MESSAGE)


@router.get('/callback')
async def microsoft_auth_callback():
    raise HTTPException(status_code=status.HTTP_410_GONE, detail=_DEPRECATION_MESSAGE)
