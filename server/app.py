"""Trade Avata broker gateway foundation.

This file implements the browser-safe cTrader OAuth redirect/token exchange only.
It deliberately keeps client_secret and tokens on the server. Production account
discovery, market-data WebSockets and order routing belong in the broker gateway
service and must use the official cTrader Open API protocol/SDK.
"""
import os
from urllib.parse import urlencode
from fastapi import FastAPI, HTTPException, Query, Header
from fastapi.responses import RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
import httpx
import smtplib
import html
from email.message import EmailMessage
from pydantic import BaseModel, Field
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
from dotenv import load_dotenv

load_dotenv()
app=FastAPI(title='Trade Avata Secure Gateway',version='0.3.0')
FRONTEND=os.getenv('FRONTEND_URL','http://localhost:4173')
CLIENT_ID=os.getenv('CTRADER_CLIENT_ID','')
CLIENT_SECRET=os.getenv('CTRADER_CLIENT_SECRET','')
REDIRECT=os.getenv('CTRADER_REDIRECT_URI','')
SCOPE=os.getenv('CTRADER_SCOPE','trading')
signer=URLSafeTimedSerializer(os.getenv('SESSION_SIGNING_KEY','dev-change-me'))
# Replace this in-memory store with encrypted persistent storage before production.
TOKENS={}
app.add_middleware(CORSMiddleware,allow_origins=[FRONTEND],allow_credentials=True,allow_methods=['GET','POST'],allow_headers=['*'])

@app.get('/health')
def health(): return {'ok':True,'service':'trade-avata-broker-gateway','configured':bool(CLIENT_ID and CLIENT_SECRET and REDIRECT)}

@app.get('/oauth/ctrader/start')
def ctrader_start(return_to: str = Query(default='')):
    if not (CLIENT_ID and REDIRECT): raise HTTPException(503,'cTrader OAuth is not configured on this server.')
    safe_return=return_to if return_to.startswith(FRONTEND) else FRONTEND
    state=signer.dumps({'return_to':safe_return})
    params={'client_id':CLIENT_ID,'redirect_uri':REDIRECT,'scope':SCOPE,'product':'web','state':state}
    # cTrader may ignore unknown state parameters; return_to is also stored server-side in the signed value.
    url='https://id.ctrader.com/my/settings/openapi/grantingaccess/?'+urlencode(params)
    return RedirectResponse(url)

@app.get('/oauth/ctrader/callback')
async def ctrader_callback(code: str, state: str=''):
    if not (CLIENT_ID and CLIENT_SECRET and REDIRECT): raise HTTPException(503,'Gateway not configured.')
    return_to=FRONTEND
    if state:
        try:return_to=signer.loads(state,max_age=600).get('return_to',FRONTEND)
        except (BadSignature,SignatureExpired):raise HTTPException(400,'Invalid or expired OAuth state.')
    params={'grant_type':'authorization_code','code':code,'redirect_uri':REDIRECT,'client_id':CLIENT_ID,'client_secret':CLIENT_SECRET}
    async with httpx.AsyncClient(timeout=15) as client:
        r=await client.get('https://openapi.ctrader.com/apps/token',params=params,headers={'Accept':'application/json'})
    if r.status_code>=400: raise HTTPException(502,'cTrader token exchange failed.')
    data=r.json()
    if data.get('errorCode'): raise HTTPException(502,data.get('description') or data['errorCode'])
    # Demo placeholder key. In production associate encrypted tokens with authenticated Trade Avata UID.
    TOKENS['preview-owner']={'accessToken':data.get('accessToken'),'refreshToken':data.get('refreshToken'),'expiresIn':data.get('expiresIn')}
    sep='&' if '?' in return_to else '?'
    return RedirectResponse(f'{return_to}{sep}broker=ctrader&oauth=success')

@app.get('/api/broker/status')
def broker_status():
    # Do not expose tokens. Production version must authenticate the Trade Avata user first.
    return {'connected':'preview-owner' in TOKENS,'broker':'cTrader' if 'preview-owner' in TOKENS else None,'mode':'gateway-foundation'}

class AlertTestRequest(BaseModel):
    channel: str
    destination: str = ''
    title: str = 'Trade Avata Alert'
    message: str = 'Your Trade Avata alert test was triggered.'


def _require_test_key(key: str):
    configured=os.getenv('ALERT_TEST_KEY','')
    if not configured or key != configured:
        raise HTTPException(403,'Alert test endpoint is disabled or unauthorized.')

@app.get('/api/alerts/capabilities')
def alert_capabilities():
    return {
        'browser': True,
        'email': bool(os.getenv('SMTP_HOST') and os.getenv('SMTP_FROM')),
        'telegram': bool(os.getenv('TELEGRAM_BOT_TOKEN')),
        'push': False,
        'webhook': False,
        'note': 'Production alert rules must be evaluated server-side against fresh market data.'
    }

@app.post('/api/alerts/test')
async def alert_test(payload: AlertTestRequest, x_trade_avata_test_key: str = Header(default='')):
    _require_test_key(x_trade_avata_test_key)
    if payload.channel == 'telegram':
        token=os.getenv('TELEGRAM_BOT_TOKEN','')
        chat_id=payload.destination or os.getenv('TELEGRAM_DEFAULT_CHAT_ID','')
        if not token or not chat_id:
            raise HTTPException(503,'Telegram is not configured.')
        async with httpx.AsyncClient(timeout=15) as client:
            r=await client.post(f'https://api.telegram.org/bot{token}/sendMessage',json={'chat_id':chat_id,'text':f'{payload.title}\n\n{payload.message}'})
        if r.status_code>=400:
            raise HTTPException(502,'Telegram delivery failed.')
        return {'ok':True,'channel':'telegram'}
    if payload.channel == 'email':
        host=os.getenv('SMTP_HOST',''); sender=os.getenv('SMTP_FROM',''); dest=payload.destination
        if not host or not sender or not dest:
            raise HTTPException(503,'Email is not configured.')
        msg=EmailMessage(); msg['Subject']=payload.title; msg['From']=sender; msg['To']=dest
        msg.set_content(payload.message)
        html_body=(
            '<!doctype html><html><body style="font-family:Arial,sans-serif;background:#07111c;color:#e7f0f8;padding:24px">'
            '<div style="max-width:560px;margin:auto;background:#0d1b29;border:1px solid #24445d;border-radius:10px;padding:24px">'
            '<h2 style="margin-top:0;color:#35b7ff">Trade Avata</h2>'
            f'<h3>{html.escape(payload.title)}</h3><p style="line-height:1.6">{html.escape(payload.message)}</p>'
            '<p style="color:#8fa6ba">Trade Simple.</p></div></body></html>'
        )
        msg.add_alternative(html_body,subtype='html')
        port=int(os.getenv('SMTP_PORT','587')); user=os.getenv('SMTP_USERNAME',''); password=os.getenv('SMTP_PASSWORD','')
        with smtplib.SMTP(host,port,timeout=15) as smtp:
            smtp.starttls()
            if user:
                smtp.login(user,password)
            smtp.send_message(msg)
        return {'ok':True,'channel':'email'}
    raise HTTPException(400,'Unsupported test channel.')

@app.get('/api/replay/bars')
def replay_bars(symbol: str, timeframe: str, start: str='', end: str=''):
    # Intentionally refuse to manufacture market history. Connect a licensed
    # broker/data-provider or cTrader historical-data adapter here.
    raise HTTPException(501,'Online replay market-data provider is not configured on this gateway.')


class AIRequest(BaseModel):
    message: str = Field(min_length=1,max_length=4000)
    context: dict = {}

@app.get('/api/ai/capabilities')
def ai_capabilities():
    return {
        'configured': False,
        'channels': ['indicator','market','quality'],
        'permission_model': 'indicator/market: owner or explicit ai_chat; quality: owner only',
        'voice_note': 'Voice transcription and read-aloud are browser UX features; model prompts still require server authorization.',
        'note': 'Connect authenticated Trade Avata roles and an AI provider before enabling conversational prompts.'
    }

@app.post('/api/ai/{channel}')
async def ai_chat(channel: str, payload: AIRequest):
    if channel not in {'indicator','market','quality'}:
        raise HTTPException(404,'Unknown AI channel.')
    # Production must authenticate the Trade Avata session and reject this request
    # unless the server-side role/entitlement is owner or explicit ai_chat. The quality channel is owner-only.
    # Never trust the browser's hidden/visible UI state for authorization.
    raise HTTPException(501,'Secure AI provider and server-side entitlement check are not configured yet.')
